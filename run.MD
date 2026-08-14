# Running EduTask Pro (School Task Management)

This guide covers running the project locally and — the recommended path for
letting a client test it for a month — exposing it on the internet for free
using **Cloudflare Tunnel**, with no port forwarding and no paid hosting.

---

## ⚠️ Important: Windows 7 compatibility note

You mentioned you'll be running this on **Windows 7**. Please read this before
you start, so you don't lose time chasing install errors:

- **Node.js / npm / Vite**: This frontend uses Vite 5 and React 18, which
  require **Node.js 18 or newer**. Official Node.js builds **stopped
  supporting Windows 7 at Node.js 13** (over 5 years ago). This means the
  frontend, *as currently built, cannot officially run on Windows 7* with a
  supported Node version.
- **Python**: Python **3.9+ dropped official Windows 7 support**. Python 3.8
  was the last version Windows 7 was officially supported on. The backend
  itself doesn't need anything newer than 3.8, so this side is fine.
- **PostgreSQL**: Recent PostgreSQL installers (16/17) also no longer support
  Windows 7. PostgreSQL 12–13 still work.

**What this means practically:**

| You want to... | Will it work on Windows 7? |
|---|---|
| Run the **backend** (Flask) on Windows 7 | ✅ Yes, with Python 3.8 |
| Run the **frontend** (Vite/React) on Windows 7 | ❌ Not reliably — Node 18+ isn't supported there |
| **Just view/use** the app from Windows 7 in a browser (app hosted elsewhere) | ✅ Yes — any modern browser works fine |

**Recommendation:** If you have any other machine (or a cheap/free cloud VM,
or even a newer PC/laptop you can borrow for a month) running **Windows 10/11
or Linux**, host the project there and simply *use* Windows 7 as a regular
client to browse the app. That fully satisfies "the client can test it for a
month" without fighting OS-level dependency issues.

If you truly must **host** on Windows 7 itself, you'd need to downgrade to
Node.js 12.x and rebuild the frontend tooling (older Vite/webpack), which is
a bigger, riskier change outside the scope of this file. Everything below
assumes you're hosting from a Windows 10/11 machine (your own PC is fine) and
that Windows 7 is just where someone opens the browser link.

---

## 1. Prerequisites (on the machine that will host the app)

Install these once:

