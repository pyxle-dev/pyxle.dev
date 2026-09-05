/* ═══ CHROME — the shared header / footer / newsletter for pyxle.dev ═══
 *
 * Rendered by pages/layout.pyxl on every page. Ported from the approved
 * design prototype onto the app's real
 * primitives: Pyxle <Link> navigation, the layout loader's live
 * pyxle.__version__, and the REAL subscribe_newsletter @action.
 *
 * Chrome laws:
 *  · every page carries every nav link + GitHub — zero 404s
 *  · active page = 2px ink underline — never green (green means "code
 *    that runs"; the current page is a fact)
 *  · the header does NOT hide on scroll: running heads don't dodge
 *    (a deliberate design decision — the previous design's
 *    hide-on-scroll behaviour is deliberately deleted)
 *  · Install is the one solid green button on the page (green job 4)
 *  · the footer is the document's EOF: one rulebar, one newsletter
 *    line, justified fact/link rows, and "⟨/⟩ view source" pointing at
 *    THIS page's real file on GitHub
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Slot, useAction, usePathname } from 'pyxle/client';
import { ThemeToggle } from './theme-toggle.jsx';
import { CopyChip, Rulebar, copyText, useSeen } from './kit.jsx';
import { track } from './analytics.jsx';

export const INSTALL = 'pip install pyxle-framework';
export const GITHUB = 'https://github.com/pyxle-dev/pyxle';

/* Cross-page nav law: every page links these + GitHub. `hideS` links
   drop from the header below 860px (they stay in the footer, and the
   mobile bar covers the gap). */
const NAV = [
    { key: 'docs',       href: '/docs',       label: 'Docs' },
    { key: 'benchmarks', href: '/benchmarks', label: 'Benchmarks' },
    { key: 'playground', href: '/playground', label: 'Playground', hideS: true },
    { key: 'demos',      href: '/demos',      label: 'Demos' },
    { key: 'compare',    href: '/compare',    label: 'Compare', hideS: true },
    { key: 'roadmap',    href: '/roadmap',    label: 'Roadmap', hideS: true },
    { key: 'plugins',    href: '/plugins',    label: 'Plugins', hideS: true },
];

/* ── view source — every page points at its real file on GitHub ──── */

const SRC_SITE = 'https://github.com/pyxle-dev/pyxle.dev/blob/main/pages';
const SOURCE = {
    '/':            `${SRC_SITE}/index.pyxl`,
    '/benchmarks':  `${SRC_SITE}/benchmarks.pyxl`,
    '/playground':  `${SRC_SITE}/playground.pyxl`,
    '/demos':       `${SRC_SITE}/demos.pyxl`,
    '/compare':     `${SRC_SITE}/compare.pyxl`,
    '/roadmap':     `${SRC_SITE}/roadmap.pyxl`,
    '/plugins':     `${SRC_SITE}/plugins.pyxl`,
    '/unsubscribe': `${SRC_SITE}/unsubscribe.pyxl`,
    '/docs':        'https://github.com/pyxle-dev/pyxle/tree/main/docs',
};

export function sourceFor(pathname) {
    const path = (pathname || '/').replace(/\/+$/, '') || '/';
    if (SOURCE[path]) return SOURCE[path];
    if (path.startsWith('/docs/')) return SOURCE['/docs'];
    return 'https://github.com/pyxle-dev/pyxle.dev';
}

/* The install chip — kept as `CopyCmd` too so pages migrating off
   the previous chrome keep a familiar import. */
export function CopyCmd({ text = INSTALL, className = '' }) {
    return <CopyChip text={text} className={className} />;
}

/* ── the star glyph, drawn — optically centered, fills on hover ──── */
export function StarIcon() {
    return (
        <svg className="star-i" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M8 1.9 L9.7 5.95 L14.09 6.32 L10.76 9.2 L11.76 13.48 L8 11.2 L4.24 13.48 L5.24 9.2 L1.91 6.32 L6.3 5.95 Z"
                fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
            />
        </svg>
    );
}

/* ── header ───────────────────────────────────────────────────────
 * 64px, Bond, one rule2 hairline, sticky — and it stays. SSR'd
 * complete and crawlable; no scroll listeners at all. */

