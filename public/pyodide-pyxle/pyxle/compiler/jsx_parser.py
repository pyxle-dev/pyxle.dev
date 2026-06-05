"""Browser stub of pyxle.compiler.jsx_parser.

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
