#!/usr/bin/env node
/**
 * build-docs.mjs — Convert Pyxle framework markdown docs into JSON for the website.
 *
 * Reads:  ../pyxle/docs/**\/*.md
 * Writes: public/docs-data/manifest.json     (navigation + search index)
 *         public/docs-data/{category}/{slug}.json  (individual pages)
 *
 * Run:  node scripts/build-docs.mjs
 */

import { marked } from "marked";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, basename, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_SRC = join(__dirname, "..", "..", "pyxle", "docs");
const OUT_DIR = join(__dirname, "..", "public", "docs-data");

// ── Navigation structure (matches docs/README.md ordering) ──────────

const NAV_STRUCTURE = [
  {
    category: "Getting Started",
    slug: "getting-started",
    items: [
      { file: "getting-started/introduction.md", slug: "introduction" },
      { file: "getting-started/installation.md", slug: "installation" },
      { file: "getting-started/quick-start.md", slug: "quick-start" },
      { file: "getting-started/project-structure.md", slug: "project-structure" },
    ],
  },
  {
    category: "Core Concepts",
    slug: "core-concepts",
    items: [
      { file: "core-concepts/pyxl-files.md", slug: "pyxl-files" },
      { file: "core-concepts/routing.md", slug: "routing" },
      { file: "core-concepts/data-loading.md", slug: "data-loading" },
      { file: "core-concepts/server-actions.md", slug: "server-actions" },
      { file: "core-concepts/layouts.md", slug: "layouts" },
    ],
  },
  {
    category: "Guides",
    slug: "guides",
    items: [
      { file: "guides/comparison.md", slug: "comparison" },
      { file: "guides/styling.md", slug: "styling" },
      { file: "guides/head-management.md", slug: "head-management" },
      { file: "guides/caching.md", slug: "caching" },
      { file: "guides/streaming.md", slug: "streaming" },
      { file: "guides/websockets.md", slug: "websockets" },
      { file: "guides/api-routes.md", slug: "api-routes" },
      { file: "guides/middleware.md", slug: "middleware" },
      { file: "guides/plugins.md", slug: "plugins" },
      { file: "guides/environment-variables.md", slug: "environment-variables" },
      { file: "guides/error-handling.md", slug: "error-handling" },
      { file: "guides/client-components.md", slug: "client-components" },
      { file: "guides/security.md", slug: "security" },
      { file: "guides/deployment.md", slug: "deployment" },
      { file: "guides/editor-setup.md", slug: "editor-setup" },
      { file: "guides/for-ai-agents.md", slug: "for-ai-agents" },
      { file: "guides/migration-pyx-to-pyxl.md", slug: "migration-pyx-to-pyxl" },
    ],
  },
  {
    category: "Reference",
    slug: "reference",
    items: [
      { file: "reference/cli.md", slug: "cli" },
      { file: "reference/configuration.md", slug: "configuration" },
      { file: "reference/runtime-api.md", slug: "runtime-api" },
      { file: "reference/client-api.md", slug: "client-api" },
      { file: "reference/plugins-api.md", slug: "plugins-api" },
    ],
  },
  {
    category: "Plugins",
    slug: "plugins",
    items: [
      { file: "plugins/pyxle-db.md", slug: "pyxle-db" },
      { file: "plugins/pyxle-auth.md", slug: "pyxle-auth" },
      { file: "plugins/pyxle-mail.md", slug: "pyxle-mail" },
      { file: "plugins/standards.md", slug: "standards" },
      { file: "plugins/ideas.md", slug: "ideas" },
      { file: "plugins/rfc-plugin-pages.md", slug: "rfc-plugin-pages" },
    ],
  },
  {
    category: "Architecture",
    slug: "architecture",
    items: [
      { file: "architecture/README.md", slug: "README" },
      { file: "architecture/overview.md", slug: "overview" },
      { file: "architecture/pyxl-files.md", slug: "pyxl-files" },
      { file: "architecture/parser.md", slug: "parser" },
      { file: "architecture/compiler.md", slug: "compiler" },
      { file: "architecture/routing.md", slug: "routing" },
      { file: "architecture/dev-server.md", slug: "dev-server" },
      { file: "architecture/ssr.md", slug: "ssr" },
      { file: "architecture/build-and-serve.md", slug: "build-and-serve" },
      { file: "architecture/runtime.md", slug: "runtime" },
      { file: "architecture/cli.md", slug: "cli" },
    ],
  },
  {
    category: "Advanced",
    slug: "advanced",
    items: [
      { file: "advanced/ssr-pipeline.md", slug: "ssr-pipeline" },
      { file: "advanced/compiler-internals.md", slug: "compiler-internals" },
    ],
  },
  {
    category: "FAQ",
    slug: "faq",
    flat: true,
    items: [{ file: "faq.md", slug: "faq" }],
  },
  {
    category: "Changelog",
    slug: "changelog",
    flat: true,
    items: [{ file: "changelog.md", slug: "changelog" }],
  },
];

