// XS: the IconButton's 44 px hit area (`.icon-button::after { inset: -6px }`) poked out of the Quantity stepper's control
// and put scrollbars in the Add to Shopping List sheet body (2 px at the bottom, 1 px on the right, with size="full").
// Contract (any fix that keeps it true is fine): the stepper buttons' hit area must stay inside the stepper control, i.e.
//   - it is not drawn (display: none) or its outset is 0; OR
//   - its outset (the negative inset) is no larger than the room the control leaves around the button, on BOTH axes
//     (inline room = border + padding-inline; block room = half of the min-block-size not used by the button); OR
//   - the stepper control (or field) clips it with `overflow: clip` and an `overflow-clip-margin` of at least 5 px, so the
//     3 px focus ring + 2 px offset stays visible. (`overflow: hidden` is not accepted: it would cut the focus ring.)
import { describe, expect, it } from "vitest";
import { declarations, readUiCss } from "../test-utils";

const field = readUiCss("fields/Field.css");
const iconButton = readUiCss("IconButton.css");

const TOKENS: Record<string, number> = {
  "--space-1": 4,
  "--space-2": 8,
  "--space-3": 12,
  "--field-border-width": 1.5,
};
const px = (v: string | undefined, fallback = 0): number => {
  if (v === undefined) return fallback;
  const t = v
    .trim()
    .replace(
      /^var\((--[a-z0-9-]+)\)$/,
      (_, name: string) => `${TOKENS[name] ?? "NaN"}px`,
    );
  if (t === "0") return 0;
  const m = /^(-?\d*\.?\d+)px$/.exec(t);
  return m ? Number(m[1]) : Number.NaN;
};
const tryDecl = (css: string, selector: string): Record<string, string> => {
  try {
    return declarations(css, selector);
  } catch {
    return {};
  }
};

const control = () => ({
  ...tryDecl(field, ".ui-field__control"),
  ...tryDecl(field, ".ui-field--stepper .ui-field__control"),
});
const hit = () => ({
  ...tryDecl(iconButton, ".icon-button::after"),
  ...tryDecl(field, ".ui-field--stepper .icon-button::after"),
});

/** how far the hit area sticks out of the button (px); 0 when it is not drawn */
function outset(): number {
  const h = hit();
  if (h.display === "none" || h.content === "none") return 0;
  const first = (h.inset ?? "").split(" ")[0];
  const sides = ["top", "right", "bottom", "left"].map((s) =>
    px(
      h[`inset-${s === "top" || s === "bottom" ? "block" : "inline"}`] ??
        h[s] ??
        first,
    ),
  );
  return Math.max(0, ...sides.map((n) => -n));
}

function padInline(c: Record<string, string>): number {
  if (c["padding-inline"]) return px(c["padding-inline"].split(" ")[0]);
  const parts = (c.padding ?? "0").split(" ");
  return px(parts[1] ?? parts[0]);
}

function clipped(): boolean {
  return [
    control(),
    tryDecl(field, ".ui-field--stepper"),
    tryDecl(field, ".ui-field"),
  ].some((d) => d.overflow === "clip" && px(d["overflow-clip-margin"]) >= 5);
}

describe("the stepper hit area stays inside its field (no scrollbars in a sheet body)", () => {
  it("the outset is a number we can read", () => {
    expect(Number.isFinite(outset())).toBe(true);
  });

  it("is not drawn, clipped with a focus-safe clip margin, or fits the control on the inline axis", () => {
    const border = px(
      tryDecl(field, ".ui-field__control").border?.split(" ")[0],
    ); // 1.5px (--field-border-width)
    expect(
      outset() === 0 || clipped() || outset() <= border + padInline(control()),
    ).toBe(true);
  });

  it("is not drawn, clipped with a focus-safe clip margin, or fits the control on the block axis", () => {
    const c = control();
    const btn = px(
      { ...tryDecl(field, ".ui-field--stepper .icon-button") }["block-size"],
      40,
    );
    const room = Math.max(
      (px(c["min-block-size"], 0) - btn) / 2,
      px(c["padding-block"] ?? c["padding-top"], 0),
    );
    expect(outset() === 0 || clipped() || outset() <= room).toBe(true);
  });
});
