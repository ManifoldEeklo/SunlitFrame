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
- `api/redis.js` — a serverless function that forwards only `GET` /
  `SET` / `DEL` / `PING` commands, and only for this app's own keys
  (`contest:index` and `photo:*`), to Upstash using the secret token.
- Each person's name is remembered in their own browser (`localStorage`)
  — there's no login system, so treat the URL as semi-private to your
  group.
- Photos are resized/compressed client-side before upload to keep them
  small and fast to sync.
- Registration closes 2026-09-10, winner announced 2026-09-17 — edit
  the `REG_DEADLINE` / `WINNER_DATE` constants near the top of the
  `<script>` in `index.html` to change these.
