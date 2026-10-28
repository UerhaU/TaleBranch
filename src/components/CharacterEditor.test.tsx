// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CharacterEditor } from "./CharacterEditor";
import { LanguageProvider } from "../i18n";
import { createCharacter } from "../lib/project";
import type { Character, PhotoTransform } from "../types";

// Mock canvas rendering while exercising file reading and the profile draft lifecycle.
vi.mock("./PhotoEditor", () => ({
  PhotoEditor: ({
    source,
    onClose,
    onSave,
  }: {
    source: string;
    onClose: () => void;
    onSave: (edited: string, transform: PhotoTransform) => void;
  }) => (
    <div data-testid="photo-crop" data-source={source}>
      <button
        onClick={() =>
          onSave("data:image/webp;base64,Y3JvcA==", { zoom: 1.5, x: 0.1, y: 0, rotation: 90, flipped: false })
        }
      >
        Применить тестовый кадр
      </button>
      <button onClick={onClose}>Отменить тестовый кадр</button>
    </div>
  ),
}));

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("dynasty-chronicles:language", "ru");
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function button(text: string, scope: ParentNode = container) {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text || button.getAttribute("aria-label") === text,
  );
  if (!found) throw Error(`Missing button: ${text}`);
  act(() => found.click());
}
function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function input(label: string) {
  const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw Error(`Missing input: ${label}`);
  return found;
}
function fieldSelect(label: string) {
  const field = Array.from(container.querySelectorAll("label")).find(
    (item) => item.querySelector("span")?.textContent === label,
  );
  const select = field?.querySelector("select");
  if (!select) throw Error(`Missing select: ${label}`);
  return select;
}
async function upload(file: File) {
  const read = FileReader.prototype.readAsDataURL;
  let completed: Promise<void> | undefined;
  const reader = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader, blob) {
    completed = new Promise((resolve) => this.addEventListener("loadend", () => resolve(), { once: true }));
    read.call(this, blob);
  });
  await act(async () => {
    const element = input("Загрузить фото");
    Object.defineProperty(element, "files", { configurable: true, value: [file] });
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await completed;
  });
  reader.mockRestore();
}
function mount(character = createCharacter("Проверка"), ownerCandidates: Character[] = []) {
  const save = vi.fn<(character: Character) => void>(),
    close = vi.fn();
  act(() =>
    root.render(
      <LanguageProvider>
        <CharacterEditor character={character} ownerCandidates={ownerCandidates} onClose={close} onSave={save} />
      </LanguageProvider>,
    ),
  );
  return { save, close };
}
function choose(label: string, search: string, result: string) {
  button(`Выбрать ${label}`);
  change(input(`Поиск в справочнике ${label}`), search);
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>(".catalog-option")).find(
    (item) => item.querySelector("strong")?.textContent === result,
  );
  if (!found) throw Error(`Missing choice: ${result}`);
  act(() => found.click());
}

