/* Product analytics.
 *
 * Deliberately restrained, because the audience is developers:
 *
 *  - **Cookieless.** `persistence: 'memory'` means no cookie, no localStorage,
 *    no consent banner, and nothing follows anyone between visits. We lose
 *    returning-visitor identity; we keep a fast page and a clear conscience.
 *  - **Session replay on, with every input masked.** The site collects email
 *    addresses; a recording that contains one is a data-protection problem
 *    rather than a UX insight, so field contents are never captured.
 *  - **Loaded at first interaction, not on a timer.** pyxle.dev holds a
 *    Lighthouse 100, and the SDK's parse+init is ~150ms of main-thread work
 *    that lands inside the TBT window however long it is idle-deferred —
 *    `requestIdleCallback` does not escape a simulated-throttling audit.
 *    Gating on the first pointerdown/keydown/touch/scroll means a visitor
 *    who only reads costs nothing and is recorded as nothing; anyone who
 *    acts is captured from that first act (the replay starts there too).
 *  - **Absent unless configured.** With no key set — local dev, a fork, a
 *    contributor's checkout — this compiles to nothing and no request is made.
 *
 * Ad blockers are near-universal among developers and drop a large share of
 * events sent to a vendor hostname, so production points
 * PYXLE_PUBLIC_POSTHOG_HOST at a reverse proxy on our own domain
 * (j.pyxle.dev). `ui_host` below is what keeps PostHog's own links — the
 * toolbar, replay share URLs — pointing back at the real dashboard rather than
 * at the proxy, which serves ingest paths and nothing else.
 */

import { useEffect } from 'react';
import { usePathname } from 'pyxle/client';

const KEY = (import.meta.env && import.meta.env.PYXLE_PUBLIC_POSTHOG_KEY) || '';
const HOST =
    (import.meta.env && import.meta.env.PYXLE_PUBLIC_POSTHOG_HOST) || 'https://us.i.posthog.com';

/* Where PostHog's *interface* lives, which is not where events go once a proxy
 * is in front. Without it every link the toolbar and session-replay UI build
 * points at the proxy, which has no dashboard to show. */
const UI_HOST = 'https://us.posthog.com';

let loading = null;

/** Load posthog-js once, after the page is interactive. */
function load() {
    if (loading) return loading;
    loading = import('posthog-js')
        .then(({ default: posthog }) => {
            posthog.init(KEY, {
                api_host: HOST,
                ui_host: UI_HOST,
                // No cookie, no localStorage: nothing to consent to.
                persistence: 'memory',
                // Pageviews are sent by hand below, because this is a client-routed
                // app and the automatic capture only ever sees the first URL.
                capture_pageview: false,
                capture_pageleave: true,
                // Recordings only become useful once there is real traffic, but
                // they cost little until then and enabling later would mean
                // configuring this twice.
                disable_session_recording: false,
                session_recording: {
                    // The site collects email addresses. Never record what
                    // someone typed into a field — a replay that contains a
                    // subscriber's address is a data-protection problem, not a
                    // UX insight.
                    maskAllInputs: true,
                    maskTextSelector: '[data-private]',
                    // Attribute hygiene without breaking the replay: strip
                    // query strings from recorded hrefs (unsubscribe links
                    // carry signed tokens). Everything else — class, style —
                    // must reach the recorder untouched: the whole design is
                    // class-driven CSS, and masking those renders replays as
                    // blank pages.
                    maskAttributeFn: (key, value) => {
                        if (key === 'href' && typeof value === 'string') {
                            const q = value.indexOf('?');
                            if (q !== -1) return value.slice(0, q) + '?…';
                        }
                        return value;
                    },
                },
                // No surveys are configured, but the SDK still downloads its
                // surveys module (33 KB) unless told not to.
                disable_surveys: true,
                // Autocapture is on despite the noise, because it is the only
                // part of this that works *retroactively*: a funnel defined next
                // month can be built from clicks nobody thought to instrument
                // today. At this traffic the 1M-event free tier is not a
                // constraint, so the option value is free.
                autocapture: true,
                capture_heatmaps: true,
                // Real-user LCP/CLS/INP — better evidence than a synthetic
                // Lighthouse run, and this site is built around that score.
                capture_performance: { web_vitals: true },
                // Autocapture records which element was clicked; visible text
                // is kept, because "which button" is the entire point.
                // mask_all_element_attributes stays OFF: it masks class and
                // style too, which starved session replays of every CSS hook
                // and rendered whole pages blank. Sensitive attribute values
                // are handled surgically by maskAttributeFn above.
                mask_all_element_attributes: false,
                mask_all_text: false,
            });
            if (import.meta.env && import.meta.env.DEV) {
                // "Is my analytics actually working?" should be answerable without
                // opening the vendor dashboard.
                console.info(
                    '[analytics] posthog ready —',
                    HOST,
                    '· cookieless · replay on (inputs masked)',
                );
            }
            return posthog;
        })
        .catch((error) => {
            // Blocked, offline, or misconfigured. Analytics must never break the
            // site, so this is swallowed — but silently swallowing it in dev is
            // how a broken install goes unnoticed for a month.
            if (import.meta.env && import.meta.env.DEV) {
                console.warn('[analytics] posthog failed to load:', error);
            }
            return null;
        });
    return loading;
}

/** Record an event. Safe to call before load, and when analytics is disabled. */
export function track(event, properties) {
    if (!KEY || typeof window === 'undefined') return;
    load().then((posthog) => {
        if (posthog) posthog.capture(event, properties);
    });
}

/* The first user gesture. `capture: true` sees pointerdowns that a widget
 * swallows before they bubble; `passive` keeps scroll handling off the
 * interaction's critical path. Loading here (not on idle) is what keeps the
 * SDK's init cost out of Lighthouse's TBT window — see the header comment. */
const GATE_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

export default function Analytics() {
    const path = usePathname();

    useEffect(() => {
        if (!KEY) return undefined;
        const fire = () => {
            off();
            // The visit's own pageview goes out with the first gesture — a
            // visitor who never acts is deliberately not counted (the same
            // trade `persistence: 'memory'` already makes for bounces). The
            // URL is snapshotted NOW: if that gesture was a link click, the
            // route has changed by the time the SDK finishes loading.
            const url = window.location.href;
            load().then((posthog) => {
                if (posthog) posthog.capture('$pageview', { $current_url: url });
            });
        };
        const off = () => GATE_EVENTS.forEach((ev) => {
            window.removeEventListener(ev, fire, { capture: true });
        });
        GATE_EVENTS.forEach((ev) => {
            window.addEventListener(ev, fire, { once: true, passive: true, capture: true });
        });
        return off;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!KEY || typeof window === 'undefined' || !loading) return;
        // Client-side navigations: reaching another route required a gesture,
        // so by now the gate has fired and `loading` is set — the guard only
        // skips the initial render (whose pageview the gate itself sends).
        const url = window.location.href;
        load().then((posthog) => {
            if (posthog) posthog.capture('$pageview', { $current_url: url });
        });
    }, [path]);

    return null;
}
