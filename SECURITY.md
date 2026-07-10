# Security Policy

This repository is the source of **pyxle.dev** — the Pyxle marketing site and
documentation, itself built with Pyxle.

## Reporting a vulnerability

**Please do not open a public issue for security reports.** Public disclosure
before a fix is available puts users at risk.

Report privately through either channel:

- **GitHub private advisory (preferred):** [Report a vulnerability](https://github.com/pyxle-dev/pyxle.dev/security/advisories/new)
- **Email:** **security@pyxle.dev**

Please include the affected page or endpoint, a description of the issue and its
impact, and steps to reproduce. You will get an acknowledgement within **72
hours**.

## Scope notes

- Vulnerabilities in the **pyxle.dev site itself** (the newsletter/subscribe
  flow, reaction and click counters, the playground endpoint, content
  injection) are in scope.
- A vulnerability in the **Pyxle framework** that the site merely exercises
  belongs in the [`pyxle`](https://github.com/pyxle-dev/pyxle/security/advisories/new)
  repository — please report it there so the fix ships to all users.
- Please do not run automated scanners against the live site in a way that
  degrades it for others; a proof of concept against a local build is ideal.
