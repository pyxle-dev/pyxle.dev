# Benchmarks

Reproducible performance numbers for Pyxle, measured off-box (load generator on a separate machine) against comparable frameworks. The live, interactive results with full methodology are at https://pyxle.dev/benchmarks

## What they show

- Pyxle is the fastest Python full-stack framework in the suite, and #1 of 7 on form POST throughput.
- Server-side rendering runs roughly 2.3–4.3× faster than Next.js on equivalent pages (the gap is largest for API-through-app rendering).
- Throughput scales with `pyxle serve --workers N` across CPU cores.

The numbers are honest and reproducible — the harness, hardware, and raw results are documented on the benchmarks page. We don't inflate them; where a setup was unfair we fixed the setup rather than the chart.

## Related

- Live benchmarks + methodology: https://pyxle.dev/benchmarks
- [Build optimization](https://pyxle.dev/docs/guides/build-optimization.md)
- [Deployment and multi-core serving](https://pyxle.dev/docs/guides/deployment.md)
- [How Pyxle compares to other frameworks](https://pyxle.dev/docs/guides/comparison.md)