export function SiteHeader() {
    const path = usePathname() || '/';
    const isActive = (href) => path === href || path.startsWith(`${href}/`);
    return (
        <header className="hd">
            <div className="frame hd-row">
                <Link className="wordmark" href="/" aria-label="Pyxle home">
                    <img src="/branding/pyxle-mark-flat.svg" width={22} height={22} alt="" aria-hidden="true" />
                    <span className="wm">Pyxle</span>
                </Link>
                <nav aria-label="Site">
                    {NAV.map((item) => {
                        const on = isActive(item.href);
                        const cls = [item.hideS ? 'hide-s' : '', on ? 'on' : ''].filter(Boolean).join(' ');
                        return (
                            <Link
                                key={item.key}
                                href={item.href}
                                className={cls || undefined}
                                aria-current={on ? 'page' : undefined}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                    <a className="hd-gh" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
                </nav>
                {/* Pages contribute controls here (docs search, the homepage's
                   live star count). The theme toggle — the reading lamp — sits
                   last; ≤768px the mobile bar carries it instead. */}
                <div className="hd-extra">
                    <Slot name="nav-extra" fallback={null} />
                    <ThemeToggle />
                </div>
                <a className="btn-install" href="/#start">Install</a>
            </div>
        </header>
    );
}

/* ── mobile quick-action bar (≤768px, all pages) ─────────────────── */

export function MobileBar() {
    /* The install cell's copy → quickstart funnel, in the bar's own
       idiom: a REAL copy (and only one — a failed copy says `copy
       failed` and stops) flashes `copied`, then the cell label becomes
       the tappable `quickstart →` link for ~4s before resting back to
       `$ install`. The cell box never changes (`.m-bar a` and `.m-bar
       button` share the flex geometry), so nothing shifts; the swap is
       a conditional render — instant under reduced motion too. */
    const [phase, setPhase] = useState('idle'); // idle | ok | fail | quick
    const flashRef = useRef(null);
    const quickRef = useRef(null);
    useEffect(() => () => {
        clearTimeout(flashRef.current);
        clearTimeout(quickRef.current);
    }, []);
    const copy = useCallback(() => {
        copyText(INSTALL).then((ok) => {
            clearTimeout(flashRef.current);
            clearTimeout(quickRef.current);
            setPhase(ok ? 'ok' : 'fail');
            if (ok) {
                track('command_copied', { command: INSTALL, surface: 'mobile-bar' });
                flashRef.current = setTimeout(() => setPhase('quick'), 1400);
                quickRef.current = setTimeout(() => setPhase('idle'), 5400);
            } else {
                flashRef.current = setTimeout(() => setPhase('idle'), 1400);
            }
        });
    }, []);
    return (
        <nav className="m-bar" aria-label="Quick actions">
            <Slot
                name="m-bar"
                fallback={(
                    <>
                        <a href={GITHUB} target="_blank" rel="noreferrer" className="starrable"><StarIcon /> Star</a>
                        <Link href="/docs">Docs</Link>
                        {phase === 'quick' ? (
                            <Link
                                className="m-quick"
                                href="/docs/getting-started/quick-start"
                                onClick={() => track('quickstart_opened', { from: 'copy', command: INSTALL, surface: 'mobile-bar' })}
                            >quickstart <span className="a">→</span></Link>
                        ) : (
                            <button type="button" onClick={copy}>{phase === 'ok' ? 'copied' : phase === 'fail' ? 'copy failed' : '$ install'}</button>
                        )}
                    </>
                )}
            />
            {/* Outside the slot on purpose: the theme control survives a
               page taking the bar over (docs put ▤ index + ⌘K here). */}
            <ThemeToggle className="m-tgl" />
        </nav>
    );
}

/* ── newsletter — one printed line, wired to the real action ───────
 *
 * THE REAL THING, on every page. The form invokes the existing
 * `@action subscribe_newsletter` defined in pages/index.pyxl —
 * `useAction(…, { pagePath: '/' })` posts to
 * /api/__actions/index/subscribe_newsletter from any route, so the one
 * implementation (rate limit 5/6h/IP → Turnstile bot check →
 * validation → subscriber row → welcome email queued as a background
 * task) is reused, never forked. Nothing simulated: the outcome line
 * is the server's own answer, set in request-log mono.
 *
 * Turnstile is armed lazily on first focus (the script never loads for
 * visitors who ignore the form); a submit that beats the token waits
 * for it and auto-fires; tokens are single-use, so a failure resets
 * the widget. Ported behaviour-for-behaviour from the previous design's terminal —
 * only the wire visuals are gone.
 */

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileLoader = null;
function loadTurnstile() {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLoader) return turnstileLoader;
    turnstileLoader = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = TURNSTILE_SRC;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve(window.turnstile || null);
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return turnstileLoader;
}

export function NewsletterLine() {
    // Public site key — baked into the client bundle at build time via the
    // PYXLE_PUBLIC_ convention. Unset (local dev, forks) degrades to ''.
    const turnstileSiteKey = (import.meta.env && import.meta.env.PYXLE_PUBLIC_TURNSTILE_SITE_KEY) || '';
    const subscribe = useAction('subscribe_newsletter', { pagePath: '/' });
    const emailId = useId();

    const [email, setEmail] = useState('');
    const [note, setNote] = useState(null);    // { tone: 'ok'|'err'|'run', text }
    const [done, setDone] = useState('');
    const [busy, setBusy] = useState(false);

    // Turnstile — armed lazily on first focus of the email field.
    const widgetRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [tsToken, setTsToken] = useState('');
    const [verifying, setVerifying] = useState(false);
    const verifyTimerRef = useRef(null);
    const doneRef = useRef(null);

    const armTurnstile = useCallback(() => {
        if (!turnstileSiteKey || widgetIdRef.current !== null) return;
        loadTurnstile().then((ts) => {
            if (!ts || !widgetRef.current || widgetIdRef.current !== null) return;
            widgetIdRef.current = ts.render(widgetRef.current, {
                sitekey: turnstileSiteKey,
                appearance: 'interaction-only',
                // Match a visible challenge to the page's theme at arm time —
                // the toggle is manual, never system-pref.
                theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                callback: setTsToken,
                'expired-callback': () => setTsToken(''),
                'error-callback': () => setTsToken(''),
            });
        }).catch(() => {});
    }, [turnstileSiteKey]);

    // The success line replaces the form — move focus with it so
    // keyboard users aren't dropped at the document body.
    useEffect(() => {
        if (done && doneRef.current) doneRef.current.focus();
    }, [done]);

    useEffect(() => () => clearTimeout(verifyTimerRef.current), []);

    const doSubscribe = useCallback(async (token) => {
        clearTimeout(verifyTimerRef.current);
        verifyTimerRef.current = null;
        setVerifying(false);
        setBusy(true);
        setNote(null);
        const result = await subscribe({ email, turnstileToken: token });
        setBusy(false);
        if (result.ok) {
            setEmail('');
            setDone(result.message || 'subscribed · check your inbox');
        } else {
            setNote({ tone: 'err', text: `POST subscribe_newsletter → ERR · ${result.error || 'request failed'}` });
            // Turnstile tokens are single-use — get a fresh one for the retry.
            if (widgetIdRef.current !== null && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
                setTsToken('');
            }
        }
    }, [email, subscribe]);

    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        if (busy) return;
        setNote(null);
        if (turnstileSiteKey && !tsToken) {
            // Token not ready (widget still arming, or a challenge open).
            // Don't error — arm it and wait; the effect below fires the
            // submit the instant the token lands. No second click.
            armTurnstile();
            setVerifying(true);
            setNote({ tone: 'run', text: 'human check running…' });
            clearTimeout(verifyTimerRef.current);
            verifyTimerRef.current = setTimeout(() => {
                verifyTimerRef.current = null;
                setVerifying(false);
                setNote({ tone: 'err', text: 'human check failed · try again' });
            }, 30000);
            return;
        }
        doSubscribe(tsToken);
    }, [busy, turnstileSiteKey, tsToken, armTurnstile, doSubscribe]);

    // A submit is waiting on the human check and the token just landed.
    useEffect(() => {
        if (verifying && tsToken) doSubscribe(tsToken);
    }, [verifying, tsToken, doSubscribe]);

    return (
        <div className="ft-nl">
            <label className="ft-nl-label" htmlFor={emailId}>Ship notes, no noise.</label>
            {done ? (
                <p className="nl-note" ref={doneRef} tabIndex={-1}>
                    <span className="nl-ok">POST subscribe_newsletter → 200</span> · {done}
                </p>
            ) : (
                <form className="nl-row" onSubmit={handleSubmit} noValidate={false}>
                    <input
                        id={emailId}
                        type="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={armTurnstile}
                        placeholder="you@work.dev"
                        required
                        autoComplete="email"
                    />
                    <button type="submit" disabled={busy || verifying}>
                        {busy ? 'sending…' : verifying ? 'verifying…' : 'Subscribe'}
                    </button>
                </form>
            )}
            {!done ? (
                <p className="nl-note">
                    {note ? note.text : 'unsubscribe is one click'}
                </p>
            ) : null}
            <div ref={widgetRef} className="nl-ts" />
            <div role="status" aria-live="polite" className="sr">
                {done || (note && note.tone === 'err' ? note.text : '')}
            </div>
        </div>
    );
}

/* ── footer — the document's EOF ──────────────────────────────────── */

export function SiteFooter({ version }) {
    const path = usePathname() || '/';
    const [ref, seen] = useSeen({ rootMargin: '0px', threshold: 0.01 });
    const ver = version ? `v${version}` : 'pre-1.0';
    return (
        <footer ref={ref} className={`ft${seen ? ' seen' : ''}`}>
            <div className="frame">
                <Rulebar tab="EOF" />
                <NewsletterLine />
                <div className="foot-row">
                    <p className="foot-facts" style={{ margin: 0 }}>
                        MIT · {ver} · pre-1.0 · Python 3.10+ · React 18/19 · any ASGI host
                    </p>
                    <p className="foot-links" style={{ margin: 0 }}>
                        {NAV.map((item) => (
                            <Link key={item.key} className="link" href={item.href}>{item.label}</Link>
                        ))}
                        <Link className="link" href="/docs/changelog">Changelog</Link>
                        <a className="link" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
                    </p>
                </div>
                <p className="foot-dogfood">
                    pyxle.dev is a Pyxle app —{' '}
                    <a className="link" href={sourceFor(path)} target="_blank" rel="noreferrer">
                        ⟨/⟩ view this page&rsquo;s source <span className="a">→</span>
                    </a>
                </p>
            </div>
        </footer>
    );
}
