/* ═══ DOCS-CHROME — The Working Copy chrome for the /docs surface ════
 *
 * The docs are the manual of the working copy: the landing is its
 * printed index (ruled shelf heads with mono tabs, faint line
 * numbers), an article is one printed page (running head, folio
 * numeral, claim/receipt couplet). Everything here is chrome around
 * the generated docs-data corpus — body prose is sacred and renders
 * the transformed HTML faithfully (pages/docs/[[...slug]].pyxl).
 *
 * The stylesheet lives in styles/docs.css,
 * imported by the docs page itself; every selector there is scoped
 * under the page's `.docs-page` root class, so nothing leaks into other
 * pages through the client router's stylesheet pool.
 *
 * Hydration law: every component renders deterministically from
 * props. Measurement (rail centring, TOC spy) happens in post-mount
 * effects; `useSeen` starts false on server AND first client render.
 * Motion: documents don't dance — the landing's shelf rules draw once
 * on entry (the same apparatus stamp-in every section uses), the
 * reading dot glides, copy buttons flash. Articles are still at rest.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'pyxle/client';
import { useSeen } from './kit.jsx';

/** Line numbers wear leading zeros — 01..64, like the listing they are. */
export const NN = (n) => String(n == null ? 0 : n).padStart(2, '0');

/* ── the left rail: the whole manual in the margin ────────────────
 * 64 SSR'd links on every article page. prefetch={false} everywhere:
 * viewport-entry prefetch over a 64-link column is a request storm;
 * hover prefetch still warms the page you're about to open. */

