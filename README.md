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
add all six, then redeploy (or run `vercel --prod` again):

| Name                          | Value                                              |
|-------------------------------|------------------------------------------------------|
| `UPSTASH_REDIS_REST_URL`      | from the Upstash REST API page                     |
| `UPSTASH_REDIS_REST_TOKEN`    | from the Upstash REST API page                     |
| `ADMIN_PASSWORD`              | a password of your choosing, for the Admin panel   |
| `VAPID_PUBLIC_KEY`            | see "Push notification setup" below                |
| `VAPID_PRIVATE_KEY`           | see "Push notification setup" below — keep secret  |
| `VAPID_SUBJECT`               | `mailto:you@example.com` (any contact address)     |

If using the CLI instead:
```bash
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add ADMIN_PASSWORD
vercel env add VAPID_PUBLIC_KEY
vercel env add VAPID_PRIVATE_KEY
vercel env add VAPID_SUBJECT
vercel --prod
```

None of these are written into the code or the repo — they only exist
as environment variables, so they're not visible to anyone browsing
your source (e.g. if the repo is ever public).

### Push notification setup (VAPID keys)

Push notifications need one cryptographic key pair, generated once.
If you already have a set (e.g. the ones given to you alongside this
project), just use those. To generate your own instead:

```bash
npx web-push generate-vapid-keys
```

This prints a public and a private key — put them in
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` respectively.
`VAPID_PRIVATE_KEY` must stay secret; `VAPID_PUBLIC_KEY` is fine to be
public (the browser needs it to subscribe).

If these two variables aren't set, the app still works completely
normally — messages just won't trigger a push notification, only the
in-app banner while someone has the page open.

## 4. Share the URL

Once deployed, Vercel gives you a URL like `https://sunlit-frames.vercel.app`.
Share that with everyone entering the contest — no file to distribute,
works on any phone or computer, and the Upstash token stays hidden on
the server the whole time.

## How it works

- **Push notifications**: tapping "🔔 Enable notifications" in the
  footer asks the browser for permission, then registers a
  subscription with the server (`api/subscribe.js`). From then on,
  sending a message goes through `api/send-message.js` — the *only*
  path a chat message can be written now (the general proxy no longer
  accepts chat writes, see `api/redis.js` below) — which stores the
  message and pushes a real OS-level notification to everyone else's
  subscribed devices via `web-push`, using the `VAPID_*` environment
  variables. This works even if the app/browser tab isn't open.
  - **iPhone requirement**: iOS only allows web push for sites that
    have been **"Added to Home Screen"** (Share → Add to Home Screen)
    and reopened from that icon — a plain Safari tab cannot receive
    push notifications at all, by Apple's design. The app detects this
    and shows a hint instead of the button until that's done.
  - If `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` aren't set, everything
    else still works fine — just no push, only the in-app banner.
  - `sw.js` is the service worker that actually displays the
    notification and focuses/opens the app when tapped.
  - `manifest.json` + `icons/` make the site installable as a home
    screen app (required for the iOS push requirement above).
- `index.html` — the whole UI (vanilla JS, no build step, no framework).
- `api/redis.js` — a serverless function that forwards a small whitelist
  of commands to Upstash using the secret token:
  - `GET` / `SET` / `DEL` for `contest:index`, `photo:*`, and each
    user's `presence:*` heartbeat, plus read-only `GET` on `app:users`.
  - `LRANGE` (read-only) on `chat:group` — writing a message no longer
    goes through this endpoint at all; see `api/send-message.js`.
- `api/admin.js` — a separate serverless function that manages the user
  roster (`app:users` in Redis). Reading the list is public; adding or
  removing a user requires the admin password, checked **server-side**
  here (never trust a client-only password check). The password itself
  lives only in the `ADMIN_PASSWORD` environment variable (see step 3
  above) — it's never in the code or the repo.
- There's no login system beyond that — people pick their name from
  whatever roster the admin has set up (seeded with **Rune, Lander,
  Zoë, Jurgen** the first time), remembered per-device in
  `localStorage`. Treat the URL as semi-private to your group.
- **Admin panel**: a small "Admin" link at the very bottom of the page
  opens a password-gated screen to add or remove people. Removing
  someone doesn't delete their existing photos or messages — it just
  stops them (or whoever's signed in as them) from picking that name
  again, and if they're currently signed in on a device, that device
  gets signed out immediately.
- **Messaging**: one shared group chat only — there's no 1:1 messaging.
  You can send from a single-line box right in the header (under the
  presence names), or from the floating chat bubble (bottom-right)
  which shows the full history. Messages sync via polling every 3
  seconds, with an immediate refresh whenever the panel opens, and
  again the instant the page regains focus/visibility (mobile browsers
  can pause timers while backgrounded, so this keeps things from
  feeling "missed"). History is capped at the most recent 200 messages.
- **Incoming message banner**: when someone else sends a message and
  you're not already looking at the chat, a bold, fully opaque banner
  drops down from the top of the screen (roughly 20% of the screen
  height, full width) with the logo, sender, and message, plus a short
  two-tone chime. It stays for 3 seconds — tap it to open the chat, or
  let it slide back up on its own.
- **Presence dots**: the three names in the header each show a small
  green/red dot based on a lightweight heartbeat (every 8 seconds,
  considered "online" if seen within the last 20 seconds). This is
  purely cosmetic — it never affects who can send or read messages.
- Photos are resized/compressed client-side before upload to keep them
  small and fast to sync.
- Registration closes 2026-09-10, winner announced 2026-09-17 — edit
  the `REG_DEADLINE` / `WINNER_DATE` constants near the top of the
  `<script>` in `index.html` to change these.
