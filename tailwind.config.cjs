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
                sans: ['"Schibsted Grotesk Variable"', 'SchibstedFallback', '-apple-system', '"Helvetica Neue"', 'Arial', 'sans-serif'],
                display: ['"Fraunces Variable"', 'FrauncesFallback', 'Georgia', '"Times New Roman"', 'serif'],
                mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
            },
            // Galley Proof palette — every value lives as a CSS variable in
            // tailwind.css so light ("Paper") and dark ("Ink") themes swap
            // without per-utility dark: variants.
            colors: {
                paper:  'var(--c-paper)',        // page background
                ink:    'var(--c-ink)',          // primary text
                ink2:   'var(--c-ink2)',         // secondary text
                rule:   'var(--c-rule)',         // hairlines / borders
                accent: 'var(--c-accent)',       // emerald stroke accent
                acct:   'var(--c-accent-text)',  // emerald at text sizes (AA)
                press:  'var(--c-press)',        // ochre "press ink" (numerals, marginalia)
                plate:  'var(--c-plate)',        // dark code-plate surface
                plateb: 'var(--c-plate-border)', // plate frame border
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
};
