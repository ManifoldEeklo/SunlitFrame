// Returns the VAPID public key so the browser can subscribe to push.
// This key is meant to be public (it's the whole point of the VAPID
// public/private split) — only the private key, which never leaves
// api/send-message.js, needs to stay secret.

module.exports = async (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(500).json({ error: 'Server is missing the VAPID_PUBLIC_KEY environment variable.' });
    return;
  }
  res.status(200).json({ publicKey: key });
};
