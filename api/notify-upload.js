// Called by the client right after a photo upload succeeds (storage of
// the photo itself still goes through /api/redis as before — this
// endpoint doesn't touch photo data at all, it only sends the "someone
// uploaded a photo" push to everyone else).

const { sendPushToAllExcept } = require('../lib/push');

const MAX_USERNAME_LEN = 30;

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
  const username = String(body.username || '').trim().slice(0, MAX_USERNAME_LEN);
  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }

  try {
    await sendPushToAllExcept(username, {
      title: 'SummerContest',
      body: `${username} has uploaded a nice picture 📸`,
    });
  } catch (e) {
    // Best-effort only — nothing was being stored here to begin with, so
    // there's nothing to roll back. Just report it happened.
  }

  res.status(200).json({ ok: true });
};
