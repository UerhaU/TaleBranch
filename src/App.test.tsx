// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LanguageProvider } from "./i18n";
import { createDemoProject, createEmptyProject } from "./lib/project";
import { moveCharacterToTrash } from "./lib/relationships";
import type { Project } from "./types";
import type { Edge } from "@xyflow/react";
import { webcrypto } from "node:crypto";
import { DynastyFolder, DYNASTY_FILE } from "./lib/folderStorage";
import { DynastyStoreContext } from "./hooks/useDynastyStore";
import { browserTestStore, memoryBookmarks, storeLegacyProject } from "./lib/dynastyStore.testSupport";
import { listLegacyProjects, loadLegacyProject } from "./lib/legacyStorage";
import type { DynastyStore } from "./lib/dynastyStore";
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

// Written by the browser variant when a dynasty folder becomes the last open one.
const FOLDER_ACTIVE_KEY = "dynasty-chronicles:last-folder-bookmark";
let root: Root, container: HTMLDivElement;
let bookmarks: ReturnType<typeof memoryBookmarks>;
let store: DynastyStore;
/** The save location of the dynasty opened by mount(). */
let home: MemoryDirectory;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", webcrypto);
  bookmarks = memoryBookmarks();
  store = browserTestStore(bookmarks);
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

/** Waits until the check passes, applying React updates between attempts. */
const settle = (check: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {});
    check();
  });
/** Starts the application, which restores the last open dynasty folder if there is one. */
async function show(strict = false) {
  const app = (
    <DynastyStoreContext.Provider value={store}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </DynastyStoreContext.Provider>
  );
  act(() => root.render(strict ? <StrictMode>{app}</StrictMode> : app));
  await act(async () => {});
}
async function restart() {
  act(() => root.unmount());
  root = createRoot(container);
  store = browserTestStore(bookmarks);
  await show();
}
/** Opens a demo dynasty that was left open in its folder on the previous run. */
async function mount(trashedIds: string[] = [], configure?: (project: Project) => void) {
  const project = createDemoProject();
  configure?.(project);
  for (const id of trashedIds) moveCharacterToTrash(project, id);
  home = new MemoryDirectory();
  home.name = "Династии";
  await store.remember(await store.create(home, project));
  await show();
  await settle(() => expect(container.querySelector(".project-switcher")).not.toBeNull());
  return project;
}
const folder = () => home.directories.get(createDemoProject().name)!;
const saved = (): Project => JSON.parse(folder().files.get(DYNASTY_FILE)!).project;
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
function clickItem(name: string) {
  // Old browser records come after the recent folders, which may have the same name.
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .filter((item) => item.querySelector("strong, .tb-recent-name")?.textContent === name)
    .at(-1);
  if (!found) throw Error(`Missing item: ${name}`);
  act(() => found.click());
}
const dialog = () => Array.from(container.querySelectorAll<HTMLElement>('[role="dialog"]')).at(-1)!;

