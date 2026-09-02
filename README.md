# Sunlit Frames — Vacation Photo Contest

A small static site (`index.html`) plus one serverless function
(`api/redis.js`) that proxies to Upstash Redis. The Upstash token lives
only in Vercel's environment variables — it never reaches the browser.

## 1. Create the Upstash database (free)

1. Go to https://console.upstash.com/ and sign up.
2. Create a Redis database (any nearby region).
3. Open its **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 2. Deploy to Vercel

**Option A — Vercel CLI (fastest)**
```bash
npm install -g vercel
cd sunlit-frames        # this folder
vercel                  # follow the prompts, creates a preview deployment
```

**Option B — Vercel dashboard**
1. Push this folder to a GitHub repo.
2. In https://vercel.com/new, import that repo.
3. Framework preset: "Other" (no build step needed).

## 3. Set the environment variables

In the Vercel dashboard: **Project → Settings → Environment Variables**,
add both, then redeploy (or run `vercel --prod` again):

| Name                          | Value                              |
|-------------------------------|-------------------------------------|
| `UPSTASH_REDIS_REST_URL`      | from the Upstash REST API page      |
| `UPSTASH_REDIS_REST_TOKEN`    | from the Upstash REST API page      |

If using the CLI instead:
```bash
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel --prod
```

## 4. Share the URL

Once deployed, Vercel gives you a URL like `https://sunlit-frames.vercel.app`.
Share that with everyone entering the contest — no file to distribute,
works on any phone or computer, and the Upstash token stays hidden on
the server the whole time.

## How it works

- `index.html` — the whole UI (vanilla JS, no build step, no framework).
- `api/redis.js` — a serverless function that forwards a small whitelist
  of commands to Upstash using the secret token:
  - `GET` / `SET` / `DEL` for `contest:index` and `photo:*` (the photo
    gallery).
  - `RPUSH` / `LRANGE` / `LTRIM` for `chat:group` and `chat:dm:*` (the
    messaging feature) — lists give atomic appends, so two people
    sending at the same instant can't overwrite each other.
- There's no login system — everyone picks from three fixed names
  (**Rune, Lander, Zoë**, set in `FIXED_USERS` near the top of the
  `<script>`), remembered per-device in `localStorage`. Treat the URL
  as semi-private to your group.
- **Messaging**: a chat bubble (bottom-right) opens a panel with a
  Group tab plus a private 1:1 tab per other person. Messages sync via
  polling every 5 seconds, with an immediate refresh whenever the
  panel opens or a tab is switched. Unread messages show a small red
  dot on the bubble and the relevant tab. Chat history per thread is
  capped at the most recent 200 messages.
- Photos are resized/compressed client-side before upload to keep them
  small and fast to sync.
- Registration closes 2026-09-10, winner announced 2026-09-17 — edit
  the `REG_DEADLINE` / `WINNER_DATE` constants near the top of the
  `<script>` in `index.html` to change these.
