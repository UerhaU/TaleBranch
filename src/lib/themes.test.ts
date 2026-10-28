import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../hooks/useAppearance";

// Contrast of every built-in theme in both modes, by the WCAG AA rule:
// text at least 4.5 : 1; icons, focus rings and lines on the field at least 3 : 1.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

type Color = { r: number; g: number; b: number; a: number };

function parseHex(value: string): Color {
  const hex = value.replace("#", "");
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

/** A translucent color laid over an opaque background. */
function over(top: Color, bottom: Color): Color {
  const mix = (k: "r" | "g" | "b") => Math.round(top[k] * top.a + bottom[k] * (1 - top.a));
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
}

function luminance({ r, g, b }: Color) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Color, b: Color) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function hexVars(body: string) {
  const vars: Record<string, Color> = {};
  for (const [, name, value] of body.matchAll(/--tb-([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g))
    vars[name] = parseHex(value);
  return vars;
}

const shared = hexVars(css.slice(0, css.indexOf("}")));
function variant(theme: string, mode: string) {
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\[data-mode="${mode}"\\]\\s*\\{([^}]*)\\}`).exec(css);
  return block ? { ...shared, ...hexVars(block[1]) } : undefined;
}

// [what is checked, color, background (top@under for a translucent layer), minimum, color opacity]
const pairs: Array<[string, string, string, number, number?]> = [
  ["text on a panel", "text", "surface", 4.5],
  ["text in a field or menu", "text", "surface-2", 4.5],
  ["text on hover", "text", "surface-3", 4.5],
  ["text on glass over the field", "text", "glass@canvas", 4.5],
  ["text on a card", "text", "card-bg", 4.5],
  ["muted text on a panel", "text-muted", "surface", 4.5],
  ["muted text in a menu", "text-muted", "surface-2", 4.5],
  ["muted text on glass", "text-muted", "glass@canvas", 4.5],
  ["life stage on a card", "text-muted", "card-bg", 4.5],
  ["life stage on a dead character's card", "text-muted", "card-muted-bg", 4.5],
  ["icons and hints", "text-faint", "surface", 3],
  ["text on the main button (start)", "on-accent", "accent", 4.5],
  ["text on the main button (end)", "on-accent", "accent-2", 4.5],
  ["links and the active item", "accent-text", "surface", 4.5],
  ["active item on its backdrop", "accent-text", "accent-soft@surface", 4.5],
  ["text on the accent backdrop", "text", "accent-soft@surface", 4.5],
  ["text on the pink backdrop", "text", "pink-soft@surface", 4.5],
  ["text on the wheat backdrop", "text", "wheat-soft@surface", 4.5],
  ["text on the sky backdrop", "text", "sky-soft@surface", 4.5],
  ["text on the mint backdrop", "text", "mint-soft@surface", 4.5],
  ["text on the red button", "on-danger", "danger", 4.5],
  ["red text in a menu", "danger-text", "surface-2", 4.5],
  ["text on the error backdrop", "text", "danger-soft@surface", 4.5],
  ["«Saved»", "success-text", "surface", 4.5],
  ["«Saving…»", "warning-text", "surface", 4.5],
  ["focus ring", "focus", "canvas", 3],
  ["family line", "kin-line", "canvas", 3],
  ["relationship line (85 % opacity)", "rel-line", "canvas", 3, 0.85],
];

function resolve(vars: Record<string, Color>, name: string): Color {
  const [top, under] = name.split("@");
  const color = vars[top];
  if (!color) throw new Error(`no --tb-${top}`);
  return under ? over(color, resolve(vars, under)) : color;
}

describe("built-in themes", () => {
  const variants = THEMES.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme, mode] as const));

  it("defines all 12 variants", () => {
    expect(variants).toHaveLength(12);
    for (const [theme, mode] of variants) expect(variant(theme, mode), `${theme}/${mode}`).toBeDefined();
  });

  it.each(variants)("keeps readable contrast in %s / %s", (theme, mode) => {
    const vars = variant(theme, mode)!;
    const failures = pairs.flatMap(([label, fg, bg, need, alpha]) => {
      const back = resolve(vars, bg);
      let color = resolve(vars, fg);
      if (alpha) color = over({ ...color, a: alpha }, back);
      const value = ratio(color, back);
      return value >= need ? [] : [`${label}: ${value.toFixed(2)} < ${need}`];
    });
    expect(failures).toEqual([]);
  });

  it("gives every theme except the classic one a heading font, a field pattern and a card ornament", () => {
    for (const theme of THEMES.filter((name) => name !== "default")) {
      const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(block, theme).toMatch(/--tb-font-display:/);
      expect(block, theme).toMatch(/--tb-pattern: url\(/);
      expect(block, theme).toMatch(/--tb-card-deco: url\(/);
    }
  });
});
