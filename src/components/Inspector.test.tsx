// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "./Inspector";
import { LanguageProvider } from "../i18n";
import { createDemoProject } from "../lib/project";

let root: Root;
let container: HTMLDivElement;
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
const click = (text: string) => {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
};

describe("photo stage selection", () => {
  it("keeps the interface mounted when UI preference storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    act(() =>
      root.render(
        <LanguageProvider>
          <button>Project remains accessible</button>
        </LanguageProvider>,
      ),
    );
    expect(container.textContent).toBe("Project remains accessible");
  });
  it("browses childhood photos without changing the current age and pastes into the browsed stage", () => {
    const project = createDemoProject();
    const character = project.characters.find((item) => item.id === "char_vera")!;
    const onLifeStage = vi.fn();
    const onPhoto = vi.fn();
    act(() =>
      root.render(
        <LanguageProvider>
          <Inspector
            character={character}
            project={project}
            onClose={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onAddLink={vi.fn()}
            onPhoto={onPhoto}
            onLifeStage={onLifeStage}
            onEditPhoto={vi.fn()}
            onRemovePhoto={vi.fn()}
            onEditLink={vi.fn()}
            onRemoveLink={vi.fn()}
            onPasteError={vi.fn()}
          />
        </LanguageProvider>,
      ),
    );
    click("Этапы жизни");
    click("РебёнокБез фотографии");
    expect(onLifeStage).not.toHaveBeenCalled();
    const image = new File(["fixture"], "test.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { items: [{ type: "image/png", getAsFile: () => image }] },
    });
    act(() => window.dispatchEvent(event));
    expect(onPhoto).toHaveBeenCalledWith(image, "Ребёнок");
    click("Сделать текущим этапом");
    expect(onLifeStage).toHaveBeenCalledWith("Ребёнок");
  });
});

describe("keyboard in the right panel", () => {
  it("closes only the «More actions» menu on Escape and keeps the panel open", () => {
    const project = createDemoProject();
    const character = project.characters.find((item) => item.id === "char_vera")!;
    const onClose = vi.fn();
    const noop = () => undefined;
    act(() =>
      root.render(
        <LanguageProvider>
          <Inspector
            character={character}
            project={project}
            onClose={onClose}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onAddLink={vi.fn()}
            onPhoto={vi.fn()}
            onLifeStage={vi.fn()}
            onEditPhoto={vi.fn()}
            onRemovePhoto={vi.fn()}
            onEditLink={vi.fn()}
            onRemoveLink={vi.fn()}
            onPasteError={vi.fn()}
            actions={{
              edit: noop,
              addChild: noop,
              addParent: noop,
              addRelation: noop,
              photo: noop,
              showRelatives: noop,
              trash: noop,
            }}
          />
        </LanguageProvider>,
      ),
    );
    const more = container.querySelector<HTMLButtonElement>('[aria-label="Ещё действия"]')!;
    act(() => more.click());
    act(() => container.querySelector<HTMLButtonElement>('[role="menu"] button')!.focus());
    const escape = () =>
      act(() => {
        document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
    escape();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(onClose).not.toHaveBeenCalled();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
