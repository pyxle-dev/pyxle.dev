/* ═══ DOCS-QUICK-OPEN — ⌘K "find in the manual" ══════════════════════
 *
 * The find-in-file pane over the whole listing (its chrome lives in
 * styles/docs.css: Sheet pane, 1px ink border, scrim, no shadow). A
 * client component in the strict sense: it renders nothing until the
 * user opens it (so it has zero SSR/hydration surface), and its index
 * is the docs manifest the page loader already shipped — no server
 * round-trip per keystroke, results are instant.
 *
 * Matching is the prototype's subsequence fuzzy over
 * title + category + path, extended with the manifest's curated
 * keyword aliases (so "comparison" typos still find "Pyxle vs. other
 * frameworks"). Deep full-text search stays where it lives:
 * /api/docs-search, the machine companion.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from 'pyxle/client';
import { NN } from './docs-chrome.jsx';

/* Subsequence fuzzy score — substring wins, word starts score extra,
   shorter haystacks break ties. −1 = no match. (Prototype-identical.) */
export function fuzzyScore(q, s) {
    q = q.toLowerCase();
    s = s.toLowerCase();
    const sub = s.indexOf(q);
    if (sub >= 0) return 1000 - sub - s.length * 0.01;
    let si = 0;
    let score = 0;
    let run = 0;
    for (const ch of q) {
        const at = s.indexOf(ch, si);
        if (at < 0) return -1;
        score += at === si ? (run += 3) : (run = 1);
        if (at === 0 || s[at - 1] === ' ' || s[at - 1] === '/' || s[at - 1] === '-') score += 6;
        si = at + 1;
    }
    return score - s.length * 0.01;
}

/**
 * rows: the flattened listing — [{ title, path, category, line, k }]
 * (k = curated search keywords from the docs manifest).
 */
export function QuickOpen({ open, onClose, rows }) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const results = useMemo(() => {
        const query = q.trim();
        if (!query) return rows;
        return rows
            .map((r) => [fuzzyScore(query, `${r.title} ${r.category} ${r.path} ${r.k || ''}`), r])
            .filter(([s]) => s > 0)
            .sort((a, b) => b[0] - a[0])
            .map(([, r]) => r);
    }, [q, rows]);

    /* Opening resets the query and focuses the input. */
    useEffect(() => {
        if (!open) return;
        setQ('');
        setSel(0);
        const raf = requestAnimationFrame(() => inputRef.current && inputRef.current.focus());
        return () => cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => { setSel(0); }, [results]);

    /* Keep the selected row in view. */
    useEffect(() => {
        const el = listRef.current && listRef.current.querySelector('.qorow.sel');
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [sel, results]);

    if (!open) return null;

    const move = (d) => {
        if (!results.length) return;
        setSel((i) => (i + d + results.length) % results.length);
    };
    const go = (row) => {
        if (!row) return;
        navigate(`/docs/${row.path}`);
        onClose();
    };
    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };

    return (
        <div className="qo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="qobox" role="dialog" aria-modal="true" aria-label="Quick open">
                <div className="qoin">
                    <span className="pr" aria-hidden="true">▸</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="find in the manual…"
                        aria-label="Search documentation"
                        autoComplete="off"
                        spellCheck="false"
                    />
                    <span className="esc" aria-hidden="true">esc</span>
                </div>
                <div className="qols" role="listbox" aria-label="Pages" ref={listRef}>
                    {results.length === 0 ? (
                        <div className="qonone">no page matches — the manual has {rows.length} pages</div>
                    ) : results.map((r, i) => (
                        <div
                            key={r.path}
                            className={`qorow${i === sel ? ' sel' : ''}`}
                            role="option"
                            aria-selected={i === sel}
                            onClick={() => go(r)}
                            onMouseMove={() => { if (sel !== i) setSel(i); }}
                        >
                            <span className="qn">{NN(r.line)}</span>
                            <span className="qt">{r.title}</span>
                            <span className="qc">{r.category}</span>
                        </div>
                    ))}
                </div>
                <div className="qoft">
                    <span>↑↓ / ^n ^p move</span><span>↵ open</span><span>esc close</span>
                </div>
            </div>
        </div>
    );
}
