import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { tokenizeBlock } from './code-highlighter.jsx';

/* useLayoutEffect on the client, useEffect on the server — avoids React's
   "useLayoutEffect does nothing on the server" warning during SSR while
   still restoring the caret synchronously (before paint) on the client. */
const useIsoLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

/* ─────────────────────────────────────────────────────────────
   LivePlayground — the interactive hero.

   Edit a real .pyxl on the left; the React output renders live on
   the right, 100% in the browser with NO server call. ALL execution
   happens inside an isolated, opaque-origin sandbox iframe
   (public/playground/sandbox.html, embedded with
   `sandbox="allow-scripts"` and NO allow-same-origin):

     • The .pyxl is split by the ACTUAL Pyxle parser
       (pyxle.compiler.parser, vendored byte-for-byte) running in
       Pyodide inside a Web Worker — off the main thread, with a
       per-call timeout so a runaway loop is terminated, never freezing
       the page.
     • The `@server` loader + `@action` handlers execute in real CPython
       with the real decorators; module state persists across actions.
     • The JSX half is transformed by Sucrase and rendered with React,
       all inside the sandbox.

   Because the sandbox runs in an opaque origin, user-authored code
   cannot read pyxle.dev cookies / localStorage, cannot touch this page's
   DOM, and cannot make credentialed same-origin requests. The host
   below only sends the source string + the vendored parser files in,
   and receives status out, over postMessage.

   Perf / Lighthouse: NOTHING heavy loads on page load, hover, or when
   switching between examples. The sandbox iframe (and therefore React,
   Sucrase, and the ~10 MB Pyodide) is mounted only when the user first
   EDITS the code. Until then the right pane shows a fully-interactive
   plain-React mirror of the current example (DefaultPreview, or the
   defaultPreview prop), so the ~80% of visitors who never touch the code
   never pay the Pyodide cost.
   ───────────────────────────────────────────────────────────── */

/* Vendored Pyxle parser files (served same-origin) — fetched by the host
   and handed to the sandbox via postMessage, so the sandbox never makes
   a cross-origin request for them. Keep in sync with
   scripts/sync-pyxle-parser.mjs. */
const VENDOR_FILES = [
    'pyxle/__init__.py',
    'pyxle/runtime.py',
    'pyxle/compiler/__init__.py',
    'pyxle/compiler/exceptions.py',
    'pyxle/compiler/jsx_parser.py',
    'pyxle/compiler/parser.py',
];

export const DEFAULT_SOURCE = `# counter.pyxl

# Count lives in Python. The @action
# mutates it on the server (sandboxed here).
count = 0

@server
async def load(request):
    return {"count": count}

@action
async def increment(request):
    global count
    count += 1
    return {"count": count}


import React, { useState } from 'react';
import { useAction } from 'pyxle/client';

export default function Counter({ data }) {
    const [count, setCount] = useState(data.count);
    const increment = useAction('increment');

    async function bump() {
        const res = await increment();
        if (res.ok) setCount(res.count);
    }

    return (
        <div className="card">
            <span className="tag">state lives in Python</span>
            <h1>{count}</h1>
            <p>Each click runs the @action — real Python.</p>
            <button onClick={bump} disabled={increment.pending}>
                {increment.pending ? 'Running…' : 'Increment +'}
            </button>
        </div>
    );
}`;

/* The instant-on default preview — a plain-React mirror of the counter
   that runs with ZERO Pyodide. It's fully interactive (the button counts
   in JS), so the ~80% of visitors who never edit the code still get a
   working demo without ever fetching/booting Python. The moment the user
   edits, the real sandbox boots and takes over (see LivePlayground).
   Renders count=0 on both SSR and the first client render → hydration-safe. */
function DefaultPreview() {
    const [count, setCount] = useState(0);
    return (
        <div className="card">
            <span className="tag">state lives in Python</span>
            <h1>{count}</h1>
            <p>Edit the code → real Python boots.</p>
            <button type="button" onClick={() => setCount((c) => c + 1)}>
                Increment +
            </button>
        </div>
    );
}

