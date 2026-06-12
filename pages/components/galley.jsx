import React, { useState, useEffect } from 'react';
import { Link } from 'pyxle/client';
import { tokenizeBlock } from './code-highlighter.jsx';

/* ════════════════════════════════════════════════════════════════
   GALLEY — the shared design-system primitives for pyxle.dev.
   Every page is typeset like a printed argument: flat paper/ink
   surfaces, hairline rules, hanging section numerals, figures with
   captions — and a motion language built from the logo's own
   gesture: a round-cap stroke that draws itself, and a dot that
   lands like a period. Theme tokens live in styles/tailwind.css.
   ════════════════════════════════════════════════════════════════ */


/* ── Scroll reveal — native IntersectionObserver ─────────────────
   Elements tagged `data-reveal` ease in on first intersect. The
   variant `data-reveal="none"` is a pure trigger (no fade) used by
   drawn marks; `data-rt="late"` waits for 35% visibility. No-JS and
   reduced-motion visitors get the finished page instantly. */
export function useScrollReveal() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const els = Array.from(document.querySelectorAll('[data-reveal]'));
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !('IntersectionObserver' in window)) {
            els.forEach((el) => el.classList.add('is-visible'));
            return;
        }
        const make = (threshold) => new IntersectionObserver(
            (entries, io) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        e.target.classList.add('is-visible');
                        io.unobserve(e.target);
                    }
                }
            },
            { rootMargin: '0px 0px -8% 0px', threshold },
        );
        const io = make(0.12);
        const ioLate = make(0.35);
        els.forEach((el) => (el.dataset.rt === 'late' ? ioLate : io).observe(el));
        return () => { io.disconnect(); ioLate.disconnect(); };
    }, []);
}


/* ── Copy-to-clipboard, set like a proofreader's mark ────────────── */
export function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        }
    };
    return (
        <>
            <button
                type="button"
                onClick={copy}
                aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
                className="focus-ring rounded font-mono text-[11px] uppercase tracking-[0.08em] transition-colors text-ink2 hover:text-ink"
            >
                {copied ? <span className="text-acct">copied</span> : 'copy'}
            </button>
            {/* Live region so the confirmation reaches screen readers. */}
            <span role="status" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
        </>
    );
}


/* ── Live-tokenized code block (SSR-safe; tokenizeBlock is pure) ── */
export function CodeBlock({ code, lang = 'pyxl', className = '' }) {
    return (
        <pre className={`overflow-x-auto font-mono leading-[1.7] ${className}`}>
            <code>
                {tokenizeBlock(code, lang).map((tokens, i) => (
                    <React.Fragment key={i}>
                        {tokens.length === 0 ? '\n' : (
                            <>
                                {tokens.map((t, j) => <span key={j} className={t.cls}>{t.text}</span>)}
                                {'\n'}
                            </>
                        )}
                    </React.Fragment>
                ))}
            </code>
        </pre>
    );
}


/* ── The logo P, drawing itself ──────────────────────────────────
   `load` plays on page load (heroes); otherwise it draws when its
   data-reveal ancestor becomes visible. `id` must be unique per
   instance on a page (it namespaces the gradient def). */
export function PMark({ size = 88, load = false, id = 'hero', dur = 900, dotDelay = 950 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <defs>
                <linearGradient id={`pm-${id}`} x1="16" y1="10" x2="80" y2="86" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#6ee7b7" />
                    <stop offset="0.5" stopColor="#34d399" />
                    <stop offset="1" stopColor="#059669" />
                </linearGradient>
            </defs>
            <path
                d="M28 80 V16 H56 Q76 16 76 36 Q76 56 56 56 H28"
                pathLength="1"
                className={load ? 'gp-draw-load' : 'gp-draw'}
                style={{ ['--draw-dur']: `${dur}ms` }}
                stroke={`url(#pm-${id})`}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle
                cx="56" cy="36" r="5"
                className={load ? 'gp-dot-load' : 'gp-dot'}
                style={{ ['--dot-delay']: `${dotDelay}ms` }}
                fill="#6ee7b7"
            />
        </svg>
    );
}


/* ── The only two CTA styles on the site ─────────────────────────── */
export function InkButton({ href, children, external = false }) {
    const cls = 'focus-ring inline-flex items-center justify-center gap-2 rounded-[3px] bg-ink px-6 py-3 font-mono text-[13px] text-paper transition-opacity hover:opacity-85';
    return external
        ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
        : <Link href={href} className={cls}>{children}</Link>;
}

export function EditorialLink({ href, children, external = false }) {
    const cls = 'focus-ring rounded font-mono text-[13px] text-ink underline decoration-rule decoration-2 underline-offset-[5px] transition-colors hover:decoration-accent';
    return external
        ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
        : <Link href={href} className={cls}>{children}</Link>;
}


/* ── A "plate" — code printed on the page like a photographic
   plate, dark in both themes, with a figure caption beneath. ────── */
