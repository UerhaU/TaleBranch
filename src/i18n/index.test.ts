import { describe, expect, it } from "vitest";
import { getMissingTranslationKeys, getTranslationKeys, supportedLocales, translateMessage, translateSystemValue } from "./index";

describe("translation dictionaries", () => {
  it.each(supportedLocales)("contains every base and new system string for $label", ({ code }) => {
    expect(getMissingTranslationKeys(code)).toEqual([]);
  });
  it("uses Komi-Permyak translations for the welcome screen, support and file operations", () => {
    for (const key of ["noDynastyTitle", "noDynastyHint", "folderHint", "supportPage", "supportPageText", "retrySave", "deleteFolderDynastyHint", "profilePhoto"]) {
      expect(translateMessage("koi", key)).not.toBe(translateMessage("ru", key));
    }
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
  it.each([
    ["ru", "Молодой"], ["en", "Young"], ["de", "Jung"], ["fr", "Jeune"],
    ["es", "Joven"], ["pt-BR", "Jovem"], ["zh-CN", "青年"], ["sr", "Млад"], ["koi", "Том"],
  ] as const)("shows the separate young age in %s, including old saved names", (locale, label) => {
    expect(translateSystemValue(locale, "Молодой")).toBe(label);
    expect(translateSystemValue(locale, "Молодой взрослый")).toBe(label);
    expect(translateSystemValue(locale, "Взрослый")).not.toBe(label);
  });
  it("keeps Komi letters with diaeresis precomposed in the story placeholder", () => {
    const text = translateMessage("koi", "storyEmpty");
    expect(text).toContain("ӧ"); expect(text).toBe(text.normalize("NFC"));
    expect(text).not.toContain("\u0308");
  });
});
