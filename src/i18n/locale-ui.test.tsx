// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useI18n, type LocaleCode, translateMessage } from "./index";
import { CharacterDialog } from "../components/CharacterDialog";
import { LinkDialog } from "../components/LinkDialog";
import { createCharacter, createDemoProject } from "../lib/project";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function click(label: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent?.trim() === label);
  if (!button) throw Error(`Missing button: ${label}`);
  act(() => button.click());
}
function LanguageControl() {
  const { setPreference } = useI18n();
  return <button onClick={() => setPreference("de")}>Switch locale</button>;
}

describe("localized profile forms", () => {
  it.each([
    ["de", "Geschlecht", "Weiblich", "Männlich", "Katze"],
    ["fr", "Sexe", "Femelle", "Mâle", "Chat"],
    ["es", "Sexo", "Hembra", "Macho", "Gato"],
    ["pt-BR", "Sexo", "Fêmea", "Macho", "Gato"],
    ["zh-CN", "性别", "雌性", "雄性", "猫"],
    ["sr", "Пол", "Женски", "Мушки", "Мачка"],
  ] as const)("renders %s pet fields in the selected language", (code, sexLabel, female, male, cat) => {
    localStorage.setItem("dynasty-chronicles:language", code);
    const owner = createCharacter("Owner");
    const pet = createCharacter("Барсик", "pet", { species: "Кошка", ownerIds: [owner.id] });
    const save = vi.fn();
    act(() => root.render(<LanguageProvider><CharacterDialog character={pet} ownerCandidates={[owner]} onClose={vi.fn()} onSave={save} /></LanguageProvider>));
    const sexField = Array.from(container.querySelectorAll("label")).find(item => item.querySelector("span")?.textContent === sexLabel)!;
    expect(Array.from(sexField.querySelector("select")!.options).filter(item => item.value).map(item => item.text)).toEqual([female, male]);
    expect(Array.from(container.querySelectorAll("option")).some(option => option.text === cat)).toBe(true);
    expect(container.querySelector(".owner-options small")?.textContent).not.toContain("Select at least one owner");
    click(translateMessage(code as LocaleCode, "save"));
    expect(save.mock.calls[0][0]).toMatchObject({ displayName: "Барсик", species: "Кошка", ownerIds: [owner.id], lifeStage: pet.lifeStage });
  });

  it("switches language without translating or changing saved character values", () => {
    localStorage.setItem("dynasty-chronicles:language", "fr");
    const character = createCharacter("Вера Воронова", "sim", { biography: "Моя собственная история", gender: "female" });
    const before = structuredClone(character), save = vi.fn();
    act(() => root.render(<LanguageProvider><LanguageControl /><CharacterDialog character={character} onClose={vi.fn()} onSave={save} /></LanguageProvider>));
    click("Switch locale");
    expect(document.documentElement.lang).toBe("de");
    expect(container.textContent).toContain("Foto hochladen");
    click("Speichern");
    expect(save.mock.calls[0][0]).toMatchObject({ displayName: before.displayName, biography: before.biography, gender: before.gender, stages: before.stages, lifeStage: before.lifeStage });
    expect(character).toEqual(before);
  });
  it.each(["ru", "en", "de", "fr", "es", "pt-BR", "zh-CN", "sr", "koi"] as const)("shows distinct young and adult ages in the %s form", locale => {
    localStorage.setItem("dynasty-chronicles:language", locale);
    const character = createCharacter("Age check");
    act(() => root.render(<LanguageProvider><CharacterDialog character={character} onClose={vi.fn()} onSave={vi.fn()} /></LanguageProvider>));
    const age = container.querySelector<HTMLSelectElement>(".age-select select")!;
    const options = Array.from(age.options);
    expect(options.find(item => item.value === "Молодой")?.text).toBe(translateMessage(locale, "stageYoungAdult"));
    expect(options.find(item => item.value === "Взрослый")?.text).toBe(translateMessage(locale, "stageAdult"));
    expect(age.value).toBe("Молодой"); expect(options).toHaveLength(8);
  });

  it("displays localized built-in family roles while saving canonical values", () => {
    localStorage.setItem("dynasty-chronicles:language", "fr");
    const parent = vi.fn();
    act(() => root.render(<LanguageProvider><LinkDialog project={createDemoProject()} onClose={vi.fn()} onParent={parent} onPair={vi.fn()} /></LanguageProvider>));
    const type = container.querySelector<HTMLInputElement>('input[list="family-kinds"]')!;
    expect(type.value).toBe("Biologique");
    expect(Array.from(container.querySelectorAll<HTMLDataListElement>("datalist option")).some(option => option.getAttribute("value") === "Биологическое")).toBe(false);
    click(translateMessage("fr", "addConnection"));
    expect(parent.mock.calls[0][0]).toMatchObject({ kind: "Биологическое", parentRole: "Родитель", childRole: "Ребёнок" });
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(type, translateMessage("fr", "adoption"));
      type.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(translateMessage("fr", "addConnection"));
    expect(parent.mock.calls.at(-1)![0]).toMatchObject({ kind: "Усыновление", biological: "no" });
  });
});
