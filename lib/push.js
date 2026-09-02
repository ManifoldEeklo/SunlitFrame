// Shared push-notification helper. Lives outside /api so Vercel never
// treats it as its own route — it's just a regular module required by
// the actual endpoints (api/send-message.js, api/notify-upload.js).

const USERS_KEY = 'app:users';
const SUBS_KEY_PREFIX = 'push:';

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

// Sends a push notification (title/body) to every subscribed device
// belonging to every user EXCEPT excludeUser. Best-effort: failures for
// one device/user don't affect others. Expired subscriptions (404/410
// from the push service) are pruned automatically. Silently does
// nothing if VAPID isn't configured, so this is always safe to call.
async function sendPushToAllExcept(excludeUser, payload) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!vapidPublic || !vapidPrivate) return;

  const webpush = require('web-push');
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let users = [];
  try {
    const raw = await upstash(['GET', USERS_KEY]);
    users = raw ? JSON.parse(raw) : [];
  } catch (e) {
    return;
  }
  if (!Array.isArray(users)) return;

  const payloadStr = JSON.stringify(payload);

  await Promise.all(users.filter(u => u !== excludeUser).map(async (user) => {
    let subs = [];
    try {
      const raw = await upstash(['GET', SUBS_KEY_PREFIX + user]);
      subs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(subs)) subs = [];
    } catch (e) {
      return;
    }
    if (!subs.length) return;

    const stillValid = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payloadStr);
        stillValid.push(sub);
      } catch (err) {
        const code = err && err.statusCode;
        if (code !== 404 && code !== 410) stillValid.push(sub); // keep unless permanently gone
      }
    }
    if (stillValid.length !== subs.length) {
      try { await upstash(['SET', SUBS_KEY_PREFIX + user, JSON.stringify(stillValid)]); } catch (e) {}
    }
  }));
}

module.exports = { upstash, sendPushToAllExcept };