describe("catalog-backed character editing", () => {
  it("offers the human gender choices and preserves older hidden data when saving", () => {
    const character = createCharacter("Проверка", "sim", {
      gender: "Женский",
      household: "Старый дом",
      world: "Винденбург",
      lot: "Участок",
      birthDate: "День 1",
      deathDate: "День 90",
    });
    const { save } = mount(character);
    const select = fieldSelect("Гендер / пол");
    expect(select.value).toBe("female");
    expect(
      Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => option.text),
    ).toEqual(["Женский", "Мужской", "Другое"]);
    change(select, "other");
    button("Сохранить");
    expect(save.mock.calls[0][0]).toMatchObject({
      gender: "other",
      household: character.household,
      world: character.world,
      lot: character.lot,
      birthDate: character.birthDate,
      deathDate: character.deathDate,
    });
  });

  it("offers only female and male for pets and clears an incompatible choice when converting", () => {
    const owner = createCharacter("Хозяин");
    const { save } = mount(createCharacter("Проверка", "sim", { gender: "other" }), [owner]);
    button("Питомец");
    const select = fieldSelect("Пол");
    expect(select.value).toBe("");
    expect(
      Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => option.text),
    ).toEqual(["Женский", "Мужской"]);
    change(select, "male");
    act(() => container.querySelector<HTMLInputElement>(".owner-options input")!.click());
    button("Сохранить");
    expect(save.mock.calls[0][0].gender).toBe("male");
  });

  it("uploads and crops a photo while creating a pet and includes it in the new profile", async () => {
    const owner = createCharacter("Хозяин"),
      save = vi.fn<(character: Character) => void>();
    act(() =>
      root.render(
        <LanguageProvider>
          <CharacterEditor ownerCandidates={[owner]} onClose={vi.fn()} onSave={save} />
        </LanguageProvider>,
      ),
    );
    change(container.querySelector<HTMLInputElement>("input")!, "Барсик");
    button("Питомец");
    act(() => container.querySelector<HTMLInputElement>(".owner-options input")!.click());
    await upload(new File(["original-photo"], "avatar.png", { type: "image/png" }));
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="photo-crop"]')?.getAttribute("data-source")).toBe(
      "data:image/png;base64,b3JpZ2luYWwtcGhvdG8=",
    );
    button("Применить тестовый кадр", document.body);
    expect(container.querySelector(".character-photo-preview img")?.getAttribute("src")).toBe(
      "data:image/webp;base64,Y3JvcA==",
    );
    button("Добавить на древо");
    const saved = save.mock.calls[0][0];
    expect(saved.stages.find((stage) => stage.name === saved.lifeStage)?.photo).toMatchObject({
      original: "data:image/png;base64,b3JpZ2luYWwtcGhvdG8=",
      edited: "data:image/webp;base64,Y3JvcA==",
      transform: { zoom: 1.5, rotation: 90 },
    });
    expect(saved.ownerIds).toEqual([owner.id]);
  });

  it("keeps the previous photo if replacement cropping is cancelled", async () => {
    const character = createCharacter("Проверка");
    character.stages.find((stage) => stage.name === character.lifeStage)!.photo = {
      original: "data:image/png;base64,b2xk",
      edited: "data:image/webp;base64,b2xk",
      updatedAt: character.updatedAt,
    };
    const { save } = mount(character);
    await upload(new File(["replacement"], "new.png", { type: "image/png" }));
    button("Отменить тестовый кадр", document.body);
    button("Сохранить");
    expect(save.mock.calls[0][0].stages).toEqual(character.stages);
  });

  it("retains a draft photo on its original stage after changing the current age", async () => {
    const character = createCharacter("Проверка");
    const { save } = mount(character);
    await upload(new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
    button("Применить тестовый кадр", document.body);
    button("Пожилой");
    button("Сохранить");
    const saved = save.mock.calls[0][0];
    expect(saved.stages.find((stage) => stage.name === character.lifeStage)?.photo).toBeDefined();
    expect(saved.stages.find((stage) => stage.name === "Пожилой")?.photo).toBeUndefined();
    expect(character.stages.every((stage) => !stage.photo)).toBe(true);
  });

  it("rejects unsupported and oversized photo files without changing the draft", async () => {
    const { save } = mount();
    await upload(new File(["svg"], "photo.svg", { type: "image/svg+xml" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Поддерживаются JPEG, PNG и WebP");
    const oversized = new File(["photo"], "big.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 26 * 1024 * 1024 });
    await upload(oversized);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="photo-crop"]')).toBeNull();
    button("Сохранить");
    expect(save.mock.calls[0][0].stages.every((stage) => !stage.photo)).toBe(true);
  });

  it("cannot create a named pet before explicitly choosing an owner, even in the same household", () => {
    const owner = createCharacter("Хозяин", "sim", { household: "Общий дом" });
    const save = vi.fn();
    act(() =>
      root.render(
        <LanguageProvider>
          <CharacterEditor ownerCandidates={[owner]} onClose={vi.fn()} onSave={save} />
        </LanguageProvider>,
      ),
    );
    change(container.querySelector<HTMLInputElement>("input")!, "Барсик");
    button("Питомец");
    const submit = container.querySelector<HTMLButtonElement>(".tb-panel-foot .primary")!;
    expect(submit.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("выберите хотя бы одного хозяина");
    act(() => submit.click());
    expect(save).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLInputElement>('.owner-options input[type="checkbox"]')!.click());
    expect(submit.disabled).toBe(false);
    button("Добавить на древо");
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ type: "pet", displayName: "Барсик", ownerIds: [owner.id] });
  });

  it("requires a person first when no eligible owners exist", () => {
    const pet = createCharacter("Барсик", "pet");
    const { save } = mount(pet, [pet, createCharacter("Другой питомец", "pet")]);
    expect(container.querySelectorAll(".owner-options input")).toHaveLength(0);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Сначала добавьте в династию персонажа");
    button("Характеристики");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Без хозяина создать питомца нельзя");
    button("Сохранить");
    expect(save).not.toHaveBeenCalled();
  });

  it("allows multiple owners but prevents saving after removing the last one", () => {
    const owners = [createCharacter("Первый хозяин"), createCharacter("Второй хозяин", "custom")];
    const pet = createCharacter("Барсик", "pet", { ownerIds: [owners[0].id] });
    const { save } = mount(pet, owners);
    const checkboxes = container.querySelectorAll<HTMLInputElement>(".owner-options input");
    act(() => checkboxes[1].click());
    button("Сохранить");
    expect(save.mock.calls[0][0].ownerIds).toEqual(owners.map((item) => item.id));
    act(() => checkboxes[0].click());
    expect(container.querySelector<HTMLButtonElement>(".tb-panel-foot .primary")!.disabled).toBe(false);
    act(() => checkboxes[1].click());
    expect(container.querySelector<HTMLButtonElement>(".tb-panel-foot .primary")!.disabled).toBe(true);
  });

  it("does not count unavailable owner IDs and requires ownership when converting a Sim into a pet", () => {
    const owner = createCharacter("Хозяин");
    const { save } = mount(createCharacter("Проверка", "sim", { ownerIds: ["deleted-owner"] }), [owner]);
    button("Питомец");
    expect(container.querySelector<HTMLButtonElement>(".tb-panel-foot .primary")!.disabled).toBe(true);
    button("Сохранить");
    expect(save).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLInputElement>(".owner-options input")!.click());
    button("Сохранить");
    expect(save.mock.calls[0][0].ownerIds).toEqual([owner.id]);
  });

  it("selects a trait with its icon while preserving old custom text", () => {
    const { save } = mount(createCharacter("Проверка", "sim", { traits: ["Своя черта"] }));
    button("Характеристики");
    choose("Черты характера", "Гений", "Гений");
    expect(container.querySelector(".catalog-chip img")?.getAttribute("src")).toContain("/game-icons/");
    button("Сохранить");
    expect(save.mock.calls[0][0].catalog?.traitIds).toContain("trait_Genius");
    expect(save.mock.calls[0][0].traits).toEqual(["Своя черта"]);
  });
  it("keeps the 15-level skill limit and custom legacy skills", () => {
    const { save } = mount(createCharacter("Проверка", "sim", { skills: ["Свое умение"] }));
    button("Навыки и предпочтения");
    choose("Навыки", "Вампиризм", "Вампиризм");
    change(input("Уровень Вампиризм"), "20");
    button("Сохранить");
    expect(save.mock.calls[0][0].catalog?.skills).toEqual([{ id: "statistic_Skill_Hidden_VampireLore", level: 15 }]);
    expect(save.mock.calls[0][0].skills).toEqual(["Свое умение"]);
  });
  it("saves the selected career, level and notes without losing the selection", () => {
    const { save } = mount();
    button("Карьера");
    button("Добавить карьеру");
    choose("Карьера", "Доктор", "Доктор");
    const levelLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.querySelector("span")?.textContent === "Уровень",
    )!;
    const notesLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.querySelector("span")?.textContent === "Заметки",
    )!;
    change(levelLabel.querySelector("input")!, "7");
    change(notesLabel.querySelector("textarea")!, "Работает в клинике");
    button("Сохранить");
    expect(save.mock.calls[0][0].catalog?.careers[0]).toMatchObject({
      careerId: "career_Adult_Active_Doctor",
      level: 7,
      notes: "Работает в клинике",
    });
  });
  it("closes the picker with Escape before closing the profile dialog", () => {
    const { close } = mount();
    button("Характеристики");
    button("Выбрать Черты характера");
    act(() =>
      input("Поиск в справочнике Черты характера").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(close).not.toHaveBeenCalled();
    expect(container.querySelector(".catalog-panel")).toBeNull();
    act(() =>
      container.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
