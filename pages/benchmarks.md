# Benchmarks

Reproducible performance numbers for Pyxle, measured off-box (load generator on a separate machine) against comparable frameworks. The live, interactive results with full methodology are at https://pyxle.dev/benchmarks

## What they show

- Dynamic server-side rendering runs ~2.1–2.3× faster than Next.js on equivalent pages (per core), shipping the same DOM in 2–3× fewer bytes and at roughly half the median latency.
- On API throughput Pyxle runs shoulder to shoulder with FastAPI — a few percent behind on trivial endpoints (JSON, health, single-row read) and ahead once real work appears (multi-query pages and form POST).
- Raw serialization belongs to the ultralight Node routers (Hono clears 200k+ req/s on JSON) — a workload with no rendering, no Python, and no framework overhead to carry.
- Throughput scales near-linearly with `pyxle serve --workers N`, out-scaling FastAPI on every endpoint in the suite.

The numbers are honest and reproducible — the harness, hardware, framework versions, and raw results are documented on the benchmarks page, and the workloads Pyxle loses are shown alongside the wins. We don't inflate them; where a setup was unfair we fixed the setup rather than the chart.

## Related

- Live benchmarks + methodology: https://pyxle.dev/benchmarks
- [Build optimization](https://pyxle.dev/docs/guides/build-optimization.md)
- [Deployment and multi-core serving](https://pyxle.dev/docs/guides/deployment.md)
- [How Pyxle compares to other frameworks](https://pyxle.dev/docs/guides/comparison.md)
