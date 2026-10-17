import { describe, expect, it } from "vitest";
import { getMissingTranslationKeys, getTranslationKeys, supportedLocales, translateMessage, translateSystemValue } from "./index";
import koiPending from "./locales/koi-pending.json";

describe("translation dictionaries", () => {
  it.each(supportedLocales.filter(locale => locale.code !== "koi"))("contains every base and new system string for $label", ({ code }) => {
    expect(getMissingTranslationKeys(code)).toEqual([]);
  });
  it("records the exact remaining Komi-Permyak gaps instead of hiding them behind English", () => {
    expect(getMissingTranslationKeys("koi").sort()).toEqual(koiPending);
    expect(translateMessage("koi", "retrySave")).toBe(translateMessage("ru", "retrySave"));
    expect(translateMessage("koi", "save")).toBe("Видзны");
  });
  it.each(supportedLocales)("preserves interpolation variables in $label", ({ code }) => {
    const variables = (text: string) => Array.from(text.matchAll(/\{(\w+)\}/g), match => match[1]).sort();
    for (const key of getTranslationKeys()) {
      expect(variables(translateMessage(code, key)), `${code}: ${key}`).toEqual(variables(translateMessage("en", key)));
    }
  });
  it.each(supportedLocales)("does not render empty messages for $label", ({ code }) => {
    for (const key of getTranslationKeys()) expect(translateMessage(code, key).trim(), `${code}: ${key}`).not.toBe("");
  });
  it.each([
    ["de", "Dynastie", "Foto hochladen"], ["fr", "Dynastie", "Importer une photo"],
    ["es", "Dinastía", "Subir foto"], ["pt-BR", "Dinastia", "Carregar foto"],
    ["zh-CN", "家族", "上传照片"], ["sr", "Династија", "Отпреми фотографију"],
  ] as const)("uses the own %s dictionary before the English fallback", (code, dynasty, upload) => {
    expect(translateMessage(code, "project")).toBe(dynasty);
    expect(translateMessage(code, "uploadProfilePhoto")).toBe(upload);
    expect(translateMessage(code, "noDynastyHint")).not.toBe(translateMessage("en", "noDynastyHint"));
  });
  it("translates system species and ages without altering custom content", () => {
    expect(translateSystemValue("fr", "Кошка")).toBe("Chat");
    expect(translateSystemValue("de", "Щенок")).toBe("Welpe");
    expect(translateSystemValue("zh-CN", "Жеребёнок")).toBe("幼马");
    expect(translateSystemValue("es", "Барсик из дома Вороновых")).toBe("Барсик из дома Вороновых");
    expect(translateMessage("fr", "profilePhotoStage", { stage: "Chaton" })).toContain("Chaton");
  });
});
