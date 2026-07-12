# Compare — Pyxle vs Next.js + FastAPI, Reflex, Django

**Real React. Pure Python. No seam.** The industry spent a decade splitting the frontend from the backend, then the next one gluing it back — server components, server actions, type generators, BFF layers, all of it the seam fighting itself. Pyxle was built without one, and every stack is converging on where it already is. The interactive version is at https://pyxle.dev/compare

## The set — the only column that's all the way green

Pyxle is the only stack great at all of it at once. Each mark is defensible against that framework's own docs.

| Capability | Pyxle | Next + FastAPI | Reflex | Django |
|---|:---:|:---:|:---:|:---:|
| Real React — npm-install anything | ● | ● | ○ (wrapped) | — |
| Server logic in Python | ● | ● | ● | ● |
| One service, one deploy | ● | — (two) | ○ | ● |
| No API contract to hand-keep | ● | — | ● | ● |
| Streaming SSR on React 19 | ● | ● | ○ | — |
| One file per feature | ● | — | ● | — |
| AI-native surface (AGENTS.md, `.md` pages, `llms.txt`) | ● | — | — | — |
| **Complete** | **7/7** | 3/7 | 3/7 | 3/7 |

## The tax — one field, four journeys

Follow one field — a search `notes` list — from the database to your component. In a split stack it is re-typed, re-serialized, and re-validated at every border:

- **Next.js + FastAPI** — `Note` → `response_model` → `openapi.json` → `types.gen.ts` → `fetch` → `props` · **6 representations, 3 places to drift**
- **Reflex** — `rx.State` → diff over WebSocket → wrapped var · **3 representations, 1 wrapper**
- **Django** — `QuerySet` → `context` → `template` · **3 representations**
- **Pyxle** — `loader return` → `props` · **1 representation, 0 places to drift**

## The proof — one costume, and it's fast

Real bytes off a real build: the whole `/search?q=in` response is **2,020 bytes** (props shipped once as inert JSON in `<script id="__PYXLE_PROPS__">`, `x-request-id` on the wire); `grep -c 'find_notes' dist/assets/search-*.js` → `0` (server code absent from the client bundle by construction); an invalid `@action` body returns a real Pydantic `422`.

- **~2×** faster dynamic SSR than Next.js, per core
- **2–3×** fewer bytes for the same DOM — no hydration blob
- **1.31×** FastAPI's throughput on database-query pages

Pyxle matches FastAPI on trivial endpoints and pulls ahead on real database work; one flag scales it near-linearly across every core. Raw-JSON microbenchmarks belong to Node routers like Hono — Pyxle is a full framework that renders React and runs your Python, and it's still five figures per core. 0 errors under load · 2,500+ tests · 95% coverage. Full data and losses: https://pyxle.dev/benchmarks.md

## Where this goes

Pyxle is opinionated on purpose — and honest about it. If you'll never write JavaScript, use Reflex. If you need Django's admin, use Django. For everyone building a real React product on a Python brain, Pyxle already does more, in less.

**Shipped in its first year:** streaming SSR, realtime & WebSockets, Pydantic-validated actions, caching/SSG/ISR, observability, background work, image optimization, multi-worker serving, Markdown-native pages.

**Next: Pyxle Cloud** — push a Pyxle app and skip the server story entirely, with AI scaffolding in the mix. In development; the one file becomes one command. See the [roadmap](https://pyxle.dev/roadmap.md).

## Related

- [Full benchmarks](https://pyxle.dev/benchmarks.md)
- [The long-form comparison guide](https://pyxle.dev/docs/guides/comparison.md)
- [Quick start](https://pyxle.dev/docs/getting-started/quick-start.md)
