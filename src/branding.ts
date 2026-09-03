/**
 * Brand mark: an open book, the plainest signal for a book index.
 *
 * The teal is drawn from DOAB's own site palette so the service reads as belonging to the
 * open-access book ecosystem. The mark is original and geometric; it deliberately does not
 * reproduce or imitate the DOAB logo, and this project is not affiliated with DOAB or OAPEN.
 * See the independence notice on the landing page and in the README.
 */
export const BRAND_TEAL = "#0F7B8A";

export const ICON_PATH = "/icon.svg";

/** Standalone icon document, served at ICON_PATH and referenced as the favicon. */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-labelledby="t">
  <title id="t">DOAB Discovery MCP</title>
  <rect width="48" height="48" rx="11" fill="${BRAND_TEAL}"/>
  <path d="M24 17c-3.6-2.4-7.5-3.1-11.5-2.9v18c4-.2 7.9.5 11.5 2.9 3.6-2.4 7.5-3.1 11.5-2.9v-18c-4-.2-7.9.5-11.5 2.9Z" fill="#fff"/>
  <path d="M24 17v18" fill="none" stroke="${BRAND_TEAL}" stroke-width="2.4" stroke-linecap="round"/>
</svg>
`;

/**
 * Inline variant for the page header. Inlined rather than an <img> so it needs no image request,
 * and marked aria-hidden because the adjacent <h1> already names the service.
 */
export const inlineIconMarkup = (size: number): string =>
  `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
  `<rect width="48" height="48" rx="11" fill="${BRAND_TEAL}"/>` +
  `<path d="M24 17c-3.6-2.4-7.5-3.1-11.5-2.9v18c4-.2 7.9.5 11.5 2.9 3.6-2.4 7.5-3.1 11.5-2.9v-18c-4-.2-7.9.5-11.5 2.9Z" fill="#fff"/>` +
  `<path d="M24 17v18" fill="none" stroke="${BRAND_TEAL}" stroke-width="2.4" stroke-linecap="round"/>` +
  `</svg>`;
