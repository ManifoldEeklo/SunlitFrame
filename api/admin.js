// Admin endpoint for managing the roster of allowed usernames.
// Reading the list ("list" action) is public, same trust level as the rest
// of the app. Adding/removing a user requires the admin password, checked
// here on the server — never trust a client-side-only password check.
//
// NOTE: This is a simple shared password for a small private group app,
// not real authentication. It stops casual tampering, not a determined
// attacker who could read the client source. Don't reuse this password
// anywhere sensitive.

const ADMIN_PASSWORD = 'Admin123';
const USERS_KEY = 'app:users';
const DEFAULT_USERS = ['Rune', 'Lander', 'Zoë', 'Jurgen'];
const MAX_USERNAME_LEN = 30;
const MAX_USERS = 30;

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

async function getUsers() {
  const raw = await upstash(['GET', USERS_KEY]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}
async function setUsers(list) {
  await upstash(['SET', USERS_KEY, JSON.stringify(list)]);
}
async function getUsersOrSeed() {
  const existing = await getUsers();
  if (existing) return existing;
  const seeded = DEFAULT_USERS.slice();
  await setUsers(seeded);
  return seeded;
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

  try {
    if (action === 'list') {
      const users = await getUsersOrSeed();
      res.status(200).json({ users });
      return;
    }

    if (action === 'verify') {
      if (body.password !== ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Incorrect admin password' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'add' || action === 'remove') {
      if (body.password !== ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Incorrect admin password' });
        return;
      }
      const name = String(body.username || '').trim().slice(0, MAX_USERNAME_LEN);
      if (!name) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      let users = await getUsersOrSeed();

      if (action === 'add') {
        if (users.includes(name)) {
          res.status(200).json({ users, note: 'already exists' });
          return;
        }
        if (users.length >= MAX_USERS) {
          res.status(400).json({ error: 'Too many users' });
          return;
        }
        users = [...users, name];
      } else {
        users = users.filter(u => u !== name);
      }

      await setUsers(users);
      res.status(200).json({ users });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
