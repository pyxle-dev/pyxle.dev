# Demos

Six real Pyxle apps, running now — every one opens a live deployment, and uptime is measured by our own monitor (public API: https://status.pyxle.dev/api/status.json)

- **Today** — username/password todo app: https://today.pyxle.app/
- **pyxle.dev** — this site is itself a Pyxle app, every route a `.pyxl` file: https://pyxle.dev/
- **Chroma** — color palettes computed by Python's `colorsys`: https://chroma.pyxle.app/
- **Pulse** — status page demo with an ISR-cached loader: https://pulse.pyxle.app/
- **Flux** — SaaS analytics dashboard: https://flux.pyxle.app/
- **Glyph** — geometric patterns from `@server` math: https://glyph.pyxle.app/

Human version of this page: https://pyxle.dev/demos

To build your own:

```bash
pip install pyxle-framework
pyxle init my-app
cd my-app && pyxle dev
```

## Learn the basics

- [Quick start](https://pyxle.dev/docs/getting-started/quick-start.md)
- [.pyxl files](https://pyxle.dev/docs/core-concepts/pyxl-files.md)
- [Example applications](https://pyxle.dev/docs/examples.md)

## Related

- Interactive playground: https://pyxle.dev/playground
- Full docs index: https://pyxle.dev/llms.txt
