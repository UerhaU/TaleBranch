// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LanguageProvider } from "./i18n";
import { createDemoProject, createEmptyProject } from "./lib/project";
import { moveCharacterToTrash } from "./lib/relationships";
import { listProjects, loadInitialProject, loadProject, saveProject } from "./lib/storage";
import type { Project } from "./types";
import type { Edge } from "@xyflow/react";
import { webcrypto } from "node:crypto";
import { DynastyFolder, DYNASTY_FILE, FOLDER_ACTIVE_KEY } from "./lib/folderStorage";
import { MemoryDirectory } from "./lib/folderStorage.testSupport";

const graph = vi.hoisted(() => ({ edges: [] as Edge[] }));

// Canvas rendering is independent of the real persistence and deletion flow under test.
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  ReactFlow: ({ children, edges }: { children: ReactNode; edges: Edge[] }) => {
    graph.edges = edges;
    return <div>{children}</div>;
  },
  Background: () => null,
  MiniMap: () => null,
  Controls: () => null,
}));

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("dynasty-chronicles:language", "ru");
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(trashedIds: string[] = [], configure?: (project: Project) => void) {
  const project = createDemoProject();
  configure?.(project);
  for (const id of trashedIds) moveCharacterToTrash(project, id);
  saveProject(project);
  act(() =>
    root.render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    ),
  );
  return project;
}
function click(text: string, scope: ParentNode = container) {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) =>
      item.textContent?.trim() === text ||
      item.getAttribute("title") === text ||
      item.getAttribute("aria-label") === text,
  );
  if (!found) throw Error(`Missing button: ${text}`);
  act(() => found.click());
}
const dialog = () => Array.from(container.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1)!;

