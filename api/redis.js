// Serverless proxy to Upstash Redis.
// The Upstash REST URL and token live only in Vercel's environment
// variables (Project Settings -> Environment Variables) and are never
// sent to the browser. The client calls this endpoint instead of
// Upstash directly.
//
// For safety, this proxy only forwards a small whitelist of commands
// and only allows them to touch this app's own keys, so it can't be
// used as an open Redis proxy even though the endpoint itself is public.

const ALLOWED_COMMANDS = new Set(['GET', 'SET', 'DEL', 'PING', 'RPUSH', 'LRANGE', 'LTRIM']);
const INDEX_KEY = 'contest:index';
const GROUP_CHAT_KEY = 'chat:group';
const MAX_VALUE_BYTES = 3 * 1024 * 1024; // 3MB safety cap per value
const FIXED_USERS = ['Rune', 'Lander', 'Zoë'];
const VALID_PRESENCE_KEYS = new Set(FIXED_USERS.map(u => 'presence:' + u));

const LIST_COMMANDS = new Set(['RPUSH', 'LRANGE', 'LTRIM']);

// GET/SET/DEL: the photo gallery data, plus each user's presence heartbeat.
function isDataKeyAllowed(key) {
  return key === INDEX_KEY
    || (typeof key === 'string' && key.startsWith('photo:'))
    || VALID_PRESENCE_KEYS.has(key);
}
// RPUSH/LRANGE/LTRIM: only the single shared group chat thread — there's no
// 1:1 messaging, everyone sends to everyone.
function isChatKeyAllowed(key) {
  return key === GROUP_CHAT_KEY;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const command = body.command;

  if (!Array.isArray(command) || command.length === 0) {
    res.status(400).json({ error: 'Invalid command' });
    return;
  }

  const cmdName = String(command[0]).toUpperCase();

  if (!ALLOWED_COMMANDS.has(cmdName)) {
    res.status(403).json({ error: 'Command not allowed' });
    return;
  }

  if (cmdName !== 'PING') {
    const key = command[1];
    const isListCmd = LIST_COMMANDS.has(cmdName);
    const keyOk = isListCmd ? isChatKeyAllowed(key) : isDataKeyAllowed(key);
    if (!keyOk) {
      res.status(403).json({ error: 'Key not allowed' });
      return;
    }
    if (cmdName === 'SET' || cmdName === 'RPUSH') {
      const value = command[2];
      if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
        res.status(413).json({ error: 'Value too large' });
        return;
      }
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars' });
    return;
  }

  try {
    const upstashRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const data = await upstashRes.json();
    res.status(upstashRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
