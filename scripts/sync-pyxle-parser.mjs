#!/usr/bin/env node
/**
 * sync-pyxle-parser.mjs — vendor the REAL Pyxle parser for the in-browser
 * playground (Pyodide).
 *
 * The landing-page hero runs the user's .pyxl through the actual Pyxle
 * parser inside Pyodide, so the split + loader detection are *exactly*
 * what the framework does. This script copies the canonical
 * `pyxle/compiler/parser.py` + `exceptions.py` byte-for-byte from the
 * sibling `pyxle` repo into `public/pyodide-pyxle/…`, and writes:
 *   • empty `__init__.py` package stubs (so the relative imports resolve)
 *   • a stub `jsx_parser.py` — the real one shells out to a Node/Babel
 *     subprocess (impossible in Pyodide) only to scan <Head>/<Script>/
 *     <Image>; the playground doesn't use that metadata, so the stub
 *     returns an empty result and `parser.py` stays untouched.
 *
 * Re-run after upgrading pyxle so the vendored parser matches what ships.
 *
 *   node scripts/sync-pyxle-parser.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..', '..', 'pyxle', 'pyxle');        // sibling pyxle package
const SRC = join(PKG, 'compiler');
const OUT_PKG = join(__dirname, '..', 'public', 'pyodide-pyxle', 'pyxle');
const OUT = join(OUT_PKG, 'compiler');

if (!existsSync(join(SRC, 'parser.py'))) {
    console.error(`✗ Cannot find pyxle compiler source at: ${SRC}`);
    console.error('  Expected the sibling pyxle repo at ../pyxle. Aborting.');
    process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// 1. Real, byte-for-byte compiler sources.
for (const f of ['parser.py', 'exceptions.py']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    writeFileSync(join(OUT, f), src);
    console.log(`  copied  pyxle/compiler/${f}  (${src.length} bytes)`);
}

// 1b. Real, byte-for-byte runtime (zero-dep) — gives the loader the
//     actual @server / @action / ActionError when we exec it.
{
    const rt = readFileSync(join(PKG, 'runtime.py'), 'utf8');
    writeFileSync(join(OUT_PKG, 'runtime.py'), rt);
    console.log(`  copied  pyxle/runtime.py  (${rt.length} bytes)`);
}

// 2. Empty package stubs so `pyxle` / `pyxle.compiler` import cleanly
//    without pulling the heavy framework __init__ (runtime, etc.).
writeFileSync(join(OUT, '..', '__init__.py'), '');
writeFileSync(join(OUT, '__init__.py'), '');
console.log('  wrote   pyxle/__init__.py + pyxle/compiler/__init__.py (stubs)');

// 3. Browser stub for the Node/Babel-dependent jsx scanner.
const JSX_STUB = `"""Browser stub of pyxle.compiler.jsx_parser.

The real module shells out to a Node/Babel subprocess to scan JSX for
<Head>/<Script>/<Image> usages. That cannot run inside Pyodide (no Node,
no subprocess), and the live playground does not need that metadata — it
only uses the parser's Python/JSX split + loader detection. This stub
returns an empty, error-free result so pyxle.compiler.parser (the actual
splitter) stays byte-for-byte identical to what Pyxle ships.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class JSXComponent:
    name: str
    props: dict
    children: "str | None"
    self_closing: bool
    line: "int | None"
    column: "int | None"


@dataclass(frozen=True)
class JSXParseResult:
    components: tuple
    error: "str | None"


def parse_jsx_components(jsx_code, *, target_components=None):
    return JSXParseResult(components=(), error=None)
`;
writeFileSync(join(OUT, 'jsx_parser.py'), JSX_STUB);
console.log('  wrote   pyxle/compiler/jsx_parser.py (browser stub)');

console.log('\n✓ Vendored Pyxle parser → public/pyodide-pyxle/');
