// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createDemoProject, createEmptyProject } from "./project";
import { MemoryDirectory } from "./folderStorage.testSupport";
import { browserTestStore, FakeNative, memoryBookmarks, storeLegacyProject } from "./dynastyStore.testSupport";
import { createFolderStore, type DynastyStore } from "./dynastyStore";
import { desktopBackend } from "./desktopStorage";
import { DYNASTY_FILE } from "./folderStorage";
import { deleteLegacyProject, listLegacyProjects, loadLegacyProject } from "./legacyStorage";
import type { Project } from "../types";

const runtime = vi.hoisted(() => ({ native: undefined as unknown as { invoke: (...args: never[]) => unknown } }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: (command: string, args?: unknown) =>
    (runtime.native.invoke as (c: string, a?: unknown) => unknown)(command, args),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onCloseRequested: vi.fn() }) }));

/** Both variants seen through the same questions: what is on the disk now? */
interface Variant {
  store: DynastyStore;
  /** Starts the program again over the same disk and settings. */
  restart(): DynastyStore;
  /** What the next folder dialog returns: the save location or a dynasty folder inside it. */
  pick(folder?: string): void;
  saved(folder: string): Project | undefined;
  exists(folder: string): boolean;
  /** The user's own file next to the dynasties. */
  sibling(): string | undefined;
}

