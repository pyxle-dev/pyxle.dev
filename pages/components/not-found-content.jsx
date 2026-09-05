import '../styles/not-found.css';
import React, { useEffect, useState } from 'react';
import { Link } from 'pyxle/client';

/* ════════════════════════════════════════════════════════════════
   THE WORKING COPY · the 404, printed.
   Rulebar `?? · NOT FOUND` with the status as the folio numeral,
   the couplet stating the miss, and the exits as a short ruled
   list of real routes. Headless — renders the 404 body without
   chrome. Used by both not-found.pyxl (standalone, inside `.lost`)
   and the docs catch-all (embedded in its own container).

   Props:
     backHref  — where the back link points (default: "/")
     backLabel — its label (default: "back to the homepage")
     sourceUrl — accepted for compatibility with existing callers;
                 unused here — the shared footer carries the real
                 "⟨/⟩ view source" link on every page.

   Hydration: the server renders the literal placeholder "this
   path" in the receipt; the client fills in location.pathname
   post-mount via state — a plain re-render, never a mismatch.
   The static `seen` wrapper reveals the rulebar apparatus at once
   (this page has no scroll story to stage).
   ════════════════════════════════════════════════════════════════ */

export default function NotFoundContent({
    backHref = '/',
    backLabel = 'back to the homepage',
    // eslint-disable-next-line no-unused-vars
    sourceUrl,
} = {}) {
    const [path, setPath] = useState('this path');
    useEffect(() => {
        if (window.location.pathname) setPath(window.location.pathname);
    }, []);

    return (
        <div className="nf-wrap">
            <div className="nf-box seen">
                <div className="rulebar">
                    <span className="tab">?? · Not found</span>
                    <span className="folio" aria-hidden="true">404</span>
                </div>
                <h1>No such file.</h1>
                <p className="receipt">GET {path} → 404 · nothing at this route in pages/</p>
                <ul className="nf-exits">
                    <li><Link className="link" href="/">/</Link><span>— the homepage</span></li>
                    <li><Link className="link" href="/docs">/docs</Link><span>— the manual</span></li>
                    <li><Link className="link" href="/playground">/playground</Link><span>— run .pyxl in your browser</span></li>
                </ul>
                <p className="nf-back">
                    <Link className="link" href={backHref}>{backLabel} <span className="a">→</span></Link>
                </p>
            </div>
        </div>
    );
}
