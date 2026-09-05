/* ═══ THEME TOGGLE — the light/dark instrument control ═══════════════
 *
 * The pre-redesign app's control, redrawn in the house voice: one chromeless
 * mono button (`.tgl`, styles/tailwind.css §2), one currentColor glyph.
 * Half-moon fills in dark, a small solid dot in light — the two halves
 * are CSS-gated on the html theme class (`html.dark .tgl .moon` etc.),
 * NEVER a JS branch: SSR is theme-blind, so any markup that branched on
 * the theme would be a hydration mismatch. The button's markup — glyph,
 * aria-label, title — is byte-identical in both themes and on the
 * server. `html:not(.js) .tgl` hides the control when it cannot work.
 *
 * Mounted by chrome.jsx: desktop header (.hd-extra, last item on the
 * right — where the original app kept it) and the mobile bar.
 */

import React from 'react';
import { useTheme } from './theme.jsx';

function ThemeGlyph() {
    return (
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
            <path className="moon" d="M10 2.75 a7.25 7.25 0 0 0 0 14.5 Z" fill="currentColor" />
            <circle className="dot" cx="10" cy="10" r="3" fill="currentColor" />
        </svg>
    );
}

export function ThemeToggle({ className = '' }) {
    const { toggle } = useTheme();
    return (
        <button
            type="button"
            onClick={toggle}
            className={`tgl${className ? ` ${className}` : ''}`}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
        >
            <ThemeGlyph />
        </button>
    );
}

export default ThemeToggle;
