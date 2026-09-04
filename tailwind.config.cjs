/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        "./pages/**/*.{pyxl,js,jsx,ts,tsx}",
        "./.pyxle-build/client/pages/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                // F "Working Copy" pairing. IBM Plex Sans carries the claims
                // (H1/H2, notes); IBM Plex Mono carries the evidence — code,
                // numerals, captions, logs, commands, tabs. Both are cuts of
                // one Plex family: the claim and the receipt share bones.
                sans: ['"IBM Plex Sans Variable"', '"IBM Plex Sans"', 'PlexSansFallback', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                mono: ['"IBM Plex Mono"', 'PlexMonoFallback', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
            },
            // ── F "Working Copy" palette ─────────────────────────────
            // Every value lives as a CSS variable in styles/tailwind.css
            // (light on :root, the lamp copy under html.dark). ONE accent:
            // Run Green, and its every appearance means "code that runs"
            // (seam · prompts/copied · LIVE/200s · Install · decorator
            // tokens · execution). Links and headings are never green.
            colors: {
                bond:      'var(--bond)',       // the page
                sheet:     'var(--sheet)',      // paper-on-paper panes
                deck:      'var(--deck)',       // quiet beds
                deck2:     'var(--deck2)',      // plate bed, one step deeper
                rule:      'var(--rule)',       // default hairline
                rule2:     'var(--rule2)',      // section-divider rules
                ink:       'var(--ink)',        // text
                graphite:  'var(--graphite)',   // secondary text
                faint:     'var(--faint)',      // line numbers, disabled
                green:     'var(--green)',      // Run Green — code that runs
                tint:      'var(--tint)',       // the green wash
                term:      'var(--term)',       // quoted terminals only
                termtext:  'var(--term-text)',
                termdim:   'var(--term-dim)',
                termgreen: 'var(--term-green)',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
};
