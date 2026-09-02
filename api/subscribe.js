// Stores/removes push subscriptions per username, so api/send-message.js
// knows where to deliver push notifications. A person can have more than
// one subscription (e.g. phone + another device), capped at a small number
// per user to keep things bounded.

const SUBS_KEY_PREFIX = 'push:';
const MAX_SUBS_PER_USER = 6;
const MAX_USERNAME_LEN = 30;

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
  const action = body.action;
  const username = String(body.username || '').trim().slice(0, MAX_USERNAME_LEN);
  const subscription = body.subscription;

  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }
  if (action !== 'save' && action !== 'remove') {
    res.status(400).json({ error: 'Unknown action' });
    return;
  }

  const key = SUBS_KEY_PREFIX + username;

  try {
    const raw = await upstash(['GET', key]);
    let subs = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) subs = parsed;
      } catch (e) { /* ignore malformed existing data */ }
    }

    if (action === 'save') {
      if (!subscription || typeof subscription.endpoint !== 'string') {
        res.status(400).json({ error: 'subscription required' });
        return;
      }
      subs = subs.filter(s => s && s.endpoint !== subscription.endpoint); // de-dupe same device
      subs.push(subscription);
      if (subs.length > MAX_SUBS_PER_USER) subs = subs.slice(subs.length - MAX_SUBS_PER_USER);
    } else {
      const endpoint = subscription && subscription.endpoint;
      subs = endpoint ? subs.filter(s => s && s.endpoint !== endpoint) : [];
    }

    await upstash(['SET', key, JSON.stringify(subs)]);
    res.status(200).json({ ok: true, count: subs.length });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
