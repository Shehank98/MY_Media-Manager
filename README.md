# My Media Manager

A self-hosted dashboard to manage **multiple Facebook pages** — write bilingual
(Sinhala + English) posts with AI, publish or schedule them, and track your
reach and engagement over time. Built for AdSpot and any other pages you run.

Everything is stored in **PostgreSQL** and runs on **Railway**.

---

## What it does

- **Multiple pages** — add AdSpot and your other pages; switch between them from the top.
- **AI post writing** — pick a post type, and Google Gemini (free) writes a bilingual post.
- **Branded creative images** — generate a poster-style graphic (your brand colours, headline, and call-to-action) for a post, rendered server-side for free and published as a Facebook photo with the bilingual text as the caption.
- **Publish or schedule** — post now, or auto-publish in 2 days / any time you pick.
- **Analytics** — pull your real page likes, followers, and per-post likes/comments/shares from Facebook, stored so you can see trends.
- **Media-manager advice** — the AI looks at what performed best and tells you what to post next.

> **Note on competitors:** Facebook blocks apps from reading other pages' stats
> through its API, so automatic competitor analysis isn't included. That's a
> Facebook rule, not a limitation of this app.

---

## The 3 free keys you need

| Thing | Where to get it | Cost |
|---|---|---|
| **Facebook Page token** | developers.facebook.com → Graph API Explorer | Free |
| **Gemini API key** | https://aistudio.google.com/app/apikey | Free |
| **Railway account** | https://railway.app | Free trial, then ~$5/mo |

---

## Deploy on Railway (step by step)

1. **Push this repo to GitHub** (your `shehank98/my_media-manager` repo).
2. Go to **railway.app → New Project → Deploy from GitHub repo** and pick this repo.
3. In the project, click **+ New → Database → PostgreSQL**. Railway creates it automatically.
4. Open your **app service → Variables** tab and add:
   - `DATABASE_URL` → set it to `${{Postgres.DATABASE_URL}}` (reference the database).
   - `GEMINI_API_KEY` → paste your free Gemini key.
   - `APP_SECRET` → any long random text (used to encrypt your Facebook tokens).
5. Railway builds and deploys. Open the generated URL — your dashboard is live.
6. Go to the **Settings** tab in the app and add your first page (Page ID + token).

That's it. The app auto-creates its database tables on first start.

---

## Getting a Facebook Page token

1. Go to **developers.facebook.com** → log in.
2. **My Apps → Create App → Business**.
3. **Tools → Graph API Explorer**, and select your page.
4. Add permissions: **`pages_manage_posts`** and **`pages_read_engagement`**.
5. **Generate Access Token** and copy it.
6. Find your **Page ID** at `facebook.com/YOURPAGE/about`.
7. Paste both into the app's **Settings → Add a Page**.

> Tip: generate a **long-lived Page token** so it doesn't expire in a few hours.
> The app verifies the token with Facebook before saving it.

---

## Run it locally (optional, for testing)

```bash
# 1. Install
npm install

# 2. Copy env and fill in values
cp .env.example .env
#   - set DATABASE_URL to a local Postgres
#   - set GEMINI_API_KEY and APP_SECRET

# 3. Build the dashboard
npm run build

# 4. Start
npm start           # serves the app on http://localhost:3000
```

For live-reload frontend dev, run `npm --prefix client run dev` in a second
terminal (it proxies `/api` to the server on port 3000).

---

## How it's built

```
server/                Node + Express API
  index.js             app entry, serves the API + built dashboard
  db.js                Postgres pool + auto-creates tables on startup
  routes/
    pages.js           add / list / update / remove pages (tokens encrypted)
    generate.js        AI post generation + media-manager advice (Gemini)
    posts.js           save drafts, schedule, publish, list with stats
    analytics.js       refresh + summarise page/post stats
  services/
    facebook.js        Facebook Graph API calls (server-side only)
    gemini.js          Google Gemini content generation
    crypto.js          encrypts Facebook tokens before storing
    scheduler.js       auto-publishes due posts + refreshes stats

client/                React (Vite) dashboard — the 5-tab mobile-style UI
```

### Data stored in PostgreSQL

- `pages` — your connected pages (tokens stored **encrypted**).
- `posts` — drafts, scheduled, and published posts.
- `post_stats` / `page_stats` — engagement + follower snapshots over time.

### Security notes

- Facebook tokens are **encrypted at rest** with `APP_SECRET` and never sent to the browser.
- All Facebook and Gemini calls happen **server-side**, so keys stay on the server.
