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
    ],
  },
  {
    category: "Architecture",
    slug: "architecture",
    items: [
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
    items: [{ file: "faq.md", slug: "faq" }],
  },
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
 * Walk a markdown source and return the SET of heading slugs it would
 * produce when rendered via `processMarkdown`. Uses the same h1-skip and
 * dedup rules. Skips headings inside fenced code blocks. Used by the
 * build-time link validator so we don't have to parse with `marked` twice.
 */
function collectHeadingSlugs(md) {
  const slugs = new Set();
  const slugCounts = {};
  let h1Skipped = false;
  let inFence = false;

  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

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
    slugs.add(slug);
  }

  return slugs;
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
function processMarkdown(md, currentCategory = '') {
  const toc = [];
  const slugCounts = {};
  const outboundMdLinks = [];

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

  // Convert internal .md links to /docs/ URLs.
  // Supports both bare links ("foo.md") and anchor-suffixed links
  // ("foo.md#section"). Bare anchors ("#section") and directory
  // references ("../guides/") pass through unchanged.
  renderer.link = function ({ href, title, text }) {
    const mdMatch = href && href.match(/^([^#?]+)\.md(#[^?]*)?(\?.*)?$/);
    if (mdMatch) {
      // Resolve relative .md links to /docs/ paths.
      // e.g., "head-management.md" → "/docs/guides/head-management"
      //       "../guides/error-handling.md" → "/docs/guides/error-handling"
      //       "ssr.md#head-pipeline" → "/docs/architecture/ssr#head-pipeline"
      let docPath = mdMatch[1];
      const anchor = mdMatch[2] || '';
      // Remove leading ../ segments and resolve to flat doc path.
      docPath = docPath.replace(/\.\.\//g, '');
      // If no directory prefix, it's a same-category reference — prepend current category.
      if (!docPath.includes('/') && currentCategory) {
        docPath = `${currentCategory}/${docPath}`;
      }
      // Record the link for post-processing validation.
      outboundMdLinks.push({ href, text, hash: anchor ? anchor.slice(1) : "" });
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="/docs/${docPath}${anchor}"${titleAttr}>${text}</a>`;
    }
    // External or anchor links — pass through.
    const titleAttr = title ? ` title="${title}"` : '';
    const isExternal = href && (href.startsWith('http') || href.startsWith('//'));
    const targetAttr = isExternal ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href="${href || '#'}"${titleAttr}${targetAttr}>${text}</a>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: false });
  const html = marked.parse(md);

  return { html, toc, outboundMdLinks };
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

/** Build search-friendly text from markdown (strip formatting). */
function extractSearchText(md) {
  return md
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/`[^`]+`/g, "") // remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/#{1,6}\s+/g, "") // remove heading markers
    .replace(/[*_~|>-]/g, "") // remove formatting
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

// ── Build ───────────────────────────────────────────────────────────

function build() {
  console.log("Building docs from:", DOCS_SRC);

  if (!existsSync(DOCS_SRC)) {
    console.error("Docs source not found:", DOCS_SRC);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // Pre-pass: compute the set of heading slugs for every .md file under
  // DOCS_SRC. This lets us validate every `.md#anchor` link a source file
  // emits against the actual anchors that will exist on the target page.
  // We walk the whole source tree (not just NAV_STRUCTURE) so links into
  // a file that exists but isn't yet wired into the nav still get validated.
  const slugsByAbsPath = new Map();
  for (const absPath of walkMdFilesRecursive(DOCS_SRC)) {
    slugsByAbsPath.set(absPath, collectHeadingSlugs(readFileSync(absPath, "utf-8")));
  }

  // Collected while rendering each file; validated at the end of build().
  const brokenLinks = [];

  const manifest = { nav: [], searchIndex: [], pages: {} };
  const flatPages = []; // for prev/next linking

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
      const { html, toc, outboundMdLinks } = processMarkdown(md, section.slug);
      const searchText = extractSearchText(md);

      // Validate each .md#hash link emitted by this file against the
      // target file's actual heading slugs.
      for (const link of outboundMdLinks) {
        if (!link.hash) continue; // Bare .md links: target existence is
                                  // validated by the build output layout;
                                  // we only verify anchor correctness here.
        const targetAbs = resolveMdLinkAbs(filePath, link.href);
        const targetSlugs = slugsByAbsPath.get(targetAbs);
        if (!targetSlugs) {
          brokenLinks.push({
            source: item.file,
            text: link.text,
            href: link.href,
            reason: `Target file does not exist: ${relative(DOCS_SRC, targetAbs)}`,
          });
          continue;
        }
        if (!targetSlugs.has(link.hash)) {
          // Offer close matches so a human (or an agent) can fix the link
          // quickly based on the build error alone.
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

      const pagePath =
        section.slug === "faq" ? "faq" : `${section.slug}/${item.slug}`;

      // Page JSON (include raw markdown for "Copy page" feature)
      const pageData = { title, description, html, toc, path: pagePath, markdown: md };
      const outPath =
        section.slug === "faq"
          ? join(OUT_DIR, "faq.json")
          : join(OUT_DIR, section.slug, `${item.slug}.json`);
      writeFileSync(outPath, JSON.stringify(pageData));

      // Nav entry
      navSection.items.push({ title, slug: item.slug, path: pagePath });

      // Search index
      manifest.searchIndex.push({
        title,
        path: pagePath,
        category: section.category,
        description,
        searchText,
        headings: toc.map((t) => t.text),
      });

      // For prev/next
      flatPages.push({ title, path: pagePath });

      manifest.pages[pagePath] = { title, category: section.category };

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
  console.log(`\nDone: ${flatPages.length} pages, manifest written.`);

  // Fail the build if any .md#hash link points at a section that doesn't
  // exist on the target page. This catches the class of bug where a doc
  // author writes a plausible-looking anchor that silently lands nowhere,
  // leaving readers stuck at the top of the page. Each broken entry
  // includes the source file, the link text, the link href, and the
  // closest-matching slugs on the target page so the fix is obvious.
  if (brokenLinks.length) {
    // Group by source file for concise output.
    const bySource = {};
    for (const b of brokenLinks) {
      (bySource[b.source] ||= []).push(b);
    }
    console.error(`\n❌ ${brokenLinks.length} broken anchor link(s):\n`);
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