describe("dynasty and trash deletion in the interface", () => {
  it("starts on the welcome screen without automatically opening a creation dialog", async () => {
    await show();
    expect(container.querySelector(".dynasty-welcome")).not.toBeNull();
    expect(dialog()).toBeUndefined();
    act(() => vi.advanceTimersByTime(1000));
    expect(dialog()).toBeUndefined();
    expect(listLegacyProjects()).toEqual([]);
    click("Новая династия");
    expect(dialog().getAttribute("aria-label")).toBe("Новая династия");
  });
  it("warns about deleting the whole folder and returns to the welcome screen after confirmation", async () => {
    const directory = new MemoryDirectory();
    await DynastyFolder.create(directory, createDemoProject());
    directory.files.set("notes.txt", "Inside dynasty");
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    await show();
    await act(async () => {
      click("Открыть папку династии");
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    click("Настройки");
    click("Династия", dialog());
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
  it("renders translucent personal connections with all relationship labels and direction", async () => {
    await mount([], (project) => {
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

  it("toggles personal connections separately and excludes connections to characters in trash", async () => {
    await mount(["char_elena"]);
    expect(graph.edges.filter((item) => item.type === "relationship")).toHaveLength(1);
    click("Вид");
    const label = Array.from(container.querySelectorAll(".tb-view-menu label")).find(
      (item) => item.textContent === "Отношения",
    )!;
    act(() => label.querySelector<HTMLInputElement>("input")!.click());
    expect(graph.edges.filter((item) => item.type === "relationship")).toHaveLength(0);
    expect(graph.edges.filter((item) => item.className === "family-edge")).toHaveLength(3);
  });

  it("explains a folder write failure and allows retrying while keeping current data", async () => {
    await mount();
    folder().failWrite = true;
    click("Настройки");
    click("Династия", dialog());
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Не потерять");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click("Сохранить", dialog());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "s" })));
    await settle(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Не удалось записать изменения"),
    );
    expect(container.querySelector(".storage-error-details")?.textContent).toContain("QuotaExceededError");
    folder().failWrite = false;
    click("Повторить сохранение");
    await settle(() => expect(saved().name).toBe("Не потерять"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("requires confirmation to purge one profile and keeps restoration available after cancellation", async () => {
    const project = await mount(["char_vera"]);
    expect(container.querySelector(".project-switcher > button")?.getAttribute("aria-label")).toBe(
      `Династия: ${project.name}`,
    );
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    expect(dialog().textContent).toContain("Это действие нельзя отменить");
    expect(saved().trashedCharacters).toHaveLength(1);
    click("Отмена", dialog());
    expect(dialog().querySelector(".trash-list")?.textContent).toContain("Вера Воронова");
    click("Восстановить", dialog());
    act(() => window.dispatchEvent(new Event("pagehide")));
    await settle(() => expect(saved().characters.some((item) => item.id === "char_vera")).toBe(true));
  });

  it("permanently removes a selected trash profile only after confirmation", async () => {
    await mount(["char_vera", "char_elena"]);
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    click("Удалить безвозвратно", dialog());
    await settle(() => expect(saved().trashedCharacters.map((item) => item.id)).toEqual(["char_elena"]));
    expect(dialog().getAttribute("aria-label")).toBe("Корзина династии");
    expect(dialog().querySelector(".trash-list")?.textContent).not.toContain("Вера Воронова");
    expect(container.querySelector<HTMLButtonElement>('button[title="Отменить (Ctrl+Z)"]')?.disabled).toBe(true);
  });

  it("confirms emptying the trash without removing active profiles", async () => {
    await mount(["char_vera", "char_elena"]);
    click("Корзина");
    click("Очистить корзину");
    expect(dialog().textContent).toContain("(2)");
    click("Удалить безвозвратно", dialog());
    await settle(() => expect(saved().trashedCharacters).toEqual([]));
    expect(saved().characters).toHaveLength(4);
    expect(dialog().querySelector(".empty-modal")).not.toBeNull();
  });

  it("keeps a failed purge open with an error and allows retrying", async () => {
    await mount(["char_vera"]);
    click("Корзина");
    click("Удалить «Вера Воронова» безвозвратно?");
    folder().failWrite = true;
    click("Удалить безвозвратно", dialog());
    await settle(() =>
      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Не удалось завершить удаление"),
    );
    expect(saved().trashedCharacters).toHaveLength(1);
    folder().failWrite = false;
    click("Удалить безвозвратно", dialog());
    await settle(() => expect(saved().trashedCharacters).toEqual([]));
  });

  it("shows the welcome screen after deletion and restart until creation is explicitly requested", async () => {
    const directory = new MemoryDirectory();
    const picker = vi.fn(async () => directory);
    vi.stubGlobal("showDirectoryPicker", picker);
    const project = await mount();
    click("Настройки");
    click("Династия", dialog());
    click("Удалить династию", dialog());
    expect(dialog().textContent).toContain(project.name);
    click("Отмена", dialog());
    expect(home.directories.has(project.name)).toBe(true);
    expect(dialog().getAttribute("aria-label")).toBe("Настройки");
    click("Удалить династию", dialog());
    click("Удалить безвозвратно", dialog());
    await settle(() => expect(home.directories.has(project.name)).toBe(false));
    await settle(() => expect(dialog()).toBeUndefined());
    act(() => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(container.querySelector(".dynasty-welcome")?.textContent).toContain("Создайте свою династию");
    expect(home.directories.has(project.name)).toBe(false);
    await restart();
    expect(container.querySelector(".dynasty-welcome")).not.toBeNull();
    expect(dialog()).toBeUndefined();
    click("Новая династия");
    expect(dialog().getAttribute("aria-label")).toBe("Новая династия");
    const name = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "  Дом Соколовых  ");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(listLegacyProjects()).toEqual([]);
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
    expect(listLegacyProjects()).toEqual([]);
    expect((await DynastyFolder.open(await directory.getDirectoryHandle("Дом Соколовых"))).project.name).toBe(
      "Дом Соколовых",
    );
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe("Дом Соколовых");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("can import a saved dynasty from the welcome screen without creating a blank one", async () => {
    const directory = new MemoryDirectory();
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    const imported = createDemoProject();
    await show();
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [
          { text: async () => JSON.stringify({ app: "dynasty-chronicles", formatVersion: 1, project: imported }) },
        ],
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(listLegacyProjects()).toHaveLength(0);
    expect(directory.files.size).toBe(0);
    await act(async () => click("Выбрать место сохранения", dialog()));
    await act(async () => {
      click("Импортировать", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(container.querySelector(".folder-error")?.textContent).toBeUndefined();
    expect(listLegacyProjects()).toHaveLength(0);
    const saved = (await DynastyFolder.open(await directory.getDirectoryHandle(imported.name))).project;
    expect(saved).toEqual(imported);
    expect(container.querySelector(".dynasty-welcome")).toBeNull();
  });

  it("opens an existing folder in place and saves edits back to the same file", async () => {
    const directory = new MemoryDirectory();
    const project = createDemoProject();
    await DynastyFolder.create(directory, project);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => directory),
    );
    await show();
    await act(async () => {
      click("Открыть папку династии");
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    expect(container.querySelector(".folder-error")?.textContent).toBeUndefined();
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe(project.name);
    expect(listLegacyProjects()).toEqual([]);
    click("Настройки");
    click("Династия", dialog());
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
    expect(listLegacyProjects()).toEqual([]);
  });

  it("cancels folder selection without creating a dynasty or falling back to browser storage", async () => {
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => {
        throw new DOMException("Cancelled", "AbortError");
      }),
    );
    await show();
    click("Новая династия");
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Не создавать");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => click("Выбрать место сохранения", dialog()));
    expect(listLegacyProjects()).toEqual([]);
    expect(dialog()).toBeDefined();
    expect(container.querySelector(".folder-error")).toBeNull();
  });
  it("selects a folder first, then accepts a typed name and creates without opening the picker again", async () => {
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
    await show(true);
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
    expect(listLegacyProjects()).toEqual([]);
  });
  it("creates inside a nonempty save location even if its root handle has no display name", async () => {
    const directory = new MemoryDirectory();
    directory.name = "";
    directory.files.set("Мои документы.txt", "Не трогать");
    const picker = vi.fn(async () => directory);
    vi.stubGlobal("showDirectoryPicker", picker);
    await show();
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
  it("does not launch a directory picker from Create or Enter while no folder is selected", async () => {
    const picker = vi.fn();
    vi.stubGlobal("showDirectoryPicker", picker);
    await show();
    click("Новая династия");
    const input = dialog().querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Дом Вороновых");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click("Создать", dialog());
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(picker).not.toHaveBeenCalled();
    expect(listLegacyProjects()).toEqual([]);
    expect(container.querySelector(".folder-error")?.textContent).toContain("Выбрать место сохранения");
  });
  it("keeps a selected folder after cancelling a replacement selection", async () => {
    const directory = new MemoryDirectory();
    const picker = vi
      .fn()
      .mockResolvedValueOnce(directory)
      .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("showDirectoryPicker", picker);
    await show();
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
  it("moves an old browser record into a chosen folder and keeps the record until it is deleted", async () => {
    const old = createDemoProject();
    old.name = "Из старой версии";
    storeLegacyProject(old);
    const before = localStorage.getItem(`dynasty-chronicles:project:${old.id}`);
    const destination = new MemoryDirectory();
    const picker = vi.fn(async () => destination);
    vi.stubGlobal("showDirectoryPicker", picker);
    await show();
    // The old record is not opened for editing: it starts the transfer.
    clickItem("Из старой версии");
    expect(dialog().getAttribute("aria-label")).toBe("Сохранить в выбранную папку");
    expect(container.querySelector(".project-switcher")).toBeNull();
    await act(async () => click("Выбрать место сохранения", dialog()));
    await act(async () => {
      click("Перенести в папку", dialog());
      await vi.waitFor(() => expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy());
    });
    await settle(() => expect(container.querySelector(".project-switcher strong")?.textContent).toBe(old.name));
    const moved = (await DynastyFolder.open(await destination.getDirectoryHandle(old.name))).project;
    expect(moved).toEqual(loadLegacyProject(old.id));
    expect(localStorage.getItem(`dynasty-chronicles:project:${old.id}`)).toBe(before);
    // Deleting the record needs a separate confirmation and leaves the folder alone.
    act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    clickItem("Из старой версии");
    click("Удалить из браузера", dialog());
    expect(dialog().textContent).toContain("Папки династий на диске не изменятся");
    click("Отмена", dialog());
    expect(listLegacyProjects()).toHaveLength(1);
    click("Удалить из браузера", dialog());
    click("Удалить безвозвратно", dialog());
    expect(listLegacyProjects()).toEqual([]);
    expect(destination.directories.get(old.name)?.files.has(DYNASTY_FILE)).toBe(true);
    expect(container.querySelector(".project-switcher strong")?.textContent).toBe(old.name);
  });

  it("offers dynasty deletion from the switcher and returns to the welcome screen", async () => {
    const project = await mount();
    act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    click("Удалить династию");
    click("Удалить безвозвратно", dialog());
    await settle(() => expect(container.querySelector(".dynasty-welcome")).not.toBeNull());
    expect(home.directories.has(project.name)).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes a dynasty, keeps its folder and reopens it from the recent list", async () => {
    const project = await mount();
    act(() => container.querySelector<HTMLButtonElement>(".project-switcher > button")!.click());
    click("Закрыть династию");
    await settle(() => expect(container.querySelector(".dynasty-welcome")).not.toBeNull());
    expect(saved()).toEqual(project);
    await restart();
    expect(container.querySelector(".project-switcher")).toBeNull();
    await settle(() => expect(container.querySelector(".tb-recent")).not.toBeNull());
    clickItem(project.name);
    await settle(() => expect(container.querySelector(".project-switcher strong")?.textContent).toBe(project.name));
  });
});

describe("character panel, menus and keys", () => {
  const panel = () => container.querySelector<HTMLElement>(".tb-inspector")!;
  /** Like mount(), but the folder is opened with «Открыть папку династии». */
  const mount = async (_trashed: string[] = [], configure?: (project: Project) => void) => {
    const project = createDemoProject();
    configure?.(project);
    // Opening selects the first character.
    project.characters.sort((a, b) => Number(b.id === "char_vera") - Number(a.id === "char_vera"));
    home = new MemoryDirectory();
    await store.create(home, project);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => home.directories.get(project.name)),
    );
    await show();
    click("Открыть папку династии");
    await settle(() => expect(panel()).not.toBeNull());
    return project;
  };
  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const press = (init: KeyboardEventInit, target: EventTarget = document.body) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });

  it("edits the selected character in the same panel without a separate window", async () => {
    await mount();
    expect(panel().querySelector("h2")?.textContent).toBe("Вера Воронова");
    click("Изменить", panel());
    expect(panel().classList.contains("is-editing")).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    type(panel().querySelector<HTMLInputElement>("input")!, "Новое имя");
    click("Сохранить", panel());
    expect(panel().classList.contains("is-editing")).toBe(false);
    expect(panel().querySelector("h2")?.textContent).toBe("Новое имя");
  });

  it("hides empty sections instead of showing «not filled» labels", async () => {
    await mount([], (project) => {
      const first = project.characters.find((item) => item.id === "char_vera")!;
      Object.assign(first, { biography: "", notes: "", aliases: [], pronouns: "", education: "" });
    });
    expect(panel().textContent).not.toContain("Не заполнено");
    expect(panel().textContent).not.toContain("Заметки");
    expect(panel().textContent).not.toContain("История");
  });

  it("adds a child from the «⋯» menu already linked to the parent", async () => {
    const project = await mount();
    const parent = project.characters.find((item) => item.id === "char_vera")!;
    click("Ещё действия", panel());
    click("Добавить ребёнка");
    expect(panel().classList.contains("is-editing")).toBe(true);
    type(panel().querySelector<HTMLInputElement>("input")!, "Малыш");
    click("Добавить на древо", panel());
    act(() => vi.advanceTimersByTime(2000));
    await settle(() => expect(saved().characters.some((item) => item.displayName === "Малыш")).toBe(true));
    const child = saved().characters.find((item) => item.displayName === "Малыш")!;
    expect(saved().parentLinks.some((link) => link.parentId === parent.id && link.childId === child.id)).toBe(true);
    expect(panel().querySelector("h2")?.textContent).toBe("Малыш");
  });

  it("opens the editor with N, the delete confirmation with Delete and closes the panel with Escape", async () => {
    await mount();
    press({ key: "Delete" });
    expect(dialog().getAttribute("aria-label")).toBe("Удалить «Вера Воронова»?");
    click("Отмена", dialog());
    press({ key: "n", code: "KeyN" });
    expect(panel().querySelector("h2")?.textContent).toBe("Новый персонаж");
    press({ key: "Escape" }, panel().querySelector("input")!);
    expect(panel().classList.contains("is-editing")).toBe(false);
    press({ key: "Escape" });
    expect(container.querySelector(".tb-inspector")).toBeNull();
    press({ key: ",", code: "Comma", ctrlKey: true });
    expect(dialog().getAttribute("aria-label")).toBe("Настройки");
  });
});
