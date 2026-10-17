// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider, useI18n } from "../i18n";
import { catalogEntry } from "../lib/catalog";
import { createCharacter } from "../lib/project";
import { CatalogPicker } from "./CatalogPicker";
import { CatalogValue } from "./CatalogDisplay";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("dynasty-chronicles:language","fr");
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); });
const options = [catalogEntry("traits","trait_Genius")!,catalogEntry("traits","trait_Mean")!];
function Switcher() {
  const {setPreference} = useI18n();
  return <button onClick={()=>setPreference("de")}>German</button>;
}
it("searches official French names and selects stable game IDs", () => {
  const choose = vi.fn();
  act(()=>root.render(<LanguageProvider><CatalogPicker kind="traits" label="Traits" options={options} selected={[]} onChange={choose} alwaysOpen /></LanguageProvider>));
  const search = container.querySelector<HTMLInputElement>(".catalog-search input")!;
  act(()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"Génies");
    search.dispatchEvent(new Event("input",{bubbles:true}));
  });
  const results = container.querySelectorAll<HTMLButtonElement>(".catalog-option");
  expect(results).toHaveLength(1); expect(results[0].textContent).toContain("Génies");
  act(()=>results[0].click()); expect(choose).toHaveBeenLastCalledWith(["trait_Genius"]);
});
it("updates chosen chips and legacy catalog values on language change while preserving custom text", () => {
  const change = vi.fn(); const character = createCharacter("Custom person");
  act(()=>root.render(<LanguageProvider><Switcher />
    <CatalogPicker kind="traits" label="Traits" options={options} selected={["trait_Genius"]} onChange={change} customValues={["Моя личная черта"]} />
    <CatalogValue kind="traits" value="Гений" character={character} />
    <CatalogValue kind="traits" value="Мой собственный текст" character={character} />
  </LanguageProvider>));
  expect(container.querySelector(".catalog-chip")?.textContent).toContain("Génies");
  expect(container.querySelector(".catalog-display")?.textContent).toContain("Génies");
  act(()=>container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelector(".catalog-chip")?.textContent).toContain("Genie");
  expect(container.querySelector(".catalog-display")?.textContent).toContain("Genie");
  expect(container.textContent).toContain("Моя личная черта"); expect(container.textContent).toContain("Мой собственный текст");
  expect(change).not.toHaveBeenCalled();
  expect(character.displayName).toBe("Custom person");
});
