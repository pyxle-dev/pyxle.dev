# Roadmap

Where Pyxle is headed. The live, always-current roadmap is at https://pyxle.dev/roadmap

Pyxle is in active beta (`0.x`). Three sections: what's done, what's in progress, what's upcoming.

## What's done

Every entry is released and documented. Follow a version to its [changelog](https://pyxle.dev/docs/changelog.md) entry for the detail.

- **The one-file core** — the `.pyxl` format: async loader, server actions, and the React component in a single file, server-rendered and hot-reloading, with file-based routing. (v0.1–0.2)
- **Plugins, realtime & the nav cache** — plugins declared in `pyxle.config.json` wire services, middleware, and their own schema at startup; WebSocket endpoints and the client navigation cache landed alongside. (v0.3)
- **The production story** — edge caching with per-route TTLs, sanitized production errors, layout loaders, and live route-shape changes with no restarts. (v0.4)
- **Multi-core serving & a security wave** — `pyxle serve --workers N` runs an independent server per core; HEAD output moved behind a sanitising allowlist. (v0.4.3)
- **The depth release** — Pydantic-validated actions with OpenAPI output, streaming SSR through `<Suspense>`, caching with SSG and ISR, WebSocket pub/sub, background work, built-in observability, a Next.js-parity `<Image>`, a rate limiter, and a type-aware JSX side. (v0.5)
- **Your app, in Markdown** — every page answers at its URL with `.md` appended, or to an `Accept: text/markdown` request, plus a generated `/llms.txt` index. (v0.6)
- **The hardened run** — React 19 and Vite 7 in new projects, concurrent streaming SSR with per-request isolation, a calmer dev server, shadcn/ui wired end to end. (v0.7)
- **Studio & the debugger** — a dev-only dashboard at `/__pyxle/studio` built into `pyxle dev`, and breakpoints that bind on both sides of a `.pyxl` file at once, with tracebacks that name your source. (v0.8)
- **Official plugins on PyPI** — `pyxle-db`, `pyxle-auth` and `pyxle-mail`, every plugin tested in CI. (plugins 0.2)
- **Benchmarks in the open** — reproducible two-box benchmarks against six frameworks, with the losses shown next to the wins.

## What's in progress

- **The founding plugin cohort** — the first five community plugins meeting the published standards are recognised as ecosystem pioneers. [Claim a spot](https://pyxle.dev/plugins.md)
- **RFC: plugin routes & pages** — the Phase B design discussion for plugins shipping their own API endpoints, then whole pages. [Read the RFC](https://pyxle.dev/docs/plugins/rfc-plugin-pages.md)

## What's upcoming

Planned and intended, in rough order — undated on purpose.

- **Plugins ship API routes (Phase B1)** — `pyxle-auth` providing its own sign-in endpoints; webhook plugins owning their URLs.
- **Plugins ship pages (Phase B2)** — sign-in screens, dashboards, and eventually an admin panel.
- **Capability contracts** — framework-defined interfaces for mail, storage and cache, so providers are swappable by config rather than code.
- **The ecosystem quests** — the plugins the ideas page calls for. [Browse the ideas](https://pyxle.dev/docs/plugins/ideas.md)
- **TypeScript, all the way through** — writing `.tsx` directly in your `.pyxl`, with loader-data types generated from the Python side.
- **The component inspector** — click an element and jump to the `.pyxl` that rendered it, plus a bundle-size treemap.
- **Deeper editor tooling** — diagnostics, completions and go-to-definition across the Python/JSX boundary.
- **The Pyxle blog** — engineering notes and honest write-ups.
- **1.0 — the stability line** — when minor versions stop being allowed to break you. It lands when the plugin API has proven itself, not on a date.
- **Pyxle Cloud** — managed hosting from the people who write the framework. In development.

## Related

- Live roadmap: https://pyxle.dev/roadmap
- [Changelog](https://pyxle.dev/docs/changelog.md)
- [Plugin directory](https://pyxle.dev/plugins.md)
- Full docs index: https://pyxle.dev/llms.txt