1. **PostgreSQL** — https://www.postgresql.org/download/windows/
2. **Python 3.10+** — https://www.python.org/downloads/
3. **Node.js 18 LTS or 20 LTS** — https://nodejs.org/
4. **Git** (optional, if you're cloning instead of unzipping) — https://git-scm.com/

Verify installs (PowerShell or CMD):
```powershell
python --version
node --version
npm --version
psql --version
```

---

## 2. Backend setup

1. Create the database:
```powershell
psql -U postgres
CREATE DATABASE taskmanager;
\q
```

2. Set up the environment file:
```powershell
cd backend
copy .env.example .env
```
Open `.env` and set at least:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/taskmanager
SECRET_KEY=change-me-super-secret-key
JWT_SECRET_KEY=change-me-jwt-secret-key
```

3. Install dependencies and run migrations:
```powershell
pip install -r requirements.txt
$env:FLASK_APP = "run.py"
python -m flask db upgrade
python -m flask seed
python run.py
```

Backend runs at `http://localhost:5000`.

Demo logins after seeding:
- Chairman: `chairman@school.com` / `chairman123`
- Director: `director@school.com` / `director123`
- More seeded role logins are listed in `password.MD`.

Leave this terminal window running.

---

## 3. Frontend setup

Open a **second** terminal window:
```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and automatically proxies API and
WebSocket calls to the backend on port 5000 — you do **not** need to set
`VITE_API_URL` for local or tunnel use, it's only needed if the backend is on
a different machine/domain than the frontend.

Leave this terminal window running too. At this point, `http://localhost:5173`
works for you on this machine.

---

## 4. (Recommended) Use Your Computer + Cloudflare Tunnel (100% Free)

This is the fastest free way to give your client a real `https://` link they
can open from anywhere — no router config, no port forwarding, no static IP,
no paid hosting. Cloudflare's tunnel makes an outbound-only connection from
your PC, so it works even behind NAT/firewalls.

### Step 1 — Download `cloudflared`
Download the Windows 64-bit `.exe` from:
https://github.com/cloudflare/cloudflared/releases/latest
(grab the file named `cloudflared-windows-amd64.exe`)

Rename it to `cloudflared.exe` and put it somewhere simple, e.g.
`C:\cloudflared\cloudflared.exe`.

### Step 2 — Make sure backend + frontend are already running
From steps 2 and 3 above, you should have:
- Backend running at `http://localhost:5000`
- Frontend running at `http://localhost:5173`

You only need to tunnel the **frontend** (port 5173) — Vite's dev proxy
already forwards `/api`, `/socket.io`, and `/uploads` to the backend
internally, so a single tunnel exposes the whole app.

### Step 3 — Start the tunnel
Open a **third** terminal window:
```powershell
C:\cloudflared\cloudflared.exe tunnel --url http://localhost:5173
```

You'll see output ending with something like:
```
+--------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take a moment to be ready):  |
|  https://myproject.trycloudflare.com                                                 |
+--------------------------------------------------------------------------------------+
```

Send that `https://myproject.trycloudflare.com` link to your client. It works
from any device, anywhere — including from a Windows 7 machine's browser.

> The `frontend/vite.config.ts` in this project has already been updated to
> accept requests coming through `*.trycloudflare.com` (Vite blocks unknown
> hostnames by default as a security measure — this was already fixed for
> you, no action needed).

### Step 4 — Keep it running for the month
- Keep all **three** terminal windows open (backend, frontend, cloudflared)
  and the hosting PC powered on with internet access.
- **Disable sleep/hibernate** on that PC: Control Panel → Power Options →
  "Choose when to turn off display/put computer to sleep" → set both to
  "Never" while testing is active.
- A **quick tunnel** (`--url` flag, no account needed) is free and simple,
  but the address changes every time you stop and restart `cloudflared`.
  For a client testing over a full month, **don't close that terminal** —
  just leave it running continuously and the same URL stays valid.
- If you want a **permanent, stable** address that survives restarts/reboots
  (e.g. `https://school-demo.yourdomain.com`), that requires a free
  Cloudflare account + a domain and a "named tunnel" instead of a quick
  tunnel — let me know if you want those steps too.

### Step 5 (optional but recommended) — allow the tunnel origin explicitly
Even though same-origin requests through the tunnel don't strictly need CORS,
you can add the tunnel URL to the backend's `.env` for extra safety:
```
FRONTEND_URLS=http://localhost:5173,http://127.0.0.1:5173,https://myproject.trycloudflare.com
```
Restart the backend (`python run.py`) after changing `.env`. If your
`trycloudflare.com` link changes on a restart, update this value to match.

---

## 5. requirements.txt — do you need changes?

**No changes were required.** `cloudflared` is a standalone executable, not a
Python package, so nothing needs to be added to
`backend/requirements.txt` to support the tunnel. The existing dependencies
already work fine on Python 3.10+.

---

## 6. Restoring a database backup on another PC (optional)

If you're moving to a fresh machine and have a `.backup` file (see
`Backup/taskmanager.backup`):

1. Install the same or newer PostgreSQL version.
2. Create the empty database:
```powershell
createdb -U postgres taskmanager
```
   (or in pgAdmin: right-click **Databases** → **Create** → **Database**,
   name it `taskmanager`)
3. Restore it:
```powershell
$env:PGPASSWORD = "YOUR_POSTGRES_PASSWORD"
& "C:\Path\To\PostgreSQL\bin\pg_restore.exe" `
  -U postgres `
  -h localhost `
  -p 5432 `
  -d taskmanager `
  -v `
  "C:\Path\To\taskmanager.backup"
```
Replace the two paths and the password with your actual values.

---

## 7. Troubleshooting

- **"Blocked request. This host is not allowed"** in the browser via the
  tunnel URL → make sure you're using the updated `frontend/vite.config.ts`
  from this repo (it already whitelists `.trycloudflare.com`).
- **cloudflared window closes / URL stops working** → the quick tunnel only
  stays alive while that terminal window is open; don't close it, and don't
  let the PC sleep.
- **Client sees a blank page or "can't connect"** → confirm all three
  terminals (backend, frontend, cloudflared) are still running, and that the
  URL was copied exactly, including `https://`.
- **`psql` / `python` / `npm` not recognized** → the installer didn't add it
  to PATH; reopen the terminal after installing, or reinstall and tick "Add
  to PATH".
- **Windows Firewall prompt** when starting `cloudflared.exe` or `python
  run.py` → click "Allow access" (Private networks is enough).
