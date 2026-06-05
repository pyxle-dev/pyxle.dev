#!/usr/bin/env node
/**
 * build-playground-sandbox.mjs — embed the playground sandbox document.
 *
 * The live playground executes user code inside an isolated, opaque-origin
 * iframe. We deliver that iframe via `srcdoc` (not a served URL) so it works
 * identically in dev and prod with no server route — pyxle's dev proxy treats
 * *.html as navigations, so a static public/ file would 404, and a srcdoc
 * iframe still gets an opaque origin from the `sandbox` attribute.
 *
 * `srcdoc` needs the HTML as a JS string. This script reads the readable
 * source (`playground-sandbox.html`) and writes it, JSON-escaped (the only
 * safe embedding — the document contains backticks and backslashes), into a
 * lazily-imported module:
 *
 *   pages/components/playground-sandbox.js  →  export const SANDBOX_HTML = "..."
 *
 * Re-run after editing playground-sandbox.html:
 *
 *   node scripts/build-playground-sandbox.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'playground-sandbox.html');
const OUT = join(__dirname, '..', 'pages', 'components', 'playground-sandbox.js');

const html = readFileSync(SRC, 'utf8');

const banner =
    '/* GENERATED — do not edit by hand.\n' +
    '   Source: playground-sandbox.html\n' +
    '   Rebuild: node scripts/build-playground-sandbox.mjs\n\n' +
    '   The isolated, opaque-origin sandbox document for the live playground,\n' +
    '   embedded as a string so the iframe can load it via srcdoc. */\n';

writeFileSync(OUT, banner + 'export const SANDBOX_HTML = ' + JSON.stringify(html) + ';\n');

console.log(`✓ wrote pages/components/playground-sandbox.js (${html.length} chars of HTML)`);
