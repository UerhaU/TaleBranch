import { describe, expect, it } from "vitest";
import { getMissingTranslationKeys, supportedLocales } from "./index";

describe("translation dictionaries", () => {
  it.each(supportedLocales)("contains every system string for $label", ({ code }) => {
    expect(getMissingTranslationKeys(code)).toEqual([]);
  });
});