/* Fetch the vendored parser files once (same-origin), cached module-wide. */
let _vendorPromise = null;
function fetchVendorFiles() {
    if (!_vendorPromise) {
        _vendorPromise = Promise.all(VENDOR_FILES.map((f) =>
            fetch(`/pyodide-pyxle/${f}`).then((r) => {
                if (!r.ok) throw new Error(`Could not fetch vendored ${f}`);
                return r.text();
            }).then((txt) => [f, txt]),
        )).then((pairs) => Object.fromEntries(pairs));
    }
    return _vendorPromise;
}

function currentTheme() {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/* ── Editor (textarea over highlight overlay) ─────────────────────
   The highlight overlay is produced by `tokenizeBlock`, a pure,
   deterministic function — identical output on the server and on the
   client's first render, so hydration matches byte-for-byte (no
   mismatch, no highlight flash). The real <textarea> sits on top,
   transparent text + visible caret, and stays focusable. */
const INDENT = '    '; // 4 spaces — matches the Python in DEFAULT_SOURCE

function Editor({ value, onChange }) {
    const taRef = useRef(null);
    const preRef = useRef(null);
    const selRef = useRef(null); // [start, end] to restore after a Tab edit

    const syncScroll = () => {
        if (preRef.current && taRef.current) {
            preRef.current.scrollTop = taRef.current.scrollTop;
            preRef.current.scrollLeft = taRef.current.scrollLeft;
        }
    };

    // After a Tab-driven value change re-renders the controlled textarea,
    // React puts the caret at the end — restore the intended selection.
    useIsoLayoutEffect(() => {
        if (selRef.current && taRef.current) {
            const [s, e] = selRef.current;
            taRef.current.setSelectionRange(s, e);
            selRef.current = null;
        }
    });

    // Tab → indent (insert spaces / indent selected lines). Shift+Tab →
    // dedent. Keeps focus in the editor instead of tabbing away.
    const onKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const el = taRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const v = value;
        const lineStart = v.lastIndexOf('\n', start - 1) + 1;

        if (e.shiftKey) {
            // Dedent every line the selection touches (up to one indent
            // each). Extend to the end of the last touched line so a
            // collapsed caret dedents its whole line, not just up to the caret.
            let blockEnd = v.indexOf('\n', end);
            if (blockEnd === -1) blockEnd = v.length;
            const head = v.slice(0, lineStart);
            const block = v.slice(lineStart, blockEnd);
            const tail = v.slice(blockEnd);
            let firstRemoved = 0;
            let totalRemoved = 0;
            const newBlock = block.split('\n').map((line, idx) => {
                const m = line.match(/^( {1,4}|\t)/);
                if (!m) return line;
                if (idx === 0) firstRemoved = m[0].length;
                totalRemoved += m[0].length;
                return line.slice(m[0].length);
            }).join('\n');
            if (totalRemoved === 0) return;
            const ns = Math.max(lineStart, start - firstRemoved);
            selRef.current = [ns, Math.max(ns, end - totalRemoved)];
            onChange(head + newBlock + tail);
            return;
        }

        if (start !== end && v.slice(start, end).indexOf('\n') !== -1) {
            // Multi-line selection → indent each line (skip a trailing
            // empty line so a full-line selection doesn't over-indent).
            const head = v.slice(0, lineStart);
            const block = v.slice(lineStart, end);
            const tail = v.slice(end);
            const lines = block.split('\n');
            const lastEmpty = lines.length > 1 && lines[lines.length - 1] === '';
            const newBlock = lines
                .map((l, i) => (i === lines.length - 1 && lastEmpty ? l : INDENT + l))
                .join('\n');
            const added = INDENT.length * (lastEmpty ? lines.length - 1 : lines.length);
            selRef.current = [start + INDENT.length, end + added];
            onChange(head + newBlock + tail);
        } else {
            // No / single-line selection → insert one indent at the caret.
            const caret = start + INDENT.length;
            selRef.current = [caret, caret];
            onChange(v.slice(0, start) + INDENT + v.slice(end));
        }
    };

    return (
        <div className="relative h-full overflow-hidden font-mono text-[12.5px] leading-[1.7]">
            <pre ref={preRef} aria-hidden="true" className="pointer-events-none absolute inset-0 m-0 overflow-auto whitespace-pre p-4 text-zinc-300">
                <code>
                    {tokenizeBlock(value, 'pyxl').map((toks, i) => (
                        <React.Fragment key={i}>
                            {toks.length === 0 ? ' ' : toks.map((t, j) => <span key={j} className={t.cls}>{t.text}</span>)}
                            {'\n'}
                        </React.Fragment>
                    ))}
                </code>
            </pre>
            <textarea
                ref={taRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                onScroll={syncScroll}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Edit the .pyxl source"
                className="focus-ring absolute inset-0 m-0 block h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 text-transparent caret-emerald-400 outline-none"
                style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
            />
        </div>
    );
}

export function LivePlayground({
    initialSource = DEFAULT_SOURCE,
    fileLabel = 'counter.pyxl',
    paneHeight = 'h-[300px] sm:h-[380px]',
    defaultPreview = null,
} = {}) {
    const [source, setSource] = useState(initialSource);
    const [engineStarted, setEngineStarted] = useState(false); // sandbox booted (first edit only)
    const [sandboxHtml, setSandboxHtml] = useState(null);       // lazily-loaded srcdoc string
    const [iframeLive, setIframeLive] = useState(false);        // sandbox has rendered ≥1 frame
    const [pyStatus, setPyStatus] = useState('idle');           // idle|booting|ready|failed|timeout
    const [ms, setMs] = useState(null);

    // The zero-Pyodide JS preview for the current example (a component).
    // Falls back to the built-in counter for the default source; null means
    // there is no JS mirror for this source, so the engine must boot to show it.
    const DefaultComp = defaultPreview || (initialSource === DEFAULT_SOURCE ? DefaultPreview : null);

    const iframeRef = useRef(null);
    const startedRef = useRef(false);
    const iframeReadyRef = useRef(false);  // sandbox posted 'pg-ready'
    const initSentRef = useRef(false);     // we've sent files + first source
    const vendorRef = useRef(null);
    const latestSrc = useRef(initialSource);
    const timer = useRef(null);

    const postToIframe = useCallback((msg) => {
        const w = iframeRef.current && iframeRef.current.contentWindow;
        if (w) w.postMessage(msg, '*'); // sandbox is opaque-origin → target '*' (data is non-sensitive)
    }, []);

    // Send vendored files + initial source once BOTH the sandbox is ready
    // and the files are fetched (whichever finishes last triggers it).
    const sendInit = useCallback(() => {
        if (!iframeReadyRef.current || !vendorRef.current || initSentRef.current) return;
        initSentRef.current = true;
        postToIframe({ type: 'pg-init', files: vendorRef.current, theme: currentTheme() });
        postToIframe({ type: 'pg-run', source: latestSrc.current });
    }, [postToIframe]);

    const startEngine = useCallback(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        setEngineStarted(true);
        setPyStatus('booting');
        // Lazy-load the sandbox document (a separate chunk) + the vendored
        // parser files. Both only happen on first interaction — never on load.
        import('./playground-sandbox.js')
            .then((m) => setSandboxHtml(m.SANDBOX_HTML))
            .catch(() => setPyStatus('failed'));
        fetchVendorFiles()
            .then((files) => { vendorRef.current = files; sendInit(); })
            .catch(() => setPyStatus('failed'));
    }, [sendInit]);

    // Listen for messages FROM our sandbox only (verified by source).
    useEffect(() => {
        const onMsg = (e) => {
            if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
            const m = e.data;
            if (!m || typeof m !== 'object') return;
            if (m.type === 'pg-ready') { iframeReadyRef.current = true; sendInit(); }
            else if (m.type === 'pg-status') { setPyStatus(m.status); }
            else if (m.type === 'pg-ran') { if (typeof m.ms === 'number') setMs(m.ms); setIframeLive(true); }
            else if (m.type === 'pg-shown') { setIframeLive(true); }
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
    }, [sendInit]);

    // Keep the sandbox's theme in sync with the host's dark/light toggle.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const obs = new MutationObserver(() => {
            if (initSentRef.current) postToIframe({ type: 'pg-theme', theme: currentTheme() });
        });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, [postToIframe]);

    const onChange = useCallback((next) => {
        setSource(next);
        latestSrc.current = next;
        if (!startedRef.current) startEngine();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (initSentRef.current) postToIframe({ type: 'pg-run', source: next });
        }, 300);
    }, [startEngine, postToIframe]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    // Switching examples (parent changes initialSource): load it into the
    // editor. If the sandbox is already warm, re-run there; if it's cold,
    // just show the new example's JS preview — switching examples NEVER boots
    // Pyodide. Only editing the code does.
    useEffect(() => {
        if (initialSource === latestSrc.current) return; // initial mount / no change
        setSource(initialSource);
        latestSrc.current = initialSource;
        if (startedRef.current) postToIframe({ type: 'pg-run', source: initialSource });
    }, [initialSource, postToIframe]);

    // Only force a boot for a cold example we can't mirror in JS (no
    // defaultPreview for a non-default source). With a JS preview present,
    // stay Pyodide-free until the user edits. (startEngine is idempotent.)
    useEffect(() => {
        if (!startedRef.current && DefaultComp == null) startEngine();
    }, [DefaultComp, startEngine]);

    const statusText =
        pyStatus === 'booting' ? 'booting Python (one-time)…'
        : pyStatus === 'failed' ? 'sandbox offline'
        : pyStatus === 'timeout' ? 'stopped — runaway code killed'
        : ms ? `${ms}ms · real Python, sandboxed`
        : 'sandboxed preview · no install';

    // Preview pane has three states: the instant-on JS mirror of the current
    // example (zero Pyodide), the one-time "booting Python…" window, then the
    // live sandbox iframe. Editing the code is what boots Python.
    const showDefault = !engineStarted && DefaultComp != null;
    const showBooting = !iframeLive && !showDefault;

    return (
        // The sandbox (React + Sucrase + ~10 MB Pyodide) mounts lazily on
        // the user's first EDIT — never on page load or hover. Until then
        // the preview is the instant-on JS DefaultPreview below.
        <div className="grid grid-cols-1 sm:grid-cols-2">
            {/* editor */}
            <div className="flex flex-col border-b border-white/5 sm:border-b-0 sm:border-r">
                <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
                    <span className="flex gap-1.5" aria-hidden="true">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/60" />
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/40" />
                    </span>
                    <span className="ml-1 font-mono text-[11px] text-zinc-400">{fileLabel}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                        <span className="h-1 w-1 rounded-full bg-emerald-400" /> edit me
                    </span>
                </div>
                <div className={paneHeight}>
                    <Editor value={source} onChange={onChange} />
                </div>
            </div>

            {/* preview */}
            <div className="flex flex-col bg-white dark:bg-[#0a0a0b]">
                <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-2.5 dark:border-white/5">
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">Preview</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        {pyStatus === 'booting' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
                        {statusText}
                    </span>
                </div>
                <div className={`relative overflow-hidden ${paneHeight}`}>
                    {engineStarted && sandboxHtml && (
                        <iframe
                            ref={iframeRef}
                            srcDoc={sandboxHtml}
                            title="Live Pyxle preview (sandboxed)"
                            sandbox="allow-scripts"
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 h-full w-full border-0 bg-white dark:bg-[#0a0a0b]"
                            style={{ display: iframeLive ? 'block' : 'none' }}
                        />
                    )}
                    {showBooting && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                            </span>
                            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                booting Python… <span className="opacity-60">(one-time, a few seconds)</span>
                            </p>
                        </div>
                    )}
                    {showDefault && (
                        <div className="preview-scope absolute inset-0 overflow-auto p-6">
                            <DefaultComp />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LivePlayground;
