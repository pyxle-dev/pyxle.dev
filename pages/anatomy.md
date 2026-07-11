# The anatomy of a page — how Pyxle works

One `.pyxl` file is Python and React sharing a page. At build time the compiler cuts it into two programs: the Python becomes a server module (it runs only in CPython and never ships), the JSX becomes a browser chunk. This page dissects one real 34-line specimen — `search.pyxl`: one loader with two concurrent queries, one Pydantic-validated `@action`, one React component. Every exhibit below is a real byte from a real response. The interactive version is at https://pyxle.dev/anatomy

## The cut

The compiler writes two artifacts from one file. The server's code is not in the client bundle — by construction, not by discipline:

```
$ pyxle build
$ grep -c 'find_notes\|remember\|SavedSearch' dist/assets/search-*.js
0
```

## The request

The `@server` loader runs in the same process that renders the page — no API hop between data and markup. Every response carries a correlation id, on by default:

```
$ curl -si 'http://127.0.0.1:8123/search?q=ink'
HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
x-request-id: 12f3312fe9c4452c882f27485182cb0d
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
transfer-encoding: chunked
```

## The page, shipped

Real React 19 renders on the server (persistent worker pool); the wire carries finished HTML with the data already in it, plus the loader props once, as inert JSON — no serialized component tree. The specimen's whole document is 1,874 bytes:

```html
<h1>1<!-- --> notes match “<!-- -->ink<!-- -->”</h1>
<ul><li>Ochre ink, mixing notes</li></ul>
<script id="__PYXLE_PROPS__" type="application/json">
  {"data":{"q":"ink","notes":[{"id":3,"title":"Ochre ink, mixing notes"}],"total":1}}
</script>
<link rel="modulepreload" href="/client/dist/assets/search-CXnHMteq.js" />
```

Pages that suspend stream their shell first ([Streaming SSR](https://pyxle.dev/docs/guides/streaming.md)).

## The wake

React hydrates the markup it was given. The page's own chunk is 2.6 KB raw / 1.3 KB gzipped (React rides in a shared, cached chunk). Weighing the build is a CLI flag: `pyxle build --analyze`.

## The round trip

The button calls the Python `@action` like a function. On the wire it's a POST to an endpoint the compiler emitted; the body is validated against the Pydantic model before your code runs:

```
$ curl -s -X POST …/api/__actions/search/save_search -d '{"query": "ink", "max_results": 10}'
{"ok":true,"saved":true}

$ curl -s -X POST … -d '{"max_results": "ten"}'
HTTP/1.1 422 Unprocessable Content
{"ok":false,"error":"Validation failed","fields":{"query":["Field required"],"max_results":["Input should be a valid integer, …"]}}
```

## The receipts

- No hydration blob → the same parity-verified DOM in 2–3× fewer bytes than Next.js (landing page 5.4 KB vs 13.7 KB; 300 rows 145 KB vs 332 KB)
- Persistent render pool → 2.1–2.3× Next.js throughput per core, ~half the median latency
- Compiled actions on ASGI → ahead of FastAPI on query-heavy work; a few % behind on bare JSON
- One flag, every core → `--workers`: ~5× JSON throughput, more on database endpoints

Hono serializes raw JSON faster; we publish that too. 0 errors under sustained load · 2,500+ tests · 95% coverage gate. Full tables and losses: https://pyxle.dev/benchmarks.md

## Related

- [Quick start](https://pyxle.dev/docs/getting-started/quick-start.md)
- [.pyxl files](https://pyxle.dev/docs/core-concepts/pyxl-files.md)
- [Server actions](https://pyxle.dev/docs/core-concepts/server-actions.md)
- [Architecture handbook](https://pyxle.dev/docs/architecture/README.md)
