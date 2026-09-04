/* ═══ E-META — one head helper, every page ═══════════════════════════
 *
 * Usage (every page, first child of the page component):
 *
 *   import { PageMeta } from './components/e-meta.jsx';
 *   <PageMeta
 *       title="Benchmarks"                     // → "Benchmarks — Pyxle"
 *       description="Measured SSR throughput …"
 *       path="/benchmarks"
 *   />
 *
 * The title law: every document title is "<Page> — Pyxle". The
 * homepage alone passes `fullTitle` to override the pattern. Pyxle's
 * head dedup means these page-level tags override the site-wide
 * fallbacks the root layout declares — a page that forgets PageMeta
 * still ships complete (if generic) meta.
 */

import React from 'react';
import { Head } from 'pyxle/client';

export const SITE_URL = 'https://pyxle.dev';
export const SITE_NAME = 'Pyxle';
export const DEFAULT_TITLE = 'Pyxle — The backend and the page. One file.';
export const DEFAULT_DESCRIPTION =
    'Pyxle is a Python web framework where the data loader and the React page '
    + 'are the same file — so the API layer between them simply doesn\'t exist. '
    + 'Server-rendered, hydrated, MIT.';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/branding/og-default.png`;

export function PageMeta({
    title,
    fullTitle,
    description = DEFAULT_DESCRIPTION,
    path = '/',
    type = 'website',
    image = DEFAULT_OG_IMAGE,
}) {
    const docTitle = fullTitle || (title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE);
    const url = path === '/' ? SITE_URL : `${SITE_URL}${path}`;
    return (
        <Head>
            <title>{docTitle}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={url} />
            <meta property="og:title" content={docTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:type" content={type} />
            <meta property="og:url" content={url} />
            <meta property="og:image" content={image} />
            <meta property="og:site_name" content={SITE_NAME} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:image" content={image} />
        </Head>
    );
}