export function Plate({ label, meta, caption, children, className = '' }) {
    return (
        <figure className={className}>
            <div className="rounded-[10px] border border-plateb bg-paper p-[3px] shadow-[0_1px_2px_rgba(20,25,21,0.06)] dark:shadow-none">
                <div className="overflow-hidden rounded-[7px] bg-plate">
                    {label && (
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A9086]">{label}</span>
                            {meta && <span className="font-mono text-[11px] text-[#8A9086]">{meta}</span>}
                        </div>
                    )}
                    {children}
                </div>
            </div>
            {caption && (
                <figcaption className="mt-3 font-mono text-xs leading-relaxed text-ink2">{caption}</figcaption>
            )}
        </figure>
    );
}


/* ── Section shell: hanging numeral + drawn tick on the manuscript
   margin rule (≥1024px). `wide` sections break the article measure
   (no margin rule) — used for full-bleed centerfolds. ───────────── */
export function GpSection({ n, id, wide = false, children }) {
    return (
        <section id={id} className="gp-cv relative">
            <div className="mx-auto max-w-[76rem] px-5 sm:px-8">
                <div className={`relative py-20 sm:py-28 ${wide ? '' : 'border-rule lg:ml-16 lg:border-l lg:pl-14'}`}>
                    {!wide && (
                        <span
                            data-reveal="none"
                            aria-hidden="true"
                            className="absolute -left-16 top-20 hidden w-12 flex-col items-end gap-1.5 sm:top-28 lg:flex"
                        >
                            <span className="font-mono text-sm text-press">{n}</span>
                            <svg className="h-[3px] w-8" viewBox="0 0 32 3" fill="none">
                                <path d="M0 1.5 H32" pathLength="1" className="gp-draw" style={{ ['--draw-dur']: '320ms' }} stroke="var(--c-accent)" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                        </span>
                    )}
                    {children}
                </div>
            </div>
        </section>
    );
}


/* ── Eyebrow + line-masked h2 — every section opens the same way.
   The numeral appears inline below lg (the margin rail hides). ──── */
export function GpHead({ n, eyebrow, title, lead }) {
    return (
        <div data-reveal="none" className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-press">
                {n ? <span className="lg:hidden">{n} — </span> : null}{eyebrow}
            </p>
            <h2 className="mt-4 font-display text-[2rem] font-[540] leading-[1.08] tracking-[-0.01em] text-ink sm:text-[2.6rem]">
                <span className="gp-lm"><span>{title}</span></span>
            </h2>
            {lead && <p className="mt-5 max-w-[58ch] text-pretty text-base leading-[1.7] text-ink2">{lead}</p>}
        </div>
    );
}


/* ── The shared footer (a colophon): the P redraws itself, then
   link columns and the typeset credit line. One per page. ──────── */

const FOOTER_COLS = [
    { h: 'Framework', links: [['Docs', '/docs'], ['Playground', '/playground'], ['Plugins', '/plugins'], ['Benchmarks', '/benchmarks'], ['FAQ', '/docs/faq']] },
    { h: 'Learn', links: [['Getting started', '/docs/getting-started/installation'], ['Server actions', '/docs/core-concepts/server-actions'], ['For AI agents', '/docs/guides/for-ai-agents']] },
    { h: 'Project', links: [['Roadmap', '/roadmap'], ['GitHub', 'https://github.com/pyxle-dev/pyxle', true], ['Releases', 'https://github.com/pyxle-dev/pyxle/releases', true], ['Issues', 'https://github.com/pyxle-dev/pyxle/issues', true]] },
];

export function GalleyFooter({ version }) {
    const linkCls = 'focus-ring rounded text-sm text-ink2 transition-colors hover:text-ink';
    return (
        <footer className="relative">
            {/* The pen that opened the page closes it. */}
            <div data-reveal="none" className="flex justify-center pb-12 pt-8">
                <PMark size={56} id="footer" dur={1100} dotDelay={1150} />
            </div>
            <div className="border-t border-rule">
                <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8">
                    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="font-display text-[1.2rem] font-[550] tracking-tight text-ink">Pyxle</p>
                            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink2">
                                Python and React, in one file. The full-stack framework that gets out of your way.
                            </p>
                        </div>
                        {FOOTER_COLS.map((col) => (
                            <div key={col.h}>
                                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink2">{col.h}</h3>
                                <ul className="mt-4 space-y-2.5">
                                    {col.links.map(([label, href, ext]) => (
                                        <li key={label}>
                                            {ext
                                                ? <a href={href} target="_blank" rel="noreferrer" className={linkCls}>{label}</a>
                                                : <Link href={href} className={linkCls}>{label}</Link>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-rule pt-6 sm:flex-row sm:items-center">
                        <p className="font-mono text-[11px] leading-relaxed text-ink2">
                            Set in Fraunces and Schibsted Grotesk. Rendered server-side by
                            Pyxle{version ? ` v${version}` : ''} on ASGI. Open source, MIT.
                        </p>
                        <p className="inline-flex items-center gap-2 font-mono text-[11px] text-ink2">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> built with Pyxle
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
