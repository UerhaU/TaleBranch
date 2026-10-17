// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { createCharacter, createEmptyProject } from "../lib/project";
import { LinkDialog } from "./LinkDialog";

let root: Root, container: HTMLDivElement;
const parent = vi.fn(), pair = vi.fn(), close = vi.fn();
const makeProject = () => {
  const project = createEmptyProject();
  project.characters = [
    createCharacter("Анна Воробьёва", "sim", { id:"anna", lifeStage:"Взрослый" }),
    createCharacter("Борис Воробьёв", "sim", { id:"boris", lifeStage:"Ребёнок" }),
    createCharacter("Тестовый псевдоним", "sim", { id:"maria", firstName:"Мария", lastName:"Соколова", aliases:["Маша"] }),
  ];
  return project;
};
beforeEach(()=>{
  localStorage.clear(); localStorage.setItem("dynasty-chronicles:language","ru");
  (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  parent.mockReset(); pair.mockReset(); close.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(()=>{ act(()=>root.unmount()); container.remove(); });
function mount(project=makeProject(), initialKind:"parent"|"pair"="parent") {
  act(()=>root.render(<LanguageProvider><LinkDialog project={project} initialKind={initialKind} onClose={close} onParent={parent} onPair={pair} /></LanguageProvider>));
}
function click(label:string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.textContent?.trim()===label || item.getAttribute("aria-label")===label);
  if (!button) throw Error("Missing button: "+label);
  act(()=>button.click());
}
function typeSearch(value:string) {
  const input=container.querySelector<HTMLInputElement>('input[type="search"]')!;
  act(()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  return input;
}
const choices = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
const names = () => Array.from(container.querySelectorAll<HTMLElement>('[role="combobox"] strong')).map(item=>item.textContent);

describe("choosing and swapping relationship characters",()=>{
  it("searches both parent and child lists by name without case or ё differences",()=>{
    mount(); click("Родитель"); typeSearch("БОРИС ВОРОБЬЕВ");
    expect(choices()).toHaveLength(1); expect(choices()[0].textContent).toContain("Борис Воробьёв");
    act(()=>choices()[0].click());
    click("Ребёнок"); const search=typeSearch("Анна");
    act(()=>search.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    click("Добавить связь");
    expect(parent).toHaveBeenCalledWith(expect.objectContaining({parentId:"boris",childId:"anna"}));
  });
  it("searches first names, surnames and aliases behind a custom display name",()=>{
    mount(); click("Родитель");
    for (const query of ["мария", "СОКОЛОВА", "Маша"]) {
      typeSearch(query); expect(choices()).toHaveLength(1); expect(choices()[0].textContent).toContain("Тестовый псевдоним");
    }
  });
  it("keeps the selected character after an empty search and resets the filter on reopening",()=>{
    mount(); click("Родитель"); typeSearch("Никого такого нет");
    expect(choices()).toHaveLength(0); expect(container.querySelector('[role="status"]')?.textContent).toBe("Ничего не найдено");
    const search=container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(()=>search.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(close).not.toHaveBeenCalled(); expect(names()[0]).toBe("Анна Воробьёва");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Родитель");
    click("Родитель"); expect(choices()).toHaveLength(3); expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("");
  });
  it("supports searching people in personal relationship lists too",()=>{
    mount(undefined,"pair"); click("Персонаж A"); typeSearch("Маша"); act(()=>choices()[0].click());
    click("Добавить связь");
    expect(pair).toHaveBeenCalledWith(expect.objectContaining({aId:"maria",bId:"boris"}));
  });
  it("swaps IDs and displayed characters without saving until confirmation",()=>{
    mount(); click("Поменять родителя и ребёнка местами");
    expect(names()).toEqual(["Борис Воробьёв","Анна Воробьёва"]); expect(parent).not.toHaveBeenCalled();
    click("Добавить связь");
    expect(parent).toHaveBeenCalledWith(expect.objectContaining({parentId:"boris",childId:"anna",parentRole:"Родитель",childRole:"Ребёнок"}));
  });
  it("can swap back and recalculates cycle warnings for the new direction",()=>{
    const project=makeProject();
    project.parentLinks.push({id:"existing",parentId:"anna",childId:"boris",kind:"Биологическое",parentRole:"Родитель",childRole:"Ребёнок",biological:"yes",active:true,comment:""});
    mount(project); click("Поменять родителя и ребёнка местами");
    expect(container.querySelector(".warning-box")).not.toBeNull();
    click("Добавить связь"); expect(parent).not.toHaveBeenCalled();
    click("Поменять родителя и ребёнка местами");
    expect(names()).toEqual(["Анна Воробьёва","Борис Воробьёв"]); expect(container.querySelector(".warning-box")).toBeNull();
  });
});
