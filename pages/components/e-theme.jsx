/* ═══ E-THEME — the light/dark theme context ═════════════════════════
 *
 * The switcher's mechanics replicate the pre-redesign app exactly
 * (pages/layout.pyxl @ a2c2084, the behavioural spec):
 *
 *  · persistence — localStorage key `pyxle-theme`, values 'light'/'dark'
 *  · default — LIGHT (F: the printed copy is the identity; dark is the
 *    reader's lamp). Anything unset/invalid falls through to light, and
 *    prefers-color-scheme is deliberately never consulted
 *  · no-FOUC — the inline boot script in layout.pyxl stamps
 *    `html.light`/`html.dark` (plus `js`) before first paint; SSR HTML
 *    carries NO theme class, so served markup is theme-neutral
 *
 * The hydration law this module exists to uphold: SSR cannot read
 * localStorage, so `theme` state is 'light' on the server AND on the
 * first client render — the provider syncs to the boot-stamped class
 * in an effect, post-mount. Anything whose RENDERED OUTPUT depends on
 * the theme (the stage's framer color-interpolation endpoints) re-renders
 * in that second pass, so SSR and the first client render stay
 * byte-identical in both themes; anything CSS-var-driven (95% of E)
 * was already painted correctly by the boot class. Markup must never
 * branch on `theme` in a way SSR can't reproduce — the toggle glyph is
 * CSS-gated for exactly this reason (components/theme-toggle.jsx).
 */

import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

export const THEME_KEY = 'pyxle-theme';

/* <meta name="theme-color"> follows the ground token. The boot script
   sets it pre-paint for a stored light theme; this map keeps it in
   sync across toggles. */
const THEME_COLOR = { light: '#FBFBF9', dark: '#20231D' };

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    /* 'light' on the server and the first client render, ALWAYS — the
       live value lands via the effect below. Never read the DOM here:
       a lazy initializer that saw `html.dark` would make the first
       client render disagree with the theme-blind SSR bytes. */
    const [theme, setTheme] = useState('light');
    const booted = useRef(false);

    useEffect(() => {
        if (!booted.current) {
            booted.current = true;
            /* Adopt the boot script's pre-paint decision. The class IS
               the source of truth at this point — reading localStorage
               again could disagree with what was actually painted. */
            const stamped = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            if (stamped !== theme) {
                setTheme(stamped);
                return; // the re-run persists; nothing to stamp — the class is already right
            }
        }
        const c = document.documentElement.classList;
        c.remove('light', 'dark');
        c.add(theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {
            /* private mode / storage denied — the in-session theme still works */
        }
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
            m.setAttribute('content', THEME_COLOR[theme]);
        });
    }, [theme]);

    const toggle = useCallback(() => {
        setTheme((t) => (t === 'light' ? 'dark' : 'light'));
    }, []);

    const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