describe("dynasty and trash deletion in the interface", () => {
  it("starts on the welcome screen without automatically opening a creation dialog", () => {
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    expect(container.querySelector(".dynasty-welcome")).not.toBeNull();
    expect(dialog()).toBeUndefined();
    act(() => vi.advanceTimersByTime(1000));
    expect(dialog()).toBeUndefined();
    expect(listProjects()).toEqual([]);
    click("Новая династия");
    expect(dialog().getAttribute("aria-label")).toBe("Новая династия");
  });
  it("warns about deleting the whole folder and returns to the welcome screen after confirmation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    await DynastyFolder.create(directory, createDemoProject());
    directory.files.set("notes.txt", "Inside dynasty");
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    await act(async () => {
      click("Открыть папку династии");
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    click("Настройки");
    click("Настройки династии");
    click("Удалить династию", dialog());
    expect(dialog().textContent).toContain("папка династии");
    expect(dialog().textContent).toContain("любые другие файлы внутри");
    await act(async () => {
      click("Удалить безвозвратно", dialog());
      await vi.waitFor(() => expect(directory.deleted).toBe(true));
    });
    expect(container.querySelector(".dynasty-welcome")).not.toBeNull();
    expect(dialog()).toBeUndefined();
    expect(directory.files.size).toBe(0);
  });
  it("renders translucent personal connections with all relationship labels and direction", () => {
    mount([], (project) => {
      const labels = project.pairLinks[1].labels;
      labels[0].name = "Любовники";
      labels[0].direction = "a-to-b";
      labels[0].publicity = "secret";
    });
    const edge = graph.edges.find((item) => item.id === "relationship:pair_2")!;
    expect(edge.type).toBe("relationship");
    expect(edge.data?.text).toContain("Любовники");
    expect(edge.data?.text).toContain("Лучшие друзья");
    expect(edge.data?.text).toContain("тайно");
    expect(edge.data?.toTarget).toBe(true);
    expect(edge.data?.toSource).toBe(false);
    expect(graph.edges.filter((item) => item.className === "family-edge")).toHaveLength(4);
  });

  it("toggles personal connections separately and excludes connections to characters in trash", () => {
    mount(["char_elena"]);
    expect(graph.edges.filter((item) => item.type === "relationship")).toHaveLength(1);
    click("Вид");
    const label = Array.from(container.querySelectorAll(".tb-view-menu label")).find(
      (item) => item.textContent === "Отношения",
    )!;
    act(() => label.querySelector<HTMLInputElement>("input")!.click());
    expect(graph.edges.filter((item) => item.type === "relationship")).toHaveLength(0);
    expect(graph.edges.filter((item) => item.className === "family-edge")).toHaveLength(3);
  });

  it("explains quota failures and allows retrying while keeping current data", () => {
    const project = mount();
    const original = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "s" })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Хранилище браузера заполнено");
    expect(container.querySelector(".storage-error-details")?.textContent).toContain("QuotaExceededError");
    failure.mockRestore();
    click("Повторить сохранение");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(loadProject(project.id)?.characters).toHaveLength(6);
  });
  it("requires confirmation to purge one profile and keeps restoration available after cancellation", () => {
    const project = mount(["char_vera"]);
    expect(container.querySelector(".project-switcher > button")?.getAttribute("aria-label")).toBe(
      `Династия: ${project.name}`,
    );
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    expect(dialog().textContent).toContain("Это действие нельзя отменить");
    expect(loadProject(project.id)?.trashedCharacters).toHaveLength(1);
    click("Отмена", dialog());
    expect(dialog().querySelector(".trash-list")?.textContent).toContain("Вера Воронова");
    click("Восстановить", dialog());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(loadProject(project.id)?.characters.some((item) => item.id === "char_vera")).toBe(true);
  });

  it("permanently removes a selected trash profile only after confirmation", () => {
    const project = mount(["char_vera", "char_elena"]);
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    click("Удалить безвозвратно", dialog());
    expect(loadProject(project.id)?.trashedCharacters.map((item) => item.id)).toEqual(["char_elena"]);
    expect(dialog().getAttribute("aria-label")).toBe("Корзина династии");
    expect(dialog().querySelector(".trash-list")?.textContent).not.toContain("Вера Воронова");
    expect(container.querySelector<HTMLButtonElement>('button[title="Отменить (Ctrl+Z)"]')?.disabled).toBe(true);
  });

  it("confirms emptying the trash without removing active profiles", () => {
    const project = mount(["char_vera", "char_elena"]);
    click("Корзина");
    click("Очистить корзину");
    expect(dialog().textContent).toContain("(2)");
    click("Удалить безвозвратно", dialog());
    expect(loadProject(project.id)?.trashedCharacters).toEqual([]);
    expect(loadProject(project.id)?.characters).toHaveLength(4);
    expect(dialog().querySelector(".empty-modal")).not.toBeNull();
  });

  it("keeps a failed purge open with an error and allows retrying", () => {
    const project = mount(["char_vera"]);
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    const setItem = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "dynasty-chronicles:index") throw Error("Write failed");
      setItem.call(this, key, value);
    });
    click("Удалить безвозвратно", dialog());
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Не удалось завершить удаление");
    expect(loadProject(project.id)?.trashedCharacters).toHaveLength(1);
    failure.mockRestore();
    click("Удалить безвозвратно", dialog());
    expect(loadProject(project.id)?.trashedCharacters).toEqual([]);
  });

  it("shows the welcome screen after deletion and restart until creation is explicitly requested", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    const picker = vi.fn(async () => directory);
    vi.stubGlobal("showDirectoryPicker", picker);
    const project = mount();
    click("Настройки");
    click("Настройки династии");
    click("Удалить династию", dialog());
    expect(dialog().textContent).toContain(project.name);
    click("Отмена", dialog());
    expect(loadProject(project.id)).not.toBeNull();
    expect(dialog().getAttribute("aria-label")).toBe("Настройки династии");
    click("Удалить династию", dialog());
    click("Удалить безвозвратно", dialog());
    expect(loadProject(project.id)).toBeNull();
    expect(loadInitialProject()).toBeNull();
    expect(listProjects()).toEqual([]);
    expect(dialog()).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(container.querySelector(".dynasty-welcome")?.textContent).toContain("Создайте свою династию");
    expect(listProjects()).toEqual([]);
    act(() => root.unmount());
    root = createRoot(container);
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    expect(dialog()).toBeUndefined();
    click("Новая династия");
    expect(dialog().getAttribute("aria-label")).toBe("Новая династия");
    expect(loadInitialProject()).toBeNull();
    const name = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "  Дом Соколовых  ");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(listProjects()).toEqual([]);
    expect(
      Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === "Создать",
      )?.disabled,
    ).toBe(true);
    await act(async () => click("Выбрать место сохранения", dialog()));
    await act(async () => {
      click("Создать", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".folder-error")?.textContent).toBeUndefined();
    expect(listProjects()).toEqual([]);
    expect((await DynastyFolder.open(await directory.getDirectoryHandle("Дом Соколовых"))).project.name).toBe(
      "Дом Соколовых",
    );
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe("Дом Соколовых");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("can import a saved dynasty from the welcome screen without creating a blank one", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    const imported = createDemoProject();
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [
          { text: async () => JSON.stringify({ app: "dynasty-chronicles", formatVersion: 1, project: imported }) },
        ],
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(listProjects()).toHaveLength(0);
    expect(directory.files.size).toBe(0);
    await act(async () => click("Выбрать место сохранения", dialog()));
    await act(async () => {
      click("Импортировать", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(container.querySelector(".folder-error")?.textContent).toBeUndefined();
    expect(listProjects()).toHaveLength(0);
    const saved = (await DynastyFolder.open(await directory.getDirectoryHandle(imported.name))).project;
    expect(saved).toEqual(imported);
    expect(container.querySelector(".dynasty-welcome")).toBeNull();
  });

  it("opens an existing folder in place and saves edits back to the same file", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    const project = createDemoProject();
    await DynastyFolder.create(directory, project);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    await act(async () => {
      click("Открыть папку династии");
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(container.querySelector(".folder-error")?.textContent).toBeUndefined();
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe(project.name);
    expect(listProjects()).toEqual([]);
    click("Настройки");
    click("Настройки династии");
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Новое название");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click("Сохранить", dialog());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
      await vi.waitFor(() =>
        expect(JSON.parse(directory.files.get(DYNASTY_FILE)!).project.name).toBe("Новое название"),
      );
    });
    expect((await DynastyFolder.open(directory)).project.name).toBe("Новое название");
    expect([...directory.files.keys()]).toEqual([DYNASTY_FILE]);
    expect(listProjects()).toEqual([]);
  });

  it("cancels folder selection without creating a dynasty or falling back to browser storage", async () => {
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => {
        throw new DOMException("Cancelled", "AbortError");
      }),
    );
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    click("Новая династия");
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Не создавать");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => click("Выбрать место сохранения", dialog()));
    expect(listProjects()).toEqual([]);
    expect(dialog()).toBeDefined();
    expect(container.querySelector(".folder-error")).toBeNull();
  });
  it("selects a folder first, then accepts a typed name and creates without opening the picker again", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const queryPermission = vi.spyOn(MemoryDirectory.prototype, "queryPermission");
    const requestPermission = vi.spyOn(MemoryDirectory.prototype, "requestPermission");
    const directory = new MemoryDirectory();
    Object.freeze(directory);
    let selected!: (directory: MemoryDirectory) => void;
    const picker = vi.fn(
      () =>
        new Promise<MemoryDirectory>((resolve) => {
          selected = resolve;
        }),
    );
    vi.stubGlobal("showDirectoryPicker", picker);
    act(() =>
      root.render(
        <StrictMode>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </StrictMode>,
      ),
    );
    expect(dialog()).toBeUndefined();
    click("Новая династия");
    click("Выбрать место сохранения", dialog());
    const create = () =>
      Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === "Создать",
      )!;
    expect(create().disabled).toBe(true);
    await act(async () => {
      selected(directory);
    });
    expect(dialog().textContent).toContain(directory.name);
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    let typed = "";
    for (const character of "Дом Вороновых") {
      typed += character;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, typed);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(dialog().textContent).toContain(directory.name);
    }
    expect(create().disabled).toBe(false);
    await act(async () => {
      click("Создать", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(queryPermission).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect((await DynastyFolder.open(await directory.getDirectoryHandle("Дом Вороновых"))).project.name).toBe(
      "Дом Вороновых",
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(listProjects()).toEqual([]);
  });
  it("creates inside a nonempty save location even if its root handle has no display name", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    directory.name = "";
    directory.files.set("Мои документы.txt", "Не трогать");
    const picker = vi.fn(async () => directory);
    vi.stubGlobal("showDirectoryPicker", picker);
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    click("Новая династия");
    await act(async () => click("Выбрать место сохранения", dialog()));
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Дом Вороновых");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const create = Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Создать",
    )!;
    expect(create.disabled).toBe(false);
    await act(async () => {
      create.click();
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    const child = await directory.getDirectoryHandle("Дом Вороновых");
    expect((await DynastyFolder.open(child)).project.name).toBe("Дом Вороновых");
    expect(directory.files.get("Мои документы.txt")).toBe("Не трогать");
    expect(directory.files.has(DYNASTY_FILE)).toBe(false);
    expect(picker).toHaveBeenCalledTimes(1);
  });
  it("does not launch a directory picker from Create or Enter while no folder is selected", () => {
    const picker = vi.fn();
    vi.stubGlobal("showDirectoryPicker", picker);
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    click("Новая династия");
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Дом Вороновых");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click("Создать", dialog());
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(picker).not.toHaveBeenCalled();
    expect(listProjects()).toEqual([]);
    expect(container.querySelector(".folder-error")?.textContent).toContain("Выбрать место сохранения");
  });
  it("keeps a selected folder after cancelling a replacement selection", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    const picker = vi
      .fn()
      .mockResolvedValueOnce(directory)
      .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("showDirectoryPicker", picker);
    act(() =>
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      ),
    );
    click("Новая династия");
    await act(async () => click("Выбрать место сохранения", dialog()));
    await act(async () => click(directory.name, dialog()));
    expect(dialog().textContent).toContain(directory.name);
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Сохранить выбор");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      click("Создать", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(picker).toHaveBeenCalledTimes(2);
    expect((await DynastyFolder.open(await directory.getDirectoryHandle("Сохранить выбор"))).project.name).toBe(
      "Сохранить выбор",
    );
  });
  it("saves a browser dynasty into a newly selected folder and keeps the old browser record intact", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const cancelledDirectory = new MemoryDirectory();
    const destination = new MemoryDirectory();
    const picker = vi.fn().mockResolvedValueOnce(cancelledDirectory).mockResolvedValueOnce(destination);
    vi.stubGlobal("showDirectoryPicker", picker);
    const project = mount();
    const old = loadProject(project.id);
    act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    click("Новая династия");
    await act(async () => click("Выбрать место сохранения", dialog()));
    click("Отмена", dialog());
    // A previously chosen, cancelled folder must never become the transfer target.
    if (!container.querySelector(".project-menu"))
      act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    await act(async () => {
      click("Сохранить в выбранную папку");
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(picker).toHaveBeenCalledTimes(2);
    expect(cancelledDirectory.files.size).toBe(0);
    expect((await DynastyFolder.open(await destination.getDirectoryHandle(project.name))).project).toEqual(project);
    expect(loadProject(project.id)).toEqual(old);
    expect(container.querySelector(".save-state")?.getAttribute("title")).toContain(project.name);
  });

  it("offers dynasty deletion from the switcher and opens another saved dynasty", () => {
    const other = createEmptyProject("Дом Соловьёвых");
    saveProject(other);
    const project = mount();
    act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    click("Удалить династию");
    click("Удалить безвозвратно", dialog());
    expect(loadProject(project.id)).toBeNull();
    expect(listProjects().map((item) => item.id)).toEqual([other.id]);
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe(other.name);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