function browserVariant(): Variant {
  const place = new MemoryDirectory();
  place.name = "Династии";
  place.files.set("Мои документы.txt", "Не трогать");
  const bookmarks = memoryBookmarks();
  const picker = vi.fn(async () => place as MemoryDirectory);
  vi.stubGlobal("showDirectoryPicker", picker);
  return {
    store: browserTestStore(bookmarks),
    restart: () => browserTestStore(bookmarks),
    pick: (folder) => picker.mockResolvedValueOnce(folder ? place.directories.get(folder)! : place),
    saved: (folder) => {
      const text = place.directories.get(folder)?.files.get(DYNASTY_FILE);
      return text ? JSON.parse(text).project : undefined;
    },
    exists: (folder) => place.directories.has(folder),
    sibling: () => place.files.get("Мои документы.txt"),
  };
}
function desktopVariant(): Variant {
  const native = new FakeNative().mkdir("D:\\Династии");
  native.files.set("D:\\Династии\\Мои документы.txt", "Не трогать");
  runtime.native = native as never;
  native.nextPick = "D:\\Династии";
  return {
    store: createFolderStore(desktopBackend),
    restart: () => createFolderStore(desktopBackend),
    pick: (folder) => {
      native.nextPick = folder ? `D:\\Династии\\${folder}` : "D:\\Династии";
    },
    saved: (folder) => {
      const text = native.files.get(`D:\\Династии\\${folder}\\${DYNASTY_FILE}`);
      return text ? JSON.parse(text).project : undefined;
    },
    exists: (folder) => native.directories.has(`D:\\Династии\\${folder}`),
    sibling: () => native.files.get("D:\\Династии\\Мои документы.txt"),
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["browser", browserVariant],
  ["desktop", desktopVariant],
])("one dynasty folder workflow (%s)", (kind, setup) => {
  let disk: Variant;
  beforeEach(() => {
    disk = setup();
  });
  const create = async (project: Project) => {
    disk.pick();
    const place = await disk.store.choosePlace();
    const dynasty = await disk.store.create(place, project);
    await disk.store.remember(dynasty);
    return dynasty;
  };

  it("reports its kind", () => {
    expect(disk.store.kind).toBe(kind);
    expect(disk.store.supported).toBe(true);
  });

  it("creates a folder named after the dynasty inside a location with other files, numbering a busy name", async () => {
    const first = createEmptyProject("Дом Вороновых");
    const second = createEmptyProject("Дом Вороновых");
    await create(first);
    const dynasty = await create(second);
    expect(disk.saved("Дом Вороновых")?.id).toBe(first.id);
    expect(disk.saved("Дом Вороновых (2)")?.id).toBe(second.id);
    expect(dynasty.folderName).toContain("Дом Вороновых (2)");
    expect(disk.sibling()).toBe("Не трогать");
  });

  it("saves edits to the same file and renames the entry in the recent list", async () => {
    const project = createDemoProject();
    const dynasty = await create(project);
    await dynasty.save({ ...project, name: "Новое имя", description: "Только в файле" });
    expect(disk.saved(project.name)).toMatchObject({ name: "Новое имя", description: "Только в файле" });
    const recent = await disk.store.recent();
    expect(recent.map((item) => item.name)).toEqual(["Новое имя"]);
    expect(recent[0].folderName).toBe(project.name);
  });

  it("opens a chosen folder and a recent one in place with the same data", async () => {
    const project = createDemoProject();
    await create(project);
    disk.pick(project.name);
    const opened = await disk.store.open();
    expect(opened.project).toEqual(project);
    const [recent] = await disk.store.recent();
    const again = await disk.store.open(recent);
    expect(again.project).toEqual(project);
    await again.dynasty.save({ ...project, description: "Изменено" });
    expect(disk.saved(project.name)?.description).toBe("Изменено");
  });

  it("restores the last open dynasty after a restart, and nothing after an explicit close", async () => {
    const project = createDemoProject();
    await create(project);
    const restored = await disk.restart().restoreLast();
    expect(restored?.project).toEqual(project);
    await disk.store.forgetLast();
    expect(await disk.restart().restoreLast()).toBeUndefined();
    // Closing keeps the files and the recent entry.
    expect(disk.saved(project.name)).toEqual(project);
    expect(await disk.store.recent()).toHaveLength(1);
  });

  it("refuses to overwrite a file changed by another program", async () => {
    const project = createDemoProject();
    const dynasty = await create(project);
    disk.pick(project.name);
    const other = await disk.store.open();
    await other.dynasty.save({ ...project, description: "Другое окно" });
    await expect(dynasty.save({ ...project, description: "Это окно" })).rejects.toThrow("FOLDER_CONFLICT");
    expect(disk.saved(project.name)?.description).toBe("Другое окно");
  });

  it("deletes the whole dynasty folder, keeps the location and siblings and forgets it", async () => {
    const kept = createEmptyProject("Соседи");
    await create(kept);
    const project = createDemoProject();
    const dynasty = await create(project);
    await dynasty.delete();
    expect(disk.exists(project.name)).toBe(false);
    expect(disk.saved("Соседи")).toEqual(kept);
    expect(disk.sibling()).toBe("Не трогать");
    expect((await disk.store.recent()).map((item) => item.name)).toEqual(["Соседи"]);
    expect(await disk.restart().restoreLast()).toBeUndefined();
    await expect(dynasty.save(project)).rejects.toThrow();
    expect(disk.exists(project.name)).toBe(false);
  });

  it("moves an old browser record into a folder without changing or deleting the record", async () => {
    const old = createDemoProject();
    old.name = "Из старой версии";
    storeLegacyProject(old);
    const before = localStorage.getItem(`dynasty-chronicles:project:${old.id}`);
    expect(listLegacyProjects().map((item) => item.id)).toEqual([old.id]);
    const moved = loadLegacyProject(old.id)!;
    await create(moved);
    expect(disk.saved(old.name)).toEqual(moved);
    expect(localStorage.getItem(`dynasty-chronicles:project:${old.id}`)).toBe(before);
    expect((await disk.restart().restoreLast())?.project).toEqual(moved);
    // Only an explicit, confirmed deletion removes the old record; the folder stays.
    deleteLegacyProject(old.id);
    expect(listLegacyProjects()).toEqual([]);
    expect(disk.saved(old.name)).toEqual(moved);
  });

  it("exports through the variant's own save mechanism", async () => {
    expect(await disk.store.saveFile("Дом.dynasty-tree", "{}")).toBe(true);
  });
});

describe("startup without dialogs", () => {
  it("does not reopen a browser folder whose permission must be confirmed again", async () => {
    const disk = browserVariant();
    disk.pick();
    const place = await disk.store.choosePlace();
    const project = createDemoProject();
    const dynasty = await disk.store.create(place, project);
    await disk.store.remember(dynasty);
    const folder = (place as MemoryDirectory).directories.get(project.name)!;
    folder.permission = "prompt";
    const prompt = vi.spyOn(folder, "requestPermission");
    expect(await disk.restart().restoreLast()).toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
  });
  it("reports a damaged last dynasty instead of opening something else", async () => {
    const disk = desktopVariant();
    const place = await disk.store.choosePlace();
    const project = createDemoProject();
    await disk.store.remember(await disk.store.create(place, project));
    (runtime.native as unknown as FakeNative).files.set(`D:\\Династии\\${project.name}\\${DYNASTY_FILE}`, "{}");
    await expect(disk.restart().restoreLast()).rejects.toThrow();
  });
});
