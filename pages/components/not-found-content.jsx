import React, { useState, useEffect } from 'react';
import { PMark, InkButton, EditorialLink } from './galley.jsx';

/* ════════════════════════════════════════════════════════════════
   GALLEY PROOF — the 404, typeset like a printer's apology slip.
   The mark draws itself, the number paints immediately, and only
   its period performs. Everything else is quiet paper and ink.
   ════════════════════════════════════════════════════════════════ */

const PHRASES = [
    "You've wandered into the void.",
    "This page is on a coffee break.",
    "404: File not found. Meaning not found either.",
    "Looks like this route took a wrong turn.",
    "The page you seek does not exist. Yet.",
    "Nothing here but cosmic dust.",
    "This page has been abducted by aliens.",
    "Error 404: Reality not found.",
    "You've reached the edge of the internet.",
    "This page went out for milk and never came back.",
    "The bits are all there. Just not in the right order.",
    "Lost? Even GPS can't help you here.",
    "This page is playing hide and seek. It's winning.",
    "404: The page has left the building.",
    "Congratulations, you found nothing.",
    "This page exists in a parallel universe.",
    "The server looked everywhere. Twice.",
    "Page not found. But you found this, so that's something.",
    "This URL is a dead end. Like a cul-de-sac, but digital.",
    "Somewhere, a developer forgot to create this page.",
];

/**
 * Headless 404 content component — renders the 404 body without any header/nav.
 * Used by both not-found.pyxl (standalone) and docs/[[...slug]].pyxl (embedded).
 *
 * Props:
 *   backHref  — where the "Back to ..." button links (default: "/")
 *   backLabel — label for the back button (default: "Back to home")
 *   sourceUrl — URL for the "View source" link (optional)
 */
export default function NotFoundContent({ backHref = '/', backLabel = 'Back to home', sourceUrl } = {}) {
    /* Hydration-safe marginalia: the server prints an empty line (the
       min-height holds the column), the client fills it in. */
    const [phrase, setPhrase] = useState('');
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    }, []);

    const shufflePhrase = () => {
        setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
        setCounter(c => c + 1);
    };

    return (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8">
            <div className="flex w-full max-w-xl flex-col items-center text-center">
                <PMark size={64} load id="nf" />

                {/* The number paints immediately; only its period performs. */}
                <p className="mt-10 font-display text-[clamp(6rem,16vw,9rem)] font-[560] leading-none tracking-[-0.015em] text-ink">
                    404<span className="gp-dot-load ml-[0.06em] inline-block h-[0.1em] w-[0.1em] rounded-full bg-accent" style={{ ['--dot-delay']: '1000ms' }} aria-hidden="true" />
                    <span className="sr-only">.</span>
                </p>

                <h1 className="mt-6 font-display text-[1.5rem] font-[540] tracking-[-0.01em] text-ink">
                    Page not found.
                </h1>

                <div className="mt-5">
                    {/* Upright on purpose — the Fraunces italic face isn't
                       loaded (81KB for one phrase), and synthetic oblique
                       looks wrong on a serif. */}
                    <p className="min-h-[3.6rem] max-w-[44ch] font-display text-[1.1rem] font-[460] leading-[1.6] text-ink2">
                        {phrase}
                    </p>
                    <button
                        type="button"
                        onClick={shufflePhrase}
                        className="focus-ring mt-2 rounded font-mono text-[12px] text-ink2 underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                    >
                        {counter > 4 ? 'You really like clicking this, huh?' : 'Click for another one'}
                    </button>
                </div>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
                    <InkButton href={backHref}>{backLabel}</InkButton>
                    <EditorialLink href="https://github.com/pyxle-dev/pyxle/issues" external>Report an issue ↗</EditorialLink>
                </div>

                {/* The wire transcript — a typeset footnote, not a feature. */}
                <div className="mt-16 space-y-1 font-mono text-xs leading-relaxed text-ink2 opacity-70">
                    <p>GET {typeof window !== 'undefined' ? window.location.pathname : '/unknown'} HTTP/1.1</p>
                    <p>Status: 404 Not Found</p>
                    <p>X-Powered-By: Pyxle</p>
                    {sourceUrl && (
                        <p className="pt-2">
                            <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="focus-ring rounded underline decoration-1 underline-offset-4 transition-colors hover:text-ink"
                            >
                                View source
                            </a>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
