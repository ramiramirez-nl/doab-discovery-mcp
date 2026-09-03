import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { BRAND_TEAL, ICON_SVG, inlineIconMarkup } from "../src/branding.js";

describe("brand mark", () => {
  /**
   * The README and the served favicon must not drift apart. `assets/icon.svg` is a generated
   * copy of ICON_SVG committed so GitHub can render it above the title; regenerate it with
   * `npm run build && node -e "…"` rather than editing it by hand.
   */
  test("the committed asset matches the served icon exactly", () => {
    expect(readFileSync("assets/icon.svg", "utf8")).toBe(ICON_SVG);
  });

  test("the inline header variant draws the same shape as the standalone icon", () => {
    const shapes = (markup: string) => markup.match(/ d="[^"]+"/g);

    expect(shapes(inlineIconMarkup(40))).toEqual(shapes(ICON_SVG));
    expect(inlineIconMarkup(40)).toContain(BRAND_TEAL);
  });

  test("the icon carries an accessible name and the header variant does not repeat it", () => {
    expect(ICON_SVG).toContain('role="img"');
    expect(ICON_SVG).toContain("<title");
    // The page header already names the service in its <h1>.
    expect(inlineIconMarkup(40)).toContain('aria-hidden="true"');
    expect(inlineIconMarkup(40)).not.toContain("<title");
  });
});