// ── Search keyword aliases ──────────────────────────────────────────
// Curated synonyms/aliases that point a search query at the right page
// even when the word doesn't appear in the page title or body. Keyed by
// the built page path. This is where search relevance is tuned — add an
// entry when a page has an "obvious" search term that isn't in its prose
// (e.g. the comparison page is titled "Pyxle vs. other frameworks", so
// someone searching "comparison" needs the alias to find it).
const SEARCH_KEYWORDS = {
  "getting-started/introduction": ["intro", "introduction", "what is pyxle", "overview", "getting started"],
  "getting-started/installation": ["install", "setup", "pip install", "requirements", "node", "prerequisites"],
  "getting-started/quick-start": ["quickstart", "tutorial", "first app", "hello world", "scaffold", "pyxle init"],
  "getting-started/project-structure": ["structure", "folders", "directory layout", "pages directory"],
  "core-concepts/pyxl-files": ["pyxl", "file format", "two languages", "colocate", "split"],
  "core-concepts/routing": ["routes", "routing", "dynamic routes", "catch-all", "slug", "params"],
  "core-concepts/data-loading": ["loader", "server loader", "data", "props", "fetch data", "@server"],
  "core-concepts/server-actions": ["action", "mutation", "form", "useaction", "@action", "post", "submit"],
  "core-concepts/layouts": ["layout", "template", "shared ui", "nav bar", "wrapper", "slots"],
  "guides/comparison": ["comparison", "compare", "vs", "versus", "alternatives", "next.js", "nextjs", "fastapi", "flask", "django", "reflex", "streamlit", "nicegui"],
  "guides/styling": ["css", "tailwind", "styles", "styling", "stylesheet"],
  "guides/head-management": ["head", "meta tags", "title", "seo", "open graph", "favicon"],
  "guides/caching": ["cache", "caching", "page cache", "ssr cache", "isr", "incremental static regeneration", "ssg", "static generation", "build --static", "prerender", "revalidate", "stale-while-revalidate", "etag", "invalidate", "redis"],
  "guides/streaming": ["streaming", "stream", "suspense", "renderToPipeableStream", "ttfb", "time to first byte", "shell", "progressive rendering", "loading", "fallback"],
  "guides/websockets": ["websocket", "websockets", "ws", "wss", "realtime", "real-time", "pub/sub", "pubsub", "channel", "room", "broadcast", "useWebSocket", "live", "chat", "socket"],
  "guides/api-routes": ["api", "rest", "json api", "endpoint", "websocket", "starlette"],
  "guides/middleware": ["middleware", "request hook", "auth guard"],
  "guides/plugins": ["plugin", "plugins", "installed apps", "extensions", "packages"],
  "guides/environment-variables": ["env", "environment variables", "secrets", "dotenv", ".env", "config"],
  "guides/error-handling": ["error", "errors", "404", "not found", "exception", "loadererror", "actionerror"],
  "guides/client-components": ["client", "image", "link", "script", "clientonly", "hydration"],
  "guides/security": ["security", "csrf", "cors", "xss", "sanitize"],
  "guides/deployment": ["deploy", "deployment", "production", "hosting", "serve", "build", "ec2", "docker", "cdn", "edge caching"],
  "guides/editor-setup": ["editor", "vscode", "vs code", "lsp", "syntax highlighting", "ide"],
  "guides/for-ai-agents": ["ai", "agents", "claude", "cursor", "copilot", "llm", "coding agent"],
  "reference/cli": ["cli", "commands", "pyxle dev", "pyxle build", "pyxle serve", "terminal"],
  "reference/configuration": ["config", "configuration", "pyxle.config.json", "settings", "options"],
  "reference/runtime-api": ["runtime", "@server", "@action", "loadererror", "actionerror", "decorators"],
  "reference/client-api": ["client api", "hooks", "useaction", "link", "navigate", "form", "head"],
  "plugins/pyxle-db": ["database", "db", "sqlite", "postgres", "postgresql", "mysql", "sql", "orm", "migrations", "transactions", "rows", "placeholders", "pool"],
  "plugins/pyxle-auth": ["auth", "authentication", "login", "sign in", "sessions", "password", "users", "rbac", "permissions", "roles", "api tokens", "bearer", "argon2", "password reset", "email verification", "rate limit", "guards"],
  "plugins/pyxle-mail": ["mail", "email", "smtp", "resend", "transactional", "send", "welcome email", "mailprovider", "console provider", "reply-to"],
  "plugins/standards": ["plugin standards", "directory", "submit plugin", "community plugin", "review", "founding", "quality bar", "naming"],
  "plugins/ideas": ["plugin ideas", "build a plugin", "mail", "email", "storage", "s3", "cache", "redis", "sentry", "stripe", "payments", "jobs", "queue", "feature flags", "oauth", "search"],
  "plugins/rfc-plugin-pages": ["rfc", "phase b", "plugin pages", "plugin routes", "admin", "roadmap", "contribute routes"],
  "architecture/README": ["architecture", "handbook", "internals", "how it works", "design"],
  "changelog": ["changelog", "release notes", "whats new", "what's new", "updates", "versions", "0.4.0"],
  "faq": ["faq", "questions", "help", "troubleshooting", "common questions"],
};

