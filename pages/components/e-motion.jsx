/* ═══ E-MOTION — the motion foundation for the E "Program Counter" design ═══
 *
 * One import for every page team:
 *
 *   import { MotionRoot, m, EASE, T, HOUSE_SPRING,
 *            useScrollSpring, useEMotion, useFontsReady } from './components/e-motion.jsx';
 *
 * Laws this file enforces (from the E concept + framer-motion manual):
 *
 *  · LazyMotion `strict` — import `m` from HERE, never `motion` from
 *    'framer-motion'. A stray `motion.div` throws at runtime by design,
 *    so the full-bundle path can't sneak back in. `domMax` is loaded
 *    (layout/layoutId need it).
 *  · MotionConfig reducedMotion="user" at the root — transform/layout
 *    animations disable themselves for reduced-motion visitors. Ambient
 *    loops and scroll-linked values must ALSO stop by hand: gate
 *    useAnimationFrame bodies and style-driven values on
 *    useReducedMotionConfig() (values only — NEVER branch markup on it).
 *  · Hydration: server output and first client render must be
 *    byte-identical. Deterministic initial props only; no window/
 *    matchMedia/Math.random/Date.now in render; useId() for SVG defs;
 *    design every scroll-linked value so its p=0 output is the correct
 *    static frame (useScroll is 0 on the server).
 *  · One clock: T = 2.4s. Every duration is a multiple or fraction.
 *  · House spring ζ≈0.93 — never framer-motion's default bounce.
 *  · Hover: 200ms in, 450ms out — the house ease pair.
 *  · Reveals travel 2px, stagger 60ms, below-the-fold only, and are
 *    armed at runtime so the server-rendered page is always complete
 *    (the first-paint law). That is what useEMotion() does.
 */

import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
    LazyMotion, MotionConfig, domMax, m,
    useSpring, useMotionValueEvent, useReducedMotionConfig,
} from 'framer-motion';

/* Re-export the strict-mode component + the hooks pages reach for, so
   page code has one motion import surface. */
export { m };
export {
    AnimatePresence, useScroll, useTransform, useSpring, useMotionValue,
    useMotionValueEvent, useVelocity, useAnimationFrame, useInView,
    useWillChange, useReducedMotionConfig, useMotionTemplate,
} from 'framer-motion';

/* ── The base clock and the house curves ─────────────────────────── */

/** Base clock, seconds. Ambient pulse = 1.33·T (3.2s, 30% off-rail),
 *  click round trip = 0.4·T out · 0.1·T pause · 0.35·T back. */
export const T = 2.4;

/** House ease — 200ms in, 450ms out pair uses this curve both ways. */
export const EASE = [0.33, 1, 0.68, 1];

/** House spring, ζ ≈ 0.93 — settles with intent, never the cheap
 *  default bounce. Set once on MotionRoot as the tree default. */
export const HOUSE_SPRING = { type: 'spring', stiffness: 260, damping: 30, mass: 1 };

/** Token-entry overshoot (Val Town register) for value tokens only. */
export const TOKEN_SPRING = { type: 'spring', visualDuration: 0.28, bounce: 0.18 };

/* ── MotionRoot — mounted once by pages/layout.pyxl ──────────────── */

export function MotionRoot({ children }) {
    return (
        <LazyMotion features={domMax} strict>
            <MotionConfig reducedMotion="user" transition={HOUSE_SPRING}>
                {children}
            </MotionConfig>
        </LazyMotion>
    );
}

