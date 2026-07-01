# Plugins

Pyxle ships official plugins and supports community ones. Plugins declare themselves in `pyxle.config.json` and can contribute middleware, services, and startup/shutdown hooks. The live, filterable directory is at https://pyxle.dev/plugins

## Official plugins

- **pyxle-db** — async database access + checksum-tracked migrations. See [pyxle-db docs](https://pyxle.dev/docs/plugins/pyxle-db.md).
- **pyxle-auth** — sessions, OAuth, JWT, and a `useAuth` hook. See [pyxle-auth docs](https://pyxle.dev/docs/plugins/pyxle-auth.md).
- **pyxle-mail** — transactional email (console/SMTP/Resend). See [pyxle-mail docs](https://pyxle.dev/docs/plugins/pyxle-mail.md).

## Build your own

- [Plugins guide](https://pyxle.dev/docs/guides/plugins.md)
- [Plugins API reference](https://pyxle.dev/docs/reference/plugins-api.md)

## Related

- Live plugin directory: https://pyxle.dev/plugins
- Full docs index: https://pyxle.dev/llms.txt