// Site pages (non-docs routes) that docs prose may link to with a
// root-relative href. The renderer validates against this list — a typo'd
// site link fails the build like a broken .md link — and the sitemap is
// generated from the same array, so it can't drift either.
const SITE_PAGES = [
  { path: "/", priority: "1.0" },
  { path: "/docs", priority: "0.9" },
  { path: "/playground", priority: "0.8" },
  { path: "/plugins", priority: "0.8" },
  { path: "/roadmap", priority: "0.8" },
  { path: "/benchmarks", priority: "0.7" },
];

// ── Markdown processing ─────────────────────────────────────────────

/**
 * Slugify a heading's text exactly the way `renderer.heading` below does.
 * Extracted into a standalone function so the pre-pass validation can compute
 * slugs from source markdown without running the full `marked` parser.
 */
function slugifyHeading(text) {
  const tocText = text.replace(/`/g, "");
  return tocText
    .toLowerCase()
    .replace(/[<>()]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Walk a markdown source and return the SET of every in-page anchor target it
 * exposes: the slugs `processMarkdown` generates for headings (same h1-skip and
 * dedup rules) PLUS any explicit `<a id="…">` / `<a name="…">` anchors a doc
 * author hand-placed. Skips fenced code blocks (so a `<div id="root">` inside an
 * example isn't mistaken for an anchor). Used by the build-time link validator
 * to check both cross-page `.md#anchor` and same-page `#anchor` links without
 * parsing with `marked` twice.
 */
function collectPageAnchors(md) {
  const anchors = new Set();
  const slugCounts = {};
  let h1Skipped = false;
  let inFence = false;

  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Explicit hand-placed anchors: <a id="…"> / <a name="…">. marked passes a
    // raw-HTML line straight through, so these become real anchor targets.
    for (const a of line.matchAll(/<a\s+[^>]*?(?:id|name)=["']([^"']+)["']/gi)) {
      anchors.add(a[1]);
    }

    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;

    const depth = m[1].length;
    const text = m[2];

    if (depth === 1 && !h1Skipped) {
      h1Skipped = true;
      continue;
    }

    let slug = slugifyHeading(text);
    if (!slug) continue;
    if (slugCounts[slug]) {
      slugCounts[slug]++;
      slug = `${slug}-${slugCounts[slug]}`;
    } else {
      slugCounts[slug] = 1;
    }
    anchors.add(slug);
  }

  return anchors;
}

/**
 * Resolve a relative `.md` link (as written in a source markdown file) to
 * the absolute path of the target file. Handles `..` and `./` segments.
 *
 * Example:
 *   sourceAbsPath = /.../pyxle/docs/architecture/overview.md
 *   linkHref      = ../guides/error-handling.md
 *   result        = /.../pyxle/docs/guides/error-handling.md
 */
function resolveMdLinkAbs(sourceAbsPath, linkHref) {
  const cleanHref = linkHref.replace(/[#?].*$/, ""); // strip anchor and query
  return resolve(dirname(sourceAbsPath), cleanHref);
}

/** Add IDs to headings, extract TOC entries, and collect outbound .md links. */
function processMarkdown(md, sourceAbsPath, srcUrlByAbsPath) {
  const toc = [];
  const slugCounts = {};
  const outboundLinks = [];

  const renderer = new marked.Renderer();

  let h1Skipped = false;

  renderer.heading = function ({ text, depth, raw: rawHeading }) {
    // Skip the first h1 — we render our own page title in the UI.
    if (depth === 1 && !h1Skipped) {
      h1Skipped = true;
      return "";
    }

    // The `text` parameter is raw markdown text (e.g., "`<Head>`").
    // Strip backticks for display text while keeping the content.
    const tocText = text.replace(/`/g, "");

    let slug = slugifyHeading(text);

    // Ensure slug is not empty.
    if (!slug) {
      slug = "section-" + (toc.length + 1);
    }

    // Deduplicate slugs.
    if (slugCounts[slug]) {
      slugCounts[slug]++;
      slug = `${slug}-${slugCounts[slug]}`;
    } else {
      slugCounts[slug] = 1;
    }

    if (depth === 2 || depth === 3) {
      toc.push({ depth, text: tocText, slug });
    }

    // Convert backtick-wrapped content to <code> tags and escape HTML in heading text.
    const headingHtml = text
      .replace(/`([^`]+)`/g, (_, inner) => `<code>${inner.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`)
      .replace(/^([^<`]*)<(?!code|\/code)([^>]*)>([^<]*)$/g, (m) => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    return `<h${depth} id="${slug}">${headingHtml}</h${depth}>`;
  };

  // Add language class to code blocks for syntax highlighting.
  renderer.code = function ({ text, lang }) {
    const langClass = lang ? ` class="language-${lang}"` : "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<div class="code-block" data-lang="${lang || ""}"><pre><code${langClass}>${escaped}</code></pre></div>`;
  };

  // Convert internal links to /docs/ URLs and record EVERY link so build() can
  // prove it resolves. There are exactly four kinds:
  //   1. Same-page anchor (`#section`)        → must match a heading here.
  //   2. External (`https://`, `mailto:`…)    → passed through untouched.
  //   3. Internal relative `.md` link          → resolved relative to the SOURCE
  //      file and mapped to the target's published URL via `srcUrlByAbsPath`
  //      (so `../changelog.md` → `/docs/changelog`); target + anchor validated.
  //   4. Anything else internal (`../guides/`, `/docs/x`, extensionless)
  //      → REJECTED. The browser resolves these against the current page URL
  //      and they land on a category path with no page — a silent 404. This is
  //      the class the old "only validate `.md`" check let slip through.
  renderer.link = function ({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : '';
    href = href || '';

    // (1) Same-page anchor — validate against THIS page's headings.
    if (href.startsWith('#')) {
      outboundLinks.push({ kind: 'self-anchor', href, text, hash: href.slice(1) });
      return `<a href="${href}"${titleAttr}>${text}</a>`;
    }

    // (2) External / protocol-relative / mailto / tel — pass through.
    if (/^(https?:|\/\/|mailto:|tel:)/i.test(href)) {
      return `<a href="${href}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
    }

    // (3) Internal relative `.md` link — the doc-to-doc convention.
    const mdMatch = href.match(/^([^#?]+)\.md(#[^?]*)?(\?.*)?$/);
    if (mdMatch) {
      const anchor = mdMatch[2] || '';
      const targetAbs = resolveMdLinkAbs(sourceAbsPath, `${mdMatch[1]}.md`);
      const publishedUrl = srcUrlByAbsPath.get(targetAbs);
      // Record the link (with its resolved absolute target) so build() can
      // validate target existence + anchor correctness and fail loudly.
      outboundLinks.push({ kind: 'md', href, text, hash: anchor ? anchor.slice(1) : "", targetAbs });
      // If the target isn't a published page the build fails in build(); emit a
      // best-effort href so the (about-to-be-rejected) output is still valid HTML.
      const docPath = publishedUrl || mdMatch[1].replace(/^(\.\.\/)+/, "");
      return `<a href="/docs/${docPath}${anchor}"${titleAttr}>${text}</a>`;
    }

    // (4) Root-relative link to a known SITE page (/plugins, /benchmarks…).
    // Rendered as-is: same tab, client-router handled. Unknown root paths
    // fall through to (5) and fail the build.
    const sitePath = (href.split('#')[0] || '').replace(/\/$/, '') || '/';
    if (href.startsWith('/') && SITE_PAGES.some((p) => p.path === sitePath)) {
      return `<a href="${href}"${titleAttr}>${text}</a>`;
    }

    // (5) Any other internal link — a directory reference, an absolute
    // `/docs/...` path, or an extensionless relative link. These 404 on the
    // site (categories have no index page). Record so build() rejects it.
    outboundLinks.push({ kind: 'bad-internal', href, text });
    return `<a href="${href || '#'}"${titleAttr}>${text}</a>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: false });
  const html = marked.parse(md);

  return { html, toc, outboundLinks };
}

/**
 * Walk a directory recursively and return absolute paths to every .md file.
 * Used by the pre-pass link validator to enumerate every possible link
 * target, not just files that appear in NAV_STRUCTURE.
 */
function walkMdFilesRecursive(root) {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".md")) out.push(full);
    }
  }
  walk(root);
  return out;
}

/** Extract the first h1 heading as the title. */
function extractTitle(md) {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/`/g, "") : "Untitled";
}

/** Extract first paragraph as description (for SEO). */
function extractDescription(md) {
  // Skip headings and blank lines, find first paragraph.
  const lines = md.split("\n");
  let inParagraph = false;
  let desc = "";
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("```") || line.startsWith("|")) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) break;
      continue;
    }
    if (!trimmed.startsWith("-") && !trimmed.startsWith("*") && !trimmed.startsWith(">")) {
      inParagraph = true;
      desc += (desc ? " " : "") + trimmed;
    }
  }
  return desc.slice(0, 200);
}

/**
 * Build search-friendly text from markdown (strip formatting). The result is
 * stored only in the server-side manifest (never shipped to the client), so we
 * index a generous slice of the body — not just the first paragraph — to make
 * full-text search actually find content that lives deeper in a page.
 */
function extractSearchText(md) {
  return md
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/`[^`]+`/g, "") // remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/#{1,6}\s+/g, "") // remove heading markers
    .replace(/[*_~|>-]/g, "") // remove formatting
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

// ── Build ───────────────────────────────────────────────────────────

function build() {
  console.log("Building docs from:", DOCS_SRC);

  if (!existsSync(DOCS_SRC)) {
    console.error("Docs source not found:", DOCS_SRC);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // Pre-pass: compute the set of in-page anchor targets (heading slugs +
  // explicit <a id> anchors) for every .md file under DOCS_SRC. This lets us
  // validate every `#anchor` a source file emits against the anchors that will
  // actually exist on the target page. We walk the whole source tree (not just
  // NAV_STRUCTURE) so links into a file that exists but isn't yet wired into
  // the nav still get validated.
  const slugsByAbsPath = new Map();
  for (const absPath of walkMdFilesRecursive(DOCS_SRC)) {
    slugsByAbsPath.set(absPath, collectPageAnchors(readFileSync(absPath, "utf-8")));
  }

  // Collected while rendering each file; validated at the end of build().
  const brokenLinks = [];

  const manifest = { nav: [], searchIndex: [], pages: {} };
  const flatPages = []; // for prev/next linking
  const llmsPages = []; // {title,description,category,path,markdown} for llms.txt / llms-full.txt

  // Map every published page's absolute SOURCE path → its published URL path.
  // Used to (a) resolve internal .md links to the correct URL — including links
  // from a sub-page to a flat root page like ../changelog.md → /docs/changelog —
  // and (b) validate that no rendered link points at an unpublished page.
  const srcUrlByAbsPath = new Map();
  for (const section of NAV_STRUCTURE) {
    for (const item of section.items) {
      const abs = join(DOCS_SRC, item.file);
      const url = section.flat ? section.slug : `${section.slug}/${item.slug}`;
      srcUrlByAbsPath.set(abs, url);
    }
  }

  for (const section of NAV_STRUCTURE) {
    mkdirSync(join(OUT_DIR, section.slug), { recursive: true });

    const navSection = {
      category: section.category,
      slug: section.slug,
      items: [],
    };

    for (const item of section.items) {
      const filePath = join(DOCS_SRC, item.file);
      if (!existsSync(filePath)) {
        console.warn(`  SKIP: ${item.file} (not found)`);
        continue;
      }

      const md = readFileSync(filePath, "utf-8");
      const title = extractTitle(md);
      const description = extractDescription(md);
      const { html, toc, outboundLinks } = processMarkdown(md, filePath, srcUrlByAbsPath);
      const searchText = extractSearchText(md);

      // Validate every link this file emits so no rendered docs link 404s:
      //   • bad-internal — not a relative `.md` link → rejected outright.
      //   • self-anchor  — must match a heading on THIS page.
      //   • md           — target must be a PUBLISHED page and any #anchor
      //                    must exist on that target page.
      const selfSlugs = slugsByAbsPath.get(filePath);
      for (const link of outboundLinks) {
        if (link.kind === "bad-internal") {
          brokenLinks.push({
            source: item.file,
            text: link.text,
            href: link.href,
            reason:
              "Internal link is not a relative `.md` link, so it resolves to a /docs path " +
              "with no page (404). Link to a specific `.md` file (e.g. `../guides/comparison.md`), " +
              "or use a full https:// URL for off-site targets.",
          });
          continue;
        }

        if (link.kind === "self-anchor") {
          if (selfSlugs && !selfSlugs.has(link.hash)) {
            const closest = [...selfSlugs]
              .map((s) => ({ s, d: _levenshtein(s, link.hash) }))
              .sort((a, b) => a.d - b.d)
              .slice(0, 3)
              .map((x) => x.s);
            brokenLinks.push({
              source: item.file,
              text: link.text,
              href: link.href,
              reason: `Same-page anchor "#${link.hash}" matches no heading on this page`,
              suggestions: closest,
            });
          }
          continue;
        }

        // kind === "md": target must be a published page, anchor must exist.
        const targetAbs = link.targetAbs;
        if (!srcUrlByAbsPath.has(targetAbs)) {
          const fileExists = slugsByAbsPath.has(targetAbs);
          brokenLinks.push({
            source: item.file,
            text: link.text,
            href: link.href,
            reason: fileExists
              ? `Links to ${relative(DOCS_SRC, targetAbs)}, which exists but is not a published page (add it to NAV_STRUCTURE, or fix the link).`
              : `Target file does not exist: ${relative(DOCS_SRC, targetAbs)}`,
          });
          continue;
        }
        if (!link.hash) continue;
        // Offer close matches so a human (or an agent) can fix a bad anchor
        // quickly based on the build error alone.
        const targetSlugs = slugsByAbsPath.get(targetAbs);
        if (targetSlugs && !targetSlugs.has(link.hash)) {
          const closest = [...targetSlugs]
            .map((s) => ({ s, d: _levenshtein(s, link.hash) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3)
            .map((x) => x.s);
          brokenLinks.push({
            source: item.file,
            text: link.text,
            href: link.href,
            reason: `Anchor "#${link.hash}" not found in ${relative(DOCS_SRC, targetAbs)}`,
            suggestions: closest,
          });
        }
      }

      // "flat" sections (FAQ, Changelog) live at /docs/<slug> with a single
      // page, rather than /docs/<category>/<slug>.
      const pagePath = section.flat
        ? section.slug
        : `${section.slug}/${item.slug}`;

      // Page JSON (include raw markdown for "Copy page" feature)
      const pageData = { title, description, html, toc, path: pagePath, markdown: md };
      const outPath = section.flat
        ? join(OUT_DIR, `${section.slug}.json`)
        : join(OUT_DIR, section.slug, `${item.slug}.json`);
      writeFileSync(outPath, JSON.stringify(pageData));

      // Nav entry
      navSection.items.push({ title, slug: item.slug, path: pagePath });

      // Search index. Includes curated keyword aliases so queries that don't
      // appear in the title/body (e.g. "comparison" for "Pyxle vs. other
      // frameworks") still resolve. The page `path` is also searched by the
      // server (its slug words are tokenized), so "comparison" matches
      // `guides/comparison` directly.
      manifest.searchIndex.push({
        title,
        path: pagePath,
        category: section.category,
        description,
        searchText,
        headings: toc.map((t) => t.text),
        keywords: SEARCH_KEYWORDS[pagePath] || [],
      });

      // For prev/next
      flatPages.push({ title, path: pagePath });

      manifest.pages[pagePath] = { title, category: section.category };

      // For llms.txt / llms-full.txt (llmstxt.org — AI-readable site map).
      llmsPages.push({ title, description, category: section.category, path: pagePath, markdown: md });

      console.log(`  OK: ${pagePath} — "${title}"`);
    }

    manifest.nav.push(navSection);
  }

  // Add prev/next to each page JSON
  for (let i = 0; i < flatPages.length; i++) {
    const pagePath = flatPages[i].path;
    const outPath = pagePath.includes("/")
      ? join(OUT_DIR, ...pagePath.split("/")) + ".json"
      : join(OUT_DIR, pagePath + ".json");

    if (!existsSync(outPath)) continue;
    const data = JSON.parse(readFileSync(outPath, "utf-8"));
    if (i > 0) data.prev = { title: flatPages[i - 1].title, path: flatPages[i - 1].path };
    if (i < flatPages.length - 1) data.next = { title: flatPages[i + 1].title, path: flatPages[i + 1].path };
    writeFileSync(outPath, JSON.stringify(data));
  }

  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  // ── Sitemap ─────────────────────────────────────────────────────
  // Generated here, not hand-maintained: NAV_STRUCTURE is the single
  // source of truth for every URL that churns (the docs catch-all), so
  // the sitemap can never drift from the site again. Hand-edits to
  // public/sitemap.xml will be overwritten by the next docs build.
  const SITE_URL = "https://pyxle.dev";
  const STATIC_PAGES = SITE_PAGES;
  const CATEGORY_PRIORITY = {
    "getting-started": "0.9",
    "core-concepts": "0.8",
    "plugins": "0.8",
    "guides": "0.7",
    "reference": "0.7",
    "architecture": "0.5",
    "advanced": "0.5",
  };
  const sitemapEntries = [
    ...STATIC_PAGES,
    ...flatPages.map((page) => ({
      path: `/docs/${page.path}`,
      priority: CATEGORY_PRIORITY[page.path.split("/")[0]] ?? "0.6",
    })),
  ];
  const sitemap = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...sitemapEntries.map(
      (entry) =>
        `  <url><loc>${SITE_URL}${entry.path}</loc><priority>${entry.priority}</priority></url>`
    ),
    `</urlset>`,
    ``,
  ].join("\n");
  const sitemapPath = join(__dirname, "..", "public", "sitemap.xml");
  writeFileSync(sitemapPath, sitemap);

  // ── llms.txt / llms-full.txt (llmstxt.org) ──────────────────────
  // Pyxle is "AI-first"; this gives coding agents (and LLM-backed search) a
  // clean, link-rich map of the docs without crawling client routes.
  // Regenerated from NAV_STRUCTURE so it can never drift from the site.
  const PUBLIC_DIR = join(__dirname, "..", "public");
  const TAGLINE =
    "Python and React in one file. A Python-first full-stack framework where @server loaders and @action mutations sit beside real React 18 (SSR + hydration) in a single .pyxl file — file-based routing, no API plumbing, no separate front-end build to wire up.";
  const oneLine = (s) => (s || "").replace(/\s+/g, " ").trim();

  const llms = [`# Pyxle`, ``, `> ${TAGLINE}`, ``];
  for (const section of NAV_STRUCTURE) {
    const pages = llmsPages.filter((p) => p.category === section.category);
    if (!pages.length) continue;
    llms.push(`## ${section.category}`, ``);
    for (const p of pages) {
      const note = oneLine(p.description);
      llms.push(`- [${p.title}](${SITE_URL}/docs/${p.path})${note ? `: ${note}` : ""}`);
    }
    llms.push(``);
  }
  llms.push(
    `## More`,
    ``,
    `- [Plugin directory](${SITE_URL}/plugins): official and community plugins`,
    `- [Benchmarks & methodology](${SITE_URL}/benchmarks): reproducible performance numbers`,
    `- [Interactive playground](${SITE_URL}/playground): run Pyxle in the browser`,
    ``
  );
  writeFileSync(join(PUBLIC_DIR, "llms.txt"), llms.join("\n"));

  // Full corpus: every page's markdown inlined, for agents that want it all.
  const full = [
    `# Pyxle — full documentation`,
    ``,
    `> ${TAGLINE}`,
    ``,
    `Every Pyxle documentation page, concatenated. Canonical site: ${SITE_URL}`,
    ``,
    `---`,
    ``,
  ];
  for (const p of llmsPages) {
    full.push(`Source: ${SITE_URL}/docs/${p.path}`, ``, p.markdown.trim(), ``, `---`, ``);
  }
  writeFileSync(join(PUBLIC_DIR, "llms-full.txt"), full.join("\n"));

  console.log(`\nDone: ${flatPages.length} pages, manifest written, sitemap: ${sitemapEntries.length} URLs, llms.txt (${llmsPages.length} pages) + llms-full.txt.`);

  // Fail the build on any link that won't resolve: a doc-to-doc link pointing
  // at an unpublished/nonexistent page, an internal link that isn't a relative
  // `.md` link (directory refs, /docs absolutes — these 404), or an anchor that
  // matches no heading on the target page. This catches the class of bug where
  // a plausible-looking link silently lands nowhere. Each entry includes the
  // source file, link text, href, and (for anchors) closest-matching slugs so
  // the fix is obvious.
  if (brokenLinks.length) {
    // Group by source file for concise output.
    const bySource = {};
    for (const b of brokenLinks) {
      (bySource[b.source] ||= []).push(b);
    }
    console.error(`\n❌ ${brokenLinks.length} broken link(s):\n`);
    for (const [source, entries] of Object.entries(bySource)) {
      console.error(`  ${source} (${entries.length})`);
      for (const e of entries) {
        console.error(`    [${e.text}](${e.href})`);
        console.error(`      → ${e.reason}`);
        if (e.suggestions && e.suggestions.length) {
          console.error(`      suggestions: ${e.suggestions.join(", ")}`);
        }
      }
    }
    console.error(
      "\nFix the anchor or the target heading, then rerun `node scripts/build-docs.mjs`."
    );
    process.exit(1);
  }
}

/**
 * Plain Levenshtein distance for suggesting close slug matches when an
 * anchor link doesn't resolve. Small enough to inline here and avoid
 * adding a dependency for a build-time helper.
 */
function _levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

build();
