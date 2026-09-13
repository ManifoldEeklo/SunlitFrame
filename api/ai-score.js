// Scores photos for creativity/beauty using Claude's vision API, purely as
// a fun supplementary "AI's pick" badge — this NEVER reads, writes, or
// blends with the human star ratings (rating:<id> hashes) in any way.
//
// Admin-gated (same ADMIN_PASSWORD as api/admin.js) since each call costs
// real money via the Anthropic API. Processes a small batch per call
// (default 4 photos) rather than everything at once, so a single request
// can't run long enough to hit a serverless function timeout — the client
// calls this repeatedly until nothing is left to score.

const INDEX_KEY = 'contest:index';
const AI_SCORES_KEY = 'ai-scores';
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 10;

async function upstash(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function getAllScores() {
  const raw = await upstash(['GET', AI_SCORES_KEY]);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}
async function saveAllScores(map) {
  await upstash(['SET', AI_SCORES_KEY, JSON.stringify(map)]);
}

async function scorePhotoWithClaude(dataUrl, apiKey) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!match) throw new Error('Unrecognized image data');
  const mediaType = match[1];
  const base64Data = match[2];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          {
            type: 'text',
            text: 'Rate this vacation photo for creativity and beauty on a scale from 1 to 10 (one decimal place is fine). If the photo includes a person, add a small bonus to the score (people make a vacation contest more fun) — keep it modest and realistic, not automatic top marks. Then write a short, playful, wholesome caption of 5 words or fewer describing the main subject or scene (a person\'s activity/mood, an animal, flowers, a landscape feature, etc.) — describe what they\'re doing or the scene itself, never a person\'s looks or appearance. Respond with ONLY compact JSON and nothing else — no markdown, no code fences, no extra commentary — in exactly this shape: {"score": 7.5, "note": "five words or fewer"}',
          },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Anthropic API error');
  let text = (data.content || []).map(b => b.text || '').join('').trim();
  // Models sometimes wrap JSON in a markdown code fence even when told not
  // to — strip that before parsing rather than letting it fail silently.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Salvage what we can instead of throwing away the caption entirely —
    // this is what was previously causing captions to go missing whenever
    // the response wasn't perfectly clean JSON.
    const scoreMatch = text.match(/"score"\s*:\s*([\d.]+)/i) || text.match(/([\d.]+)/);
    const noteMatch = text.match(/"note"\s*:\s*"([^"]*)"/i);
    parsed = {
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      note: noteMatch ? noteMatch[1] : '',
    };
  }
  const score = Number(parsed.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : null,
    note: String(parsed.note || '').slice(0, 80),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars' });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: 'Server is missing the ADMIN_PASSWORD environment variable.' });
    return;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    res.status(500).json({ error: 'Server is missing the ANTHROPIC_API_KEY environment variable — add one from console.anthropic.com to use AI scoring.' });
    return;
  }

  const body = req.body || {};
  if (body.password !== adminPassword) {
    res.status(401).json({ error: 'Incorrect admin password' });
    return;
  }

  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(body.batchSize) || DEFAULT_BATCH_SIZE));

  try {
    const rawIndex = await upstash(['GET', INDEX_KEY]);
    const index = rawIndex ? JSON.parse(rawIndex) : [];

    // Re-scoring everything is simplest as "wipe, then start fresh": if the
    // client asks for a reset, clear ai-scores first so every photo looks
    // unscored again — no need to track which ones were already redone in
    // this run, the normal "fill in whatever's unscored" logic below just
    // handles it naturally from a clean slate.
    if (body.resetFirst) {
      await saveAllScores({});
    }

    const scores = await getAllScores();
    const unscored = index.filter(p => !scores[p.id]);
    const toScore = unscored.slice(0, batchSize);

    const results = [];
    for (const photo of toScore) {
      try {
        const dataUrl = await upstash(['GET', 'photo:' + photo.id]);
        if (!dataUrl) continue;
        const { score, note } = await scorePhotoWithClaude(dataUrl, anthropicKey);
        if (score !== null) {
          scores[photo.id] = { score, note, owner: photo.owner, scoredAt: Date.now() };
          results.push({ id: photo.id, owner: photo.owner, score, note });
        }
      } catch (e) {
        results.push({ id: photo.id, owner: photo.owner, error: String((e && e.message) || e) });
      }
    }

    if (toScore.length) await saveAllScores(scores);

    const remaining = unscored.length - toScore.length;
    res.status(200).json({
      ok: true,
      results,
      remaining,
      totalPhotos: index.length,
      scoredSoFar: Object.keys(scores).length,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