/* ── useScrollSpring — smooth the atmosphere, not the anchors ─────
 * A spring-smoothed follower for a scroll-progress motion value.
 * framer-motion 11 has no `skipInitialAnimation`, so this jumps the
 * spring to the source's current value before first paint — a visitor
 * landing mid-page (back button, anchor link) must NOT watch the
 * whole stage scrub itself into position.
 *
 * Use the RAW progress value for anchors that must land exactly
 * (token arrivals, steps(1) snaps, the seam); use this spring for
 * atmosphere (the caret, region lighting, ambient speed). */

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useScrollSpring(value, config = {}) {
    const { snapGap = 0.15, ...springConfig } = config;
    const spring = useSpring(value, {
        stiffness: 120, damping: 30, mass: 0.6, restDelta: 5e-4, ...springConfig,
    });
    /* A flick or a goto is a TELEPORT in the scrub grammar, not content:
       chasing it on the slow pole (~230ms) replays a stretch of film that
       was never scrolled while every raw-p register already shows the
       destination. When the source outruns the follower by more than
       `snapGap`, jump. The spring smooths within-beat scrubs (the designed
       feel) and tracks exactly across teleports. The default gap is sized
       for 0–1 scroll progress — the only thing this hook feeds today; a
       future non-progress caller must pass its own `snapGap`. */
    useMotionValueEvent(value, 'change', (v) => {
        if (Math.abs(v - spring.get()) > snapGap) spring.jump(v);
    });
    useIsoLayoutEffect(() => {
        spring.jump(value.get());
        // Intentionally mount-only: re-jumping on config change would teleport.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return spring;
}

/* ── useEMotion — the standard below-the-fold reveal ──────────────
 * React port of the prototype's eMotion() (serve-e/e-chrome.js §10).
 * Mark elements with `data-e-reveal`; mark a common parent with
 * `data-e-stagger` to stagger its marked children 60ms apart.
 * Call the hook ONCE per page component.
 *
 * Laws it enforces so pages don't have to:
 *  · static complete first paint — SSR HTML carries no hidden state;
 *    anything already inside the viewport when the hook runs is left
 *    exactly as painted, never re-revealed
 *  · travel is 2px, opacity 0→1, house ease (CSS .e-reveal classes)
 *  · prefers-reduced-motion ⇒ no-op (content is already visible)
 * Runs entirely post-mount (class toggling only) — zero hydration
 * surface, exactly rule 9 of the third-party-packages guide. */

export function useEMotion() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

        const vh = window.innerHeight;
        const below = (el) => el.getBoundingClientRect().top > vh * 0.92;
        const groups = []; /* [[el, el, …], …] — one animation unit each */
        const seen = new Set();
        document.querySelectorAll('[data-e-stagger]').forEach((g) => {
            const kids = [...g.querySelectorAll('[data-e-reveal]')].filter(below);
            if (kids.length) { groups.push(kids); kids.forEach((k) => seen.add(k)); }
        });
        document.querySelectorAll('[data-e-reveal]').forEach((el) => {
            if (!seen.has(el) && below(el)) groups.push([el]);
        });
        if (!groups.length) return undefined;

        const timers = [];
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const kids = entry.target.__eKids || [entry.target];
                kids.forEach((el, i) => timers.push(setTimeout(() => {
                    el.classList.remove('is-out');
                    el.classList.add('is-in');
                }, i * 60)));
                io.unobserve(entry.target);
            });
        }, { threshold: 0.2 });

        for (const kids of groups) {
            kids.forEach((el) => el.classList.add('e-reveal', 'is-out'));
            const target = kids[0].parentElement || kids[0];
            target.__eKids = kids;
            io.observe(target);
        }

        return () => {
            io.disconnect();
            timers.forEach(clearTimeout);
            // Leave nothing hidden behind us (e.g. client-side back-nav
            // remounting a cached tree): reveal everything we concealed.
            groups.flat().forEach((el) => {
                el.classList.remove('is-out');
                el.classList.add('is-in');
            });
        };
    }, []);
}

/* ── useFontsReady — arm DOM-measuring animation after webfonts ───
 * Any animation whose geometry is measured from text (wire anchors,
 * getPointAtLength LUTs) must wait for document.fonts.ready, or a
 * late-landing webfont moves the anchor after measurement. False on
 * the server AND on the first client render — flipping it later is a
 * plain re-render, never a hydration mismatch. */

export function useFontsReady() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let alive = true;
        const fonts = typeof document !== 'undefined' && document.fonts;
        if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
            fonts.ready.then(() => { if (alive) setReady(true); });
        } else {
            setReady(true);
        }
        return () => { alive = false; };
    }, []);
    return ready;
}

/* ── useReducedMotionSafe — reduced-motion as a VALUE, post-mount ──
 * `false` on the server and on the client's first render (identical
 * markup both sides), the real preference after mount. Use it to gate
 * ambient loops and style-driven values. NEVER branch rendered markup
 * on it — markup branches belong in CSS @media rules. */

export function useReducedMotionSafe() {
    const fromConfig = useReducedMotionConfig();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    return mounted ? Boolean(fromConfig) : false;
}
