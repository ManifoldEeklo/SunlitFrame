// The only way a chat message gets written now (the general /api/redis
// proxy no longer accepts RPUSH/LTRIM on chat:group — see that file).
// Routing all sends through here means every message can also trigger a
// push notification fan-out to everyone else's subscribed devices.
//
// Storing the message always happens first and is the part that must
// succeed. Sending pushes is best-effort: if VAPID isn't configured, or a
// particular device's push fails, the message itself still saves fine —
// people just won't get a push for it.

const { upstash, sendPushToAllExcept } = require('../lib/push');

const GROUP_CHAT_KEY = 'chat:group';
const CHAT_HISTORY_LIMIT = 200;
const MAX_TEXT_LEN = 500;
const MAX_FROM_LEN = 30;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars' });
    return;
  }

  const body = req.body || {};
  const from = String(body.from || '').trim().slice(0, MAX_FROM_LEN);
  const text = String(body.text || '').trim().slice(0, MAX_TEXT_LEN);

  if (!from || !text) {
    res.status(400).json({ error: 'from and text are required' });
    return;
  }

  const msg = {
    id: from + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    from,
    text,
    ts: Date.now(),
  };

  try {
    await upstash(['RPUSH', GROUP_CHAT_KEY, JSON.stringify(msg)]);
    await upstash(['LTRIM', GROUP_CHAT_KEY, '-' + CHAT_HISTORY_LIMIT, '-1']);
  } catch (e) {
    res.status(500).json({ error: 'Failed to store message: ' + ((e && e.message) || e) });
    return;
  }

  // Don't let push failures affect the response — the message is already saved.
  try {
    await sendPushToAllExcept(from, { title: from, body: text });
  } catch (e) { /* best-effort */ }

  res.status(200).json({ ok: true, message: msg });
};
