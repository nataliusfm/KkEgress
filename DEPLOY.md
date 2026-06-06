# Deploying from your phone 📱

You don't need a terminal. The repo includes config files so hosting platforms
do `npm install` + `npm start` for you automatically. Pick one option below —
**Render is the easiest from a phone.**

The app ships in **demo mode** (`ALLOW_DEV_LOGIN=true`) so you can sign in and
click around immediately, with no Google credentials. Sign in with
`admin@school.edu` to get the Super Administrator account.

---

## Option A — Render (recommended, free)

Uses the included `render.yaml` blueprint.

1. In your mobile browser, go to **https://render.com** and sign up
   (you can use "Sign in with GitHub").
2. Tap **New +** → **Blueprint**.
3. Connect your GitHub and pick the **`nataliusfm/kkegress`** repo.
4. Choose the branch **`claude/school-emergency-drill-system-2jtee`**
   (or `main` once it's merged).
5. Render reads `render.yaml`, shows the service, and fills the env vars for
   you. Tap **Apply** / **Create**.
6. Wait ~2–3 minutes for the build. You'll get a URL like
   `https://school-emergency-drill.onrender.com`.
7. Open it, tap the dev login, enter `admin@school.edu` → you're in.

> Free Render services sleep after ~15 min idle and take ~30 s to wake on the
> next visit. That's normal for the free tier.

---

## Option B — Railway (free trial credit)

Uses the included `Procfile` (auto-detected).

1. Go to **https://railway.app** → sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → pick `nataliusfm/kkegress`.
3. After it builds, open **Variables** and add:
   - `ALLOW_DEV_LOGIN` = `true`
   - `BOOTSTRAP_SUPER_ADMIN` = `admin@school.edu`
   - `JWT_SECRET` = (any long random string)
4. Open **Settings → Networking → Generate Domain** to get a public URL.

---

## Option C — Any Docker host (Fly.io, Cloud Run, …)

A `Dockerfile` is included, so any container platform works. Example (Fly.io):
`fly launch` detects the Dockerfile, then `fly deploy`. Set the same env vars as
above as Fly secrets.

---

## Turning on the real Google integrations later

Demo mode skips Google APIs gracefully. To enable them, add these as
environment variables in your host's dashboard (see `.env.example` for the full
list and `README.md` for how to obtain each):

| Variable | Enables |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Sign-In (then set `ALLOW_DEV_LOGIN=false`) |
| `GOOGLE_MAPS_API_KEY` | Live map |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` + `GOOGLE_SHEETS_SPREADSHEET_ID` | Sheets logging |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Drive photo storage |
| `GOOGLE_PHOTOS_REFRESH_TOKEN` | Google Photos album |
| `SMTP_*` | Email notifications |

---

## ⚠️ A note on data persistence

This build stores data in a JSON file (`data/db.json`). On free/ephemeral hosts
that filesystem resets on each redeploy, so **demo data won't survive restarts**
— perfect for trying it out, not for real records yet. When you're ready for
production I can swap the storage layer for a managed database (Postgres /
Firestore) and attach a persistent disk. Just ask.
