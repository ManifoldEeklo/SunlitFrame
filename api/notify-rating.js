// Called by the client right after a rating is confirmed (the rating
// itself is still saved via /api/redis HSET as before — this endpoint
// doesn't touch rating data at all, it only sends the "someone rated a
// photo" push to everyone else).

const { sendPushToAllExcept } = require('../lib/push');

const MAX_NAME_LEN = 30;

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
  const rater = String(body.rater || '').trim().slice(0, MAX_NAME_LEN);
  const owner = String(body.owner || '').trim().slice(0, MAX_NAME_LEN);
  const stars = Number(body.stars);

  if (!rater || !owner || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    res.status(400).json({ error: 'rater, owner, and a 1-5 star rating are required' });
    return;
  }

  try {
    const starText = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    await sendPushToAllExcept(rater, {
      title: 'SummerContest',
      body: `Someone rated ${owner}'s photo ${starText}`,
    });
  } catch (e) {
    // Best-effort only — nothing was being stored here, so nothing to roll back.
  }

  res.status(200).json({ ok: true });
};
