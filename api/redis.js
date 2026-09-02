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

const LIST_COMMANDS = new Set(['RPUSH', 'LRANGE', 'LTRIM']);

// The user roster itself is dynamic now (added/removed via the Admin panel,
// stored under app:users and managed exclusively by api/admin.js — writes
// to that key are intentionally NOT allowed here, only reads). So presence
// keys are validated by shape rather than against a fixed list: it just
// has to look like a reasonable "presence:<name>" heartbeat key.
function isPresenceKeyAllowed(key) {
  if (typeof key !== 'string' || !key.startsWith('presence:')) return false;
  const name = key.slice('presence:'.length);
  return name.length > 0 && name.length <= 30 && !name.includes(':');
}

// GET/SET/DEL: the photo gallery data, each user's presence heartbeat, and
// read-only access to the user roster (writes to app:users go through the
// password-gated /api/admin endpoint instead).
function isDataKeyAllowed(key, cmdName) {
  if (key === INDEX_KEY) return true;
  if (typeof key === 'string' && key.startsWith('photo:')) return true;
  if (isPresenceKeyAllowed(key)) return true;
  if (key === 'app:users' && cmdName === 'GET') return true;
  return false;
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
    const keyOk = isListCmd ? isChatKeyAllowed(key) : isDataKeyAllowed(key, cmdName);
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
