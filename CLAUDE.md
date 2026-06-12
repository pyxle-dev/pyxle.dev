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
db.py                      # Data layer (async, on the pyxle-db plugin)
migrations/                # pyxle-db migrations (schema source of truth)
pyxle.config.json          # Pyxle configuration (incl. pyxle-db plugin)
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

### Theme System (`pages/layout.pyxl`)

Root layout provides `ThemeContext` with `useTheme()` hook. Theme is stored in `localStorage`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PYXLE_ADMIN_USERNAME` | No | Admin panel username (default: `admin`) |
| `PYXLE_ADMIN_PASSWORD` | **Yes** | Admin panel password. Endpoint returns 401 if unset. |

---

## Deployment

Deployed on EC2 behind Cloudflare. See `DEPLOYMENT.md` (gitignored) for credentials.

```bash
pyxle build
pyxle serve --host 127.0.0.1 --port 8000 --skip-build
```

Health check: `GET /api/healthz`

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
