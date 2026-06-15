# CLAUDE.md — pyxle.dev

This is the official Pyxle marketing site at [pyxle.dev](https://pyxle.dev). It is a real Pyxle application — treat it as a reference implementation of the framework.

---

## Running the Dev Server

```bash
# Kill any existing servers first
pkill -f "pyxle dev" 2>/dev/null; pkill -f "pyxle serve" 2>/dev/null
pkill -f "vite" 2>/dev/null; pkill -f "tailwindcss" 2>/dev/null
sleep 1

# Start the dev server
pyxle dev
```

Opens at http://localhost:8000. Always kill existing servers before starting a new one — stale processes on the same port cause confusing failures.

---

## Project Structure

```
pages/                     # File-based routes
|-- index.pyxl              # Home page (@server loader + @action subscribe)
|-- layout.pyxl             # Root layout (theme context, dark/light toggle)
|-- not-found.pyxl          # Custom 404 page (reusable with backHref/backLabel props)
|-- benchmarks.pyxl         # Benchmark results page
|-- docs/                  # Documentation section
|   +-- [[...slug]].pyxl    # Catch-all docs route with search (@action search_docs)
|-- api/                   # API routes (plain Starlette endpoints)
|   |-- healthz.py         # Health check — GET /api/healthz
|   |-- subscribers.py     # Admin panel — GET /api/subscribers (HTTP Basic Auth)
|   +-- data.py            # Data endpoint
+-- styles/
    +-- tailwind.css       # Tailwind entry point

public/                    # Static assets (served at /)
|-- docs-data/             # GENERATED docs JSON — do not hand-edit (see "Docs are generated")
+-- plugins-registry.json  # Drives the /plugins directory
scripts/build-docs.mjs     # Builds public/docs-data/ from ../pyxle/docs/
db.py                      # Data layer (async, on the pyxle-db plugin)
migrations/                # pyxle-db migrations (schema source of truth)
pyxle.config.json          # Pyxle config (plugins, CSRF exempt paths, edge cache)
```

---

## Key Patterns

### Pyxle Conventions

This site showcases Pyxle best practices:
- `@server` for data loading, `@action` for mutations
- `HEAD` variable for static meta tags
- Tailwind CSS for styling
- File-based routing under `pages/`

### Data Layer (`db.py` + pyxle-db plugin)

- The **pyxle-db plugin** (declared in `pyxle.config.json`) opens `data/pyxle.db`
  at startup and applies `migrations/` (checksum-tracked — never edit an applied
  migration; add a new file).
- `db.py` is the only module that talks to it; all its functions are **async**
  (`await add_subscriber(...)`, `await check_rate_limit(...)`).
- Schema changes go in `migrations/NNNN-slug.sql`, not in code.

### Newsletter Subscription (`pages/index.pyxl`)

1. `@action subscribe_newsletter(request)` validates and stores email via `db.py`
2. Client calls with `useAction("subscribe_newsletter")` from `pyxle/client`
3. Returns `ActionError` for validation failures, JSON for success

### Docs Search (`pages/docs/[[...slug]].pyxl`)

- `@action search_docs` performs server-side search across docs manifest
- Manifest is cached in a Python global (`_manifest_cache`) for performance
- Client uses debounced `useAction` with a `searching` loading state
- Invalid doc slugs render the `NotFoundPage` component with "Back to docs" link

### Docs are generated — NOT authored in this repo

The `/docs` pages are built from the **framework repo's** markdown:
- `scripts/build-docs.mjs` reads `../pyxle/docs/**/*.md` → writes `public/docs-data/*.json` (the nav manifest + per-page JSON that `pages/docs/[[...slug]].pyxl` serves).
- **After changing any framework doc in `pyxle/docs/`, run `node scripts/build-docs.mjs` and redeploy** — otherwise pyxle.dev keeps serving the old generated JSON. A framework-docs change (or a `pyxle-framework` release) alone does **not** update the site.
- Nav order + per-page search keywords are **hardcoded** in `build-docs.mjs`; a brand-new doc must be added there to appear in the sidebar/search.

### Plugins directory (`/plugins`)

`pages/plugins.pyxl` renders `public/plugins-registry.json` (filtered by `tier`). To add an official plugin: add a registry entry, bump the hardcoded "N official plugins ship today" line in `plugins.pyxl`, **and** add its doc to `build-docs.mjs`'s nav.

### Theme System (`pages/layout.pyxl`)

Root layout provides `ThemeContext` with `useTheme()` hook. Theme is stored in `localStorage`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PYXLE_ADMIN_USERNAME` | No | Admin panel username (default: `admin`) |
| `PYXLE_ADMIN_PASSWORD` | **Yes** | Admin panel password. `GET /api/subscribers` returns 401 if unset. |
| `PYXLE_SECRET_KEY` | **Yes (prod)** | Signs CSRF tokens **and** unsubscribe HMAC links. Falls back to a public dev key if unset (forgeable). In prod it's set in the systemd unit. |
| `PYXLE_MAIL_PROVIDER` | No | `console` (default, logs) \| `smtp` \| `resend`. Welcome-email transport. |
| `PYXLE_MAIL_FROM` / `_FROM_NAME` / `_REPLY_TO` | smtp/resend | Sender identity (`hello@mail.pyxle.dev`, reply-to `shivam@pyxle.dev`). |
| `PYXLE_MAIL_RESEND_API_KEY` | resend | Resend API key (secret). |
| `PYXLE_PUBLIC_TURNSTILE_SITE_KEY` | No | Turnstile **site** key — public, **baked into the client bundle at `pyxle build` time**, so it must be in the *build* env or the subscribe form silently skips the bot check. |
| `PYXLE_TURNSTILE_SECRET` | No | Turnstile **secret** — server-side, read per request. Unset ⇒ bot check skipped (local dev). |
| `PYXLE_RESEND_WEBHOOK_SECRET` | No | Svix signing secret for `POST /api/resend-webhook`. Unset ⇒ endpoint fails closed (503). |

Secrets live in the box `.env` (or the systemd unit) and are **never committed**. `pyxle build` *and* `pyxle serve` both load `.env` from the project dir (production mode), so prod env vars go in `pyxle-dev/.env` on the box (it's rsync-excluded, so it persists).

---

## Deployment

Deployed on EC2 behind Cloudflare. See `DEPLOYMENT.md` (gitignored) for credentials.

```bash
pyxle build
pyxle serve --host 127.0.0.1 --port 8000 --skip-build
```

Health check: `GET /api/healthz`. Deploy gotchas:
- The prod `pip install` must upgrade **both** `pyxle-framework` **and** `pyxle-mail` (a runtime dep) — the `DEPLOYMENT.md` one-liner is the source of truth; make sure it lists both.
- `PYXLE_PUBLIC_TURNSTILE_SITE_KEY` must be present at `pyxle build` time (baked into the client bundle); prod reads it from the box `pyxle-dev/.env`.
- After deploying changes to **edge-cached routes** (`/docs/*`, `/plugins`, `/roadmap`, etc. per `pyxle.config.json::cache`), **purge the Cloudflare cache** (or wait the TTL, 1800s) or the old content keeps serving.
- A framework-docs change only reaches `/docs` after `node scripts/build-docs.mjs` regenerates `public/docs-data/` and you redeploy (see "Docs are generated").

---

## Commit and Deploy Rules

- **Always ask for explicit user confirmation before committing.** Show the planned commit message and files, and wait for approval.
- **Always ask for explicit user confirmation before deploying.** Never deploy to production without the user saying to do so.
- **Test changes locally** before committing — run `pyxle dev` and verify in the browser. This site is live at pyxle.dev; broken commits break the public website.

## DO NOT List

- **DO NOT** commit `data/`, `.env`, or `DEPLOYMENT.md`
- **DO NOT** push the local database to production. The local `data/pyxle.db` is test data only — it must NEVER reach EC2. Every rsync/scp targeting prod MUST explicitly exclude `data/`, `local/`, `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `DEPLOYMENT.md`. If you copy the deploy command from `DEPLOYMENT.md`, audit the `--exclude` list first and patch in any missing items before running it. Production DB is the source of truth — flow is prod→local, never local→prod.
- **DO NOT** hardcode secrets — use environment variables
- **DO NOT** break the subscribe flow without testing end-to-end
- **DO NOT** weaken HTTP Basic Auth on the admin panel
- **DO NOT** expose subscriber emails in client code or public endpoints
- **DO NOT** commit or deploy without explicit user confirmation
