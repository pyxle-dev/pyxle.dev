/**
 * Shared syntax highlighting for Pyxle docs and homepage.
 *
 * Supports: python, pyxl, javascript/jsx/tsx, bash/shell, json, html/xml
 * Returns an array of { text, className } spans for a given line.
 */

const PY_KEYWORDS = new Set([
    'from', 'import', 'async', 'def', 'await', 'return', 'class', 'if', 'elif',
    'else', 'for', 'in', 'while', 'with', 'as', 'try', 'except', 'finally',
    'raise', 'not', 'and', 'or', 'is', 'True', 'False', 'None', 'yield',
    'lambda', 'pass', 'break', 'continue', 'del', 'global', 'nonlocal', 'assert',
]);

const JS_KEYWORDS = new Set([
    'import', 'from', 'export', 'default', 'function', 'const', 'let', 'var',
    'return', 'if', 'else', 'for', 'of', 'in', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'new', 'this', 'class', 'extends', 'super', 'typeof',
    'instanceof', 'throw', 'try', 'catch', 'finally', 'async', 'await', 'yield',
    'true', 'false', 'null', 'undefined', 'void', 'delete',
]);

const BASH_KEYWORDS = new Set([
    'if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'until',
    'case', 'esac', 'in', 'function', 'return', 'exit', 'export', 'source',
    'cd', 'echo', 'sudo', 'apt', 'npm', 'npx', 'pip', 'pip3', 'python', 'python3',
    'node', 'git', 'curl', 'wget', 'mkdir', 'rm', 'cp', 'mv', 'ls', 'cat',
    'pyxle', 'uvicorn', 'gunicorn', 'vite',
]);

/* ── Token colors (Tailwind classes) ─────────────────── */

const C = {
    keyword:    'sh-kw',      // purple
    string:     'sh-str',     // emerald/green
    comment:    'sh-cmt',     // zinc/gray italic
    decorator:  'sh-dec',     // yellow
    func:       'sh-fn',      // blue
    tag:        'sh-tag',     // zinc (angle brackets)
    component:  'sh-comp',    // cyan
    element:    'sh-elem',    // red (html elements)
    attr:       'sh-attr',    // yellow
    brace:      'sh-brc',     // yellow
    property:   'sh-prop',    // cyan
    number:     'sh-num',     // orange
    command:    'sh-cmd',     // green
    flag:       'sh-flg',     // cyan
    plain:      'sh-pl',      // zinc-300
};

/* ── Python highlighter ──────────────────────────────── */

