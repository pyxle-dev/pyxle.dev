/* ═══ F-KIT — shared Working Copy primitives ═════════════════════════
 *
 * Small, foundation-owned pieces every F page composes: the running
 * head (Rulebar), the couplet receipt, panes, the copy chip, log lines,
 * and the `useSeen` reveal hook. Lanes request additions here rather
 * than editing — each page owns its styles; shared tokens live here.
 *
 * Hydration law, upheld by construction: `useSeen` state starts false
 * on the server AND the first client render (SSR markup carries no
 * `.seen`), and flips post-mount via IntersectionObserver. With JS off
 * nothing is hidden (`html:not(.js)` never gates content out); with
 * reduced motion the CSS kill block forces everything visible, so the
 * observer's timing stops mattering.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'pyxle/client';
import { track } from './analytics.jsx';

export { useReducedMotionSafe } from './e-motion.jsx';

/** IntersectionObserver → `seen` flag for the reveal machinery.
 *  Usage: const [ref, seen] = useSeen();
 *         <section ref={ref} className={`sec${seen ? ' seen' : ''}`}> */
export function useSeen({ rootMargin = '0px 0px -12% 0px', threshold = 0.05, immediate = false } = {}) {
    const ref = useRef(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        if (immediate) { setSeen(true); return undefined; }
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined'
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setSeen(true);
            return undefined;
        }
        const io = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (en.isIntersecting) {
                    setSeen(true);
                    io.disconnect();
                }
            });
        }, { rootMargin, threshold });
        io.observe(el);
        return () => io.disconnect();
    }, [immediate, rootMargin, threshold]);
    return [ref, seen];
}

/** The running head: tab left ON the rule, folio numeral right ON it.
 *  `hero` drops the rule (the hero borrows the header's hairline). */
export function Rulebar({ tab, folio, href, hero = false, className = '' }) {
    const cls = `rulebar${hero ? ' rulebar-hero' : ''}${className ? ` ${className}` : ''}`;
    return (
        <div className={cls}>
            {href
                ? <a className="tab" href={href}>{tab}</a>
                : <span className="tab">{tab}</span>}
            {folio ? <span className="folio" aria-hidden="true">{folio}</span> : null}
            {hero ? null : <span className="shade" aria-hidden="true" />}
        </div>
    );
}

/** The couplet's second line: evidence in mono under a claim in sans. */
export function Receipt({ children, className = '', ...rest }) {
    return <p className={`receipt${className ? ` ${className}` : ''}`} {...rest}>{children}</p>;
}

/** A sheet pane: 1px rule border, 6px radius, no shadow. */
export function Pane({ children, className = '', as: As = 'div', ...rest }) {
    return <As className={`pane${className ? ` ${className}` : ''}`} {...rest}>{children}</As>;
}

export function PaneHead({ children, className = '', ...rest }) {
    return <div className={`pane-head${className ? ` ${className}` : ''}`} {...rest}>{children}</div>;
}

/** Copy that works off HTTPS too: the async clipboard API exists only
 *  in secure contexts, and a LAN review (http://192.168.x.x) is not
 *  one — the classic textarea + execCommand path still is. Resolves
 *  true only when a copy actually happened, so callers can report
 *  honestly. */
export async function copyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) { /* fall through to execCommand */ }
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}

/** The copy chip — `$ command · copy`. The $ is Run Green (job 2); a
 *  successful copy flashes the tint (job 2's second face). Copying an
 *  install command is the site's highest-intent signal — one event
 *  covers every chip.
 *
 *  `quickstart` (the install-funnel surfaces pass it): a REAL copy —
 *  and only a real one; `copyText` resolving false shows `copy failed`
 *  and nothing else — reveals a transient `quickstart →` link to the
 *  Quick Start page for ~4s. It is absolutely positioned inside the
 *  wrapper, so nothing on the page moves; it navigates through the
 *  client router; reveal/expiry are conditional renders, so reduced
 *  motion just loses the 150ms fade (CSS). */
export function CopyChip({ text, className = '', quickstart = false }) {
    const [copied, setCopied] = useState(null); // null | 'ok' | 'fail'
    const [quick, setQuick] = useState(false);
    const timerRef = useRef(null);
    const quickTimerRef = useRef(null);
    useEffect(() => () => {
        clearTimeout(timerRef.current);
        clearTimeout(quickTimerRef.current);
    }, []);
    const onCopy = useCallback(() => {
        copyText(text).then((ok) => {
            setCopied(ok ? 'ok' : 'fail');
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(null), 1200);
            if (ok) track('command_copied', { command: text });
            if (ok && quickstart) {
                setQuick(true);
                clearTimeout(quickTimerRef.current);
                quickTimerRef.current = setTimeout(() => setQuick(false), 4000);
            }
        });
    }, [text, quickstart]);
    return (
        <span className={`chip-wrap${className ? ` ${className}` : ''}`}>
            <button type="button" className={`chip${copied === 'ok' ? ' copied' : ''}`} onClick={onCopy}>
                <span className="chip-d" aria-hidden="true">$</span>
                <span className="chip-cmd">{text}</span>
                <span className="chip-copy">{copied === 'ok' ? 'copied' : copied === 'fail' ? 'copy failed' : 'copy'}</span>
                <span role="status" className="sr">{copied === 'ok' ? 'Copied to clipboard' : copied === 'fail' ? 'Copy failed' : ''}</span>
            </button>
            {quick ? (
                <Link
                    className="link chip-q"
                    href="/docs/getting-started/quick-start"
                    onClick={() => track('quickstart_opened', { from: 'copy', command: text })}
                >quickstart <span className="a">→</span></Link>
            ) : null}
        </span>
    );
}

/** One request-log line (the quoted-terminal idiom). `status` 200 reads
 *  in terminal green (job 3); anything else stays dim — a 422 never ran,
 *  so it earns no green. */
export function LogLine({ method, path, status, ms, tail, fresh = false }) {
    const ok = String(status) === '200';
    return (
        <p className={`log-line${fresh ? ' fresh-log' : ''}`}>
            <span className="lg-m">{method}</span>
            <span className="lg-p">{path}</span>
            <span className={`lg-s${ok ? '' : ' lg-4xx'}`}>{status}</span>
            <span className="lg-ms">{ms}</span>
            <span className="lg-c">{tail}</span>
        </p>
    );
}
