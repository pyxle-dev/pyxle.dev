# Compare — Pyxle vs Next.js + FastAPI, Reflex, Django

Every stack has a seam: the place where your data becomes your interface. This page traces one real field — a search `notes` list — through four stacks, counting the representations it wears crossing from server to browser. Where another stack is the better choice, we say so at full size. The interactive version is at https://pyxle.dev/compare

## The field

A real Pyxle loader produces the data. In Pyxle the returned dict **is** the component's props — the field arrives having changed nothing:

```python
@server
async def load(request):
    q = request.query_params.get("q", "ink")
    notes, total = await asyncio.gather(find_notes(q), count_notes(q))
    return {"q": q, "notes": notes, "total": total}   # this dict IS the props
```

## Four journeys — the chain of custody for one field

Every station is a real artifact from that stack's own vocabulary:

- **Next.js + FastAPI** — `Note` → `response_model` → `openapi.json` → `types.gen.ts` → `fetch` → `props` · **6 representations, 3 places to drift**
- **Reflex** — `rx.State` → diff over WebSocket → wrapped var · **3 representations, 1 wrapper to cross**
- **Django** — `QuerySet` → `context` → `template` · **3 representations, types end at the template**
- **Pyxle** — `loader return` → `props` · **1 representation, 0 places to drift**

## The dossiers — when to choose them instead

- **Next.js + FastAPI.** A schema on each side and a generated client between them ([FastAPI response_model](https://fastapi.tiangolo.com/tutorial/response-model/), [openapi-typescript](https://github.com/drwpow/openapi-typescript)). The gold standard, and a hard boundary that scales cleanly to large teams who want it. **Use them instead when** you have a large team that wants the split, frontend/backend deploy on different cadences, or maximum ecosystem maturity outweighs the seam.
- **Reflex.** Whole app in pure Python, state on the server over WebSocket, compiled to React ([rx.State](https://reflex.dev/docs/state/overview/)). Genuinely compelling. **Use them instead when** "zero JavaScript, ever" is a hard requirement — Pyxle asks you to write JSX.
- **Django.** Its seam is nearly as short as ours (`QuerySet → context → template`); the difference is the far shore — types end at the template, and a real component model means bolting on a SPA. **Use them instead when** you're building content/CRUD at scale and the ORM + admin does most of your work.
- **NiceGUI / Streamlit.** Different job, superb at it. If you're building an internal tool or an ML dashboard, use them.

## The receipt — real captured bytes

- **The whole document:** the real `/search?q=in` response is **2,020 bytes**; props ship once as inert JSON in `<script id="__PYXLE_PROPS__">`; `x-request-id` on the wire.
- **The split, proven:** `grep -c 'find_notes|remember|SavedSearch' dist/assets/search-*.js` → `0`. Server code is absent from the client bundle by construction; the page's own chunk is 2.6 KB / 1.3 KB gzip.
- **The seam under fire:** `POST /api/__actions/search/save_search` with a valid body → `{"ok":true,"saved":true}`; an invalid body → `422 {"fields":{"query":["Field required"], "max_results":["Input should be a valid integer, …"]}}`. Pydantic guards the only crossing.

On parity-verified pages this seam serves 2.1–2.3× Next.js throughput per core at ~half the median latency, shipping the same DOM in 2–3× fewer bytes (5.4 KB vs 13.7 KB landing; 145 KB vs 332 KB for 300 rows). API work sits at rough FastAPI parity on trivial endpoints and ahead on real work (1.12× / 1.31× / 1.11×). Hono and raw Node beat everyone at pure JSON — we don't claim that crown. 0 errors under load · 2,500+ tests · 95% coverage. Full data and losses: https://pyxle.dev/benchmarks.md

## Where Pyxle loses

No TSX authoring yet · no first-class test client · no automatic image/font byte-optimization · no built-in i18n · pre-1.0 APIs that may move. None blocks shipping a real app; if one is your load-bearing wall today, the dossiers above told you where to go.

## The sixty-second verdict

1. Big team that wants the hard boundary → **Next.js + FastAPI**
2. Zero JavaScript, ever → **Reflex**
3. Content and CRUD on mature batteries → **Django**
4. Internal tool or data dashboard → **NiceGUI / Streamlit**
5. Python brain, real React hands, one file, one deploy → **Pyxle**

## Related

- [Full benchmarks](https://pyxle.dev/benchmarks.md)
- [The long-form comparison guide](https://pyxle.dev/docs/guides/comparison.md)
- [Quick start](https://pyxle.dev/docs/getting-started/quick-start.md)