function tokenizePython(line) {
    const tokens = [];
    if (line.trimStart().startsWith('#')) {
        tokens.push({ text: line, cls: C.comment });
        return tokens;
    }
    if (line.trimStart().startsWith('@')) {
        tokens.push({ text: line, cls: C.decorator });
        return tokens;
    }
    let j = 0;
    while (j < line.length) {
        // Strings
        if (line[j] === "'" || line[j] === '"') {
            const q = line[j];
            // Check for triple quotes
            const isTriple = line.slice(j, j + 3) === q + q + q;
            const end = isTriple ? q + q + q : q;
            let s = '';
            const startJ = j;
            j += isTriple ? 3 : 1;
            s = line.slice(startJ, j);
            while (j < line.length) {
                if (!isTriple && line[j] === q) { s += line[j]; j++; break; }
                if (isTriple && line.slice(j, j + 3) === end) { s += end; j += 3; break; }
                if (line[j] === '\\') { s += line[j]; j++; }
                if (j < line.length) { s += line[j]; j++; }
            }
            tokens.push({ text: s, cls: C.string });
            continue;
        }
        // Numbers
        if (/\d/.test(line[j]) && (j === 0 || /[\s=+\-*/(,[\]:]/.test(line[j - 1]))) {
            const m = line.slice(j).match(/^\d[\d._]*/);
            if (m) { tokens.push({ text: m[0], cls: C.number }); j += m[0].length; continue; }
        }
        // Words
        const wm = line.slice(j).match(/^[a-zA-Z_]\w*/);
        if (wm) {
            const w = wm[0];
            if (PY_KEYWORDS.has(w)) {
                tokens.push({ text: w, cls: C.keyword });
            } else if (j > 0 && line.slice(0, j).match(/(def|class)\s+$/)) {
                tokens.push({ text: w, cls: C.func });
            } else {
                tokens.push({ text: w, cls: C.plain });
            }
            j += w.length;
            continue;
        }
        tokens.push({ text: line[j], cls: C.plain });
        j++;
    }
    return tokens;
}

/* ── JavaScript/JSX highlighter ──────────────────────── */

function tokenizeJS(line) {
    const tokens = [];
    if (line.trimStart().startsWith('//')) {
        tokens.push({ text: line, cls: C.comment });
        return tokens;
    }
    let j = 0;
    while (j < line.length) {
        // Strings
        if (line[j] === "'" || line[j] === '"' || line[j] === '`') {
            const q = line[j];
            let s = q; j++;
            while (j < line.length && line[j] !== q) {
                if (line[j] === '\\') { s += line[j]; j++; }
                if (j < line.length) { s += line[j]; j++; }
            }
            if (j < line.length) { s += line[j]; j++; }
            tokens.push({ text: s, cls: C.string });
            continue;
        }
        // JSX tags
        if (line[j] === '<') {
            let tag = '<'; j++;
            if (j < line.length && line[j] === '/') { tag += '/'; j++; }
            tokens.push({ text: tag, cls: C.tag });
            const nm = line.slice(j).match(/^[\w.]+/);
            if (nm) {
                const isComp = nm[0][0] === nm[0][0].toUpperCase() && nm[0][0] !== nm[0][0].toLowerCase();
                tokens.push({ text: nm[0], cls: isComp ? C.component : C.element });
                j += nm[0].length;
            }
            continue;
        }
        if (line[j] === '>' || (line[j] === '/' && j + 1 < line.length && line[j + 1] === '>')) {
            const cl = line[j] === '/' ? '/>' : '>';
            tokens.push({ text: cl, cls: C.tag }); j += cl.length; continue;
        }
        // Braces
        if (line[j] === '{' || line[j] === '}') {
            tokens.push({ text: line[j], cls: C.brace }); j++; continue;
        }
        // Numbers
        if (/\d/.test(line[j]) && (j === 0 || /[\s=+\-*/(,[\]:]/.test(line[j - 1]))) {
            const m = line.slice(j).match(/^\d[\d.]*/);
            if (m) { tokens.push({ text: m[0], cls: C.number }); j += m[0].length; continue; }
        }
        // Words
        const wm = line.slice(j).match(/^[a-zA-Z_$]\w*/);
        if (wm) {
            const w = wm[0];
            if (JS_KEYWORDS.has(w)) tokens.push({ text: w, cls: C.keyword });
            else if (w === 'className') tokens.push({ text: w, cls: C.attr });
            else tokens.push({ text: w, cls: C.plain });
            j += w.length; continue;
        }
        tokens.push({ text: line[j], cls: C.plain }); j++;
    }
    return tokens;
}

/* ── Bash highlighter ────────────────────────────────── */

function tokenizeBash(line) {
    const tokens = [];
    if (line.trimStart().startsWith('#')) {
        tokens.push({ text: line, cls: C.comment }); return tokens;
    }
    let j = 0;
    while (j < line.length) {
        // Strings
        if (line[j] === "'" || line[j] === '"') {
            const q = line[j]; let s = q; j++;
            while (j < line.length && line[j] !== q) { s += line[j]; j++; }
            if (j < line.length) { s += line[j]; j++; }
            tokens.push({ text: s, cls: C.string }); continue;
        }
        // Flags (--flag, -f)
        if (line[j] === '-' && j > 0 && line[j - 1] === ' ') {
            const m = line.slice(j).match(/^--?[\w-]+/);
            if (m) { tokens.push({ text: m[0], cls: C.flag }); j += m[0].length; continue; }
        }
        // Words
        const wm = line.slice(j).match(/^[\w./]+/);
        if (wm) {
            const w = wm[0];
            if (BASH_KEYWORDS.has(w)) tokens.push({ text: w, cls: C.command });
            else tokens.push({ text: w, cls: C.plain });
            j += w.length; continue;
        }
        // Operators
        if (line[j] === '|' || line[j] === '&' || line[j] === ';') {
            tokens.push({ text: line[j], cls: C.keyword }); j++; continue;
        }
        tokens.push({ text: line[j], cls: C.plain }); j++;
    }
    return tokens;
}

/* ── JSON highlighter ────────────────────────────────── */

function tokenizeJSON(line) {
    const tokens = [];
    let j = 0;
    while (j < line.length) {
        // Property keys (quoted before colon)
        if (line[j] === '"') {
            let s = '"'; j++;
            while (j < line.length && line[j] !== '"') {
                if (line[j] === '\\') { s += line[j]; j++; }
                if (j < line.length) { s += line[j]; j++; }
            }
            if (j < line.length) { s += '"'; j++; }
            // Check if followed by `:` → it's a key
            const rest = line.slice(j).trimStart();
            const cls = rest.startsWith(':') ? C.property : C.string;
            tokens.push({ text: s, cls }); continue;
        }
        // Numbers
        if (/[\d-]/.test(line[j])) {
            const m = line.slice(j).match(/^-?\d[\d.]*/);
            if (m) { tokens.push({ text: m[0], cls: C.number }); j += m[0].length; continue; }
        }
        // true/false/null
        const wm = line.slice(j).match(/^(true|false|null)\b/);
        if (wm) { tokens.push({ text: wm[0], cls: C.keyword }); j += wm[0].length; continue; }
        tokens.push({ text: line[j], cls: C.plain }); j++;
    }
    return tokens;
}

/* ── Dispatch ────────────────────────────────────────── */

/* The Python→JS boundary inside a .pyxl file: the first top-level JS import
   (`import X from '...'` — note the quoted source, unlike Python's
   `from x import y`) or `export` statement. Once crossed, the rest of the
   file is the React/JSX half. */
const PYXL_JS_BOUNDARY = /^import\b.*\bfrom\s+['"]|^export\s+(default|function|const|class|async|let|var)\b/;

/**
 * Tokenize a line of code for the given language.
 * Returns an array of { text: string, cls: string } objects.
 */
export function tokenizeLine(line, lang) {
    switch (lang) {
        case 'python': case 'py': return tokenizePython(line);
        case 'javascript': case 'js': case 'jsx': case 'tsx': case 'ts':
            return tokenizeJS(line);
        case 'bash': case 'shell': case 'sh': case 'zsh':
            return tokenizeBash(line);
        case 'json': return tokenizeJSON(line);
        case 'html': case 'xml': return tokenizeJS(line); // reuse JSX for HTML tags
        case 'pyxl':
            // Per-line fallback (block-level uses the stateful tokenizeBlock).
            if (PYXL_JS_BOUNDARY.test(line) || /^\s*<[A-Za-z/]/.test(line)) return tokenizeJS(line);
            return tokenizePython(line);
        default:
            return [{ text: line, cls: C.plain }];
    }
}

/**
 * Tokenize a full block of code. For pyxl, auto-switches between
 * Python and JSX mode at the boundary.
 */
export function tokenizeBlock(code, lang) {
    const lines = code.split('\n');
    let mode = lang === 'pyxl' ? 'python' : lang;
    return lines.map((line) => {
        if (lang === 'pyxl' && mode === 'python' && PYXL_JS_BOUNDARY.test(line)) {
            mode = 'jsx';
        }
        const effectiveLang = lang === 'pyxl' ? mode : lang;
        return tokenizeLine(line, effectiveLang);
    });
}

/* Does this code block contain a .pyxl-style Python→JS boundary? Lets a docs
   block fenced as ```python but holding a React section upgrade to the dual
   pyxl tokenizer so the JSX half highlights correctly. */
export function looksLikePyxl(code) {
    return code.split('\n').some((line) => PYXL_JS_BOUNDARY.test(line));
}

/** CSS class definitions for the syntax highlighting token classes. */
export const HIGHLIGHT_CSS = `
.sh-kw { color: #c084fc; }
.sh-str { color: #6ee7b7; }
.sh-cmt { color: #a1a1aa; font-style: italic; }
.sh-dec { color: #facc15; }
.sh-fn { color: #60a5fa; }
.sh-tag { color: #71717a; }
.sh-comp { color: #22d3ee; }
.sh-elem { color: #f87171; }
.sh-attr { color: #fde047; }
.sh-brc { color: #facc15; }
.sh-prop { color: #22d3ee; }
.sh-num { color: #fb923c; }
.sh-cmd { color: #4ade80; }
.sh-flg { color: #22d3ee; }
.sh-pl { color: #d4d4d8; }
`;

export default { tokenizeLine, tokenizeBlock, HIGHLIGHT_CSS };
