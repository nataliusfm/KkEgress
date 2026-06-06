# 🚨 School Emergency Drill Tracking & Reporting System

A web and mobile‑responsive application for managing, tracking, and reporting
emergency evacuation drills in schools — in real time. School administrators,
emergency coordinators, and teachers can monitor attendance, conditions,
locations, and drill progress on a central dashboard backed by **Google Maps**,
**Google Sheets**, **Google Drive**, and **Google Photos**.

> Stack: **Node.js + Express** backend, **Socket.IO** realtime, vanilla‑JS
> mobile‑responsive PWA frontend. No build step required.

---

## Features

| Area | What it does |
| --- | --- |
| **Roles** | Super Administrator, Emergency Coordinator, Teacher/Team Leader with role‑based permissions |
| **Dashboard** | Live stats (students, staff, teams, evacuated, not‑reported, safe, injured, missing, completion %) + live Google Map |
| **Drills** | Create Fire / Earthquake / Tsunami / Lockdown / Custom drills; Planned → Active → Completed lifecycle |
| **Teacher reporting** | Auto‑filled info, live GPS (auto‑refresh every 30 s), attendance with auto‑calculated missing count, condition reporting, student notes, team photo |
| **Photo handling** | Camera/gallery capture, **client‑side compression to ≤ 200 KB**, preview, GPS + timestamp metadata |
| **Duplicate prevention** | One report per teacher per drill; edit with full **revision history** (original time, last edit, editor) |
| **Real‑time monitor** | Coordinator team‑status table, colour status indicators, auto‑refresh every 15 s |
| **Google Maps** | Live teacher positions, assembly points, school marker, status‑coloured markers |
| **Google Sheets** | Every submission appended to a spreadsheet (17 spec columns) |
| **Google Drive** | Photos stored under `School Emergency Drills/<year>/<Drill Type>/` with the spec file‑naming format |
| **Google Photos** | Compressed team photos uploaded to a dedicated album; URL stored in the sheet |
| **Reports** | Downloadable **PDF** summary (with map snapshot + coordinator comments) and **Excel** export |
| **Notifications** | In‑app + email on drill start, report submitted, missing/injury reported, drill completed |
| **Security** | Google Sign‑In restricted to school email domains, JWT sessions, audit trail |
| **Mobile / offline** | Responsive PWA, GPS + camera support, **offline queue with auto‑sync** when back online |

---

## Quick start

```bash
git clone <repo>
cd KkEgress
npm install
cp .env.example .env        # then edit values (see below)
npm start                   # http://localhost:3000
```

### Try it without Google credentials

For local evaluation you can enable a password‑less developer login:

```bash
ALLOW_DEV_LOGIN=true \
BOOTSTRAP_SUPER_ADMIN=admin@school.edu \
ALLOWED_EMAIL_DOMAINS=school.edu \
npm start
```

Open `http://localhost:3000`, sign in with `admin@school.edu` (becomes Super
Administrator), then add users, assembly points, and start a drill. Maps,
Sheets, Drive, and Photos degrade gracefully until their credentials are set —
the core drill workflow keeps working.

> ⚠️ `ALLOW_DEV_LOGIN` must be `false` in production.

---

## Configuring the Google integrations (real APIs)

All integrations are driven by environment variables in `.env`. See
`.env.example` for the full annotated list.

### 1. Google Sign‑In
1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID**
   (Web application).
2. Set `GOOGLE_CLIENT_ID` (and `GOOGLE_CLIENT_SECRET`).
3. Restrict logins with `ALLOWED_EMAIL_DOMAINS` and bootstrap the first admin
   via `BOOTSTRAP_SUPER_ADMIN`.

### 2. Google Maps
1. Enable the **Maps JavaScript API**.
2. Set `GOOGLE_MAPS_API_KEY` (restrict it to your domain in production).

### 3. Google Sheets + Drive (service account)
1. Create a **service account** and download its JSON key →
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`.
2. Enable the **Sheets API** and **Drive API**.
3. **Share** the target spreadsheet (`GOOGLE_SHEETS_SPREADSHEET_ID`) and the
   Drive root folder (`GOOGLE_DRIVE_ROOT_FOLDER_ID`) with the service account's
   email address (`...@...iam.gserviceaccount.com`).

### 4. Google Photos
The Photos Library API requires **user** OAuth (service accounts are not
supported). Run a one‑time consent flow with the `photoslibrary.appendonly`
scope and put the resulting refresh token in `GOOGLE_PHOTOS_REFRESH_TOKEN`.

### 5. Email notifications (SMTP)
Set `SMTP_*` values. For Gmail, use an app password.

---

## Architecture

```
server/
  index.js            Express app + Socket.IO bootstrap
  config.js           Env‑driven configuration + role/domain helpers
  store.js            JSON‑backed data store (swap for a real DB in prod)
  auth.js             Google ID‑token verification + JWT sessions
  middleware.js       requireAuth / requireRole / audit
  realtime.js         Socket.IO server (JWT‑authed, GPS + live events)
  routes/             auth, admin, drills, reports, exports, notifications
  services/
    google.js         Sheets append, Drive upload, Photos upload
    notifications.js  In‑app (socket) + email notifications
    reports.js        PDF (pdfkit) + Excel (exceljs) generation
    stats.js          Live dashboard statistics
public/               Mobile‑responsive PWA (vanilla JS, no build step)
  js/views/           dashboard, map, report, monitor, drills, reports, admin
  sw.js               Service worker (app‑shell offline cache)
```

### Notes
- The data layer is a small JSON store so the app runs anywhere with zero
  infrastructure. Its API is intentionally narrow — replace `server/store.js`
  with Postgres/Firestore/etc. for production scale without touching routes.
- Image compression to ≤ 200 KB happens **client‑side** (canvas) before upload,
  matching the spec and saving bandwidth on mobile networks.

---

## Testing

```bash
npm test     # node:test unit tests
```

## Security

- Sessions are signed JWTs (`JWT_SECRET`); set a long random value in prod.
- Sign‑in is restricted to configured school domains.
- All submissions, edits, logins, and exports are written to an audit trail
  (visible to admins/coordinators).