export function DocsRail({ shelves, currentPath, kbPath, onSearch }) {
    const railRef = useRef(null);

    /* Keep the current line in view — centre it once per page. */
    useEffect(() => {
        const rail = railRef.current;
        const on = rail && rail.querySelector('.ri.on');
        if (rail && on) {
            const t = on.offsetTop - rail.clientHeight / 2;
            if (t > 0) rail.scrollTop = t;
        }
    }, [currentPath]);

    return (
        <nav className="rail" ref={railRef} aria-label="All documentation pages">
            <button className="rsearch" type="button" onClick={onSearch}>
                <span className="pr" aria-hidden="true">⌘K</span> find in the manual
            </button>
            <div className="railin">
                {shelves.map((cat) => (
                    <React.Fragment key={cat.slug}>
                        <div className="rcat">{cat.category}</div>
                        {cat.items.map((it) => {
                            const on = it.path === currentPath;
                            const cls = `ri${on ? ' on' : ''}${kbPath === it.path ? ' kb' : ''}`;
                            return (
                                <Link
                                    key={it.path}
                                    className={cls}
                                    href={`/docs/${it.path}`}
                                    aria-current={on ? 'page' : undefined}
                                    prefetch={false}
                                >
                                    <i className="no">{NN(it.line)}</i><span>{it.title}</span>
                                </Link>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </nav>
    );
}

/* ── prev / next: printed terms at the foot of the page ──────────── */

export function DocsTerms({ prev, next }) {
    return (
        <nav className="terms" aria-label="Adjacent pages">
            {prev ? (
                <Link className="term prev" href={`/docs/${prev.path}`} prefetch={false}>
                    <span className="tl">◂ prev</span>
                    <span className="tt">{prev.title}</span>
                    <span className="tn">{NN(prev.line)}</span>
                </Link>
            ) : (
                <span className="term prev end"><span className="tl">◂ prev</span><span className="tt">start of the manual</span></span>
            )}
            {next ? (
                <Link className="term next" href={`/docs/${next.path}`} prefetch={false}>
                    <span className="tl">next ▸</span>
                    <span className="tt">{next.title}</span>
                    <span className="tn">{NN(next.line)}</span>
                </Link>
            ) : (
                <span className="term next end"><span className="tl">next ▸</span><span className="tt">end of the manual</span></span>
            )}
        </nav>
    );
}

/* ── right rail: on this page, with the reading dot ───────────────
 * The ink dot marks reading position. Scroll-spy is post-mount;
 * active state lives in React state (not bare classList) so
 * unrelated re-renders can't wipe it. SSR frame: no dot, no active
 * row — the correct rest state. */

export function DocsToc({ toc, slug }) {
    const tocRef = useRef(null);
    const [mark, setMark] = useState(null); // { id, top } — active heading + dot y

    useEffect(() => {
        setMark(null);
        const tocEl = tocRef.current;
        if (!tocEl || !toc || !toc.length) return undefined;
        const links = [...tocEl.querySelectorAll("a[href^='#']")];
        const heads = links
            .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
            .filter(Boolean);
        const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));

        function spy() {
            let active = heads[0];
            for (const h of heads) {
                if (h.getBoundingClientRect().top <= 130) active = h;
                else break;
            }
            if (!active) return;
            const a = byId.get(active.id);
            if (!a) return;
            const top = a.offsetTop + a.offsetHeight / 2 - 3;
            setMark((prev) => (prev && prev.id === active.id && prev.top === top ? prev : { id: active.id, top }));
        }

        let tick = 0;
        const onScroll = () => {
            if (tick) return;
            tick = setTimeout(() => { tick = 0; spy(); }, 40);
        };
        const onResize = () => spy();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        spy();
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            clearTimeout(tick);
        };
    }, [slug, toc]);

    if (!toc || toc.length === 0) return null;

    return (
        <aside className="tocrail" aria-label="On this page">
            <div className="tochd">on this page</div>
            {/* `tlive`, not `live` — the homepage's .live chip class is in
               the dev stylesheet pool and would uppercase the whole toc */}
            <div className={`toc${mark ? ' tlive' : ''}`} ref={tocRef}>
                <span className="tocdot" style={mark ? { top: `${mark.top}px` } : undefined} aria-hidden="true" />
                {toc.map((t) => (
                    <a
                        key={t.slug}
                        className={`t${t.depth}${mark && mark.id === t.slug ? ' on' : ''}`}
                        href={`#${t.slug}`}
                    >{t.text}</a>
                ))}
            </div>
            <a className="toctop" href="#top">▲ top</a>
        </aside>
    );
}

/* ── landing: the printed index ───────────────────────────────────
 * Each shelf head is a running head — a ruled line with its mono tab
 * and page count sitting ON the rule. The rules draw once as they
 * enter (the house apparatus stamp-in, via useSeen + the global .seen
 * machinery); no cursors, no spines — an index holds still. */

function Shelf({ cat, index, kbPath }) {
    const [ref, seen] = useSeen();
    return (
        <div ref={ref} className={`shelf${seen ? ' seen' : ''}`}>
            <div className="rulebar">
                <span className="tab">{NN(index)} · {cat.category}</span>
                <span className="shct">{cat.items.length} page{cat.items.length === 1 ? '' : 's'}</span>
                <span className="shade" aria-hidden="true" />
            </div>
            <div className="shgrid rv">
                {cat.items.map((it) => (
                    <Link
                        key={it.path}
                        className={`ri${kbPath === it.path ? ' kb' : ''}`}
                        href={`/docs/${it.path}`}
                        prefetch={false}
                    >
                        <i className="no">{NN(it.line)}</i><span>{it.title}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

export function DocsShelves({ shelves, kbPath }) {
    return (
        <section className="shelves" id="shelves">
            {shelves.map((cat, i) => (
                <Shelf key={cat.slug} cat={cat} index={i} kbPath={kbPath} />
            ))}
        </section>
    );
}

/* ── mobile bar actions (fills the layout's `m-bar` slot) ─────────
 * Slot factories are module-scope and can't reach DocsPage state, so
 * this speaks the same window-event protocol the docs page listens
 * on: it dispatches intent (toggle rail / open palette) and mirrors
 * the rail's open state from the page's broadcast. SSR renders the
 * closed-state labels — deterministic on both sides. */

export function DocsMobileBarActions({ landing, firstPath, firstLine }) {
    const [railOpen, setRailOpen] = useState(false);

    useEffect(() => {
        const sync = (e) => setRailOpen(Boolean(e.detail && e.detail.open));
        window.addEventListener('pyxle:docs-rail', sync);
        return () => window.removeEventListener('pyxle:docs-rail', sync);
    }, []);

    const openQo = () => window.dispatchEvent(new CustomEvent('pyxle:docs-qo'));
    const toggleRail = () => window.dispatchEvent(new CustomEvent('pyxle:docs-rail-toggle'));

    if (landing) {
        return (
            <>
                <button type="button" onClick={openQo}>⌘K search</button>
                {firstPath ? (
                    <Link href={`/docs/${firstPath}`} prefetch={false}>▸ line {NN(firstLine)}</Link>
                ) : null}
            </>
        );
    }
    return (
        <>
            <button type="button" onClick={toggleRail} aria-expanded={railOpen}>
                {railOpen ? '✕ close' : '▤ index'}
            </button>
            <button type="button" onClick={openQo}>⌘K search</button>
        </>
    );
}
