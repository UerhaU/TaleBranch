// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createDemoProject, createEmptyProject } from "./project";
import { MemoryDirectory } from "./folderStorage.testSupport";
import { browserTestStore, FakeNative, memoryBookmarks, storeLegacyProject } from "./dynastyStore.testSupport";
import { createFolderStore, DamagedDynastyError, type DynastyStore } from "./dynastyStore";
import { desktopBackend } from "./desktopStorage";
import { DAMAGED_FILE, DYNASTY_FILE } from "./folderStorage";
import { KEEP_VERSIONS, OPEN_MARKER, VERSION_INTERVAL } from "./dynastyProtection";
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
  /** A text file inside a dynasty folder. */
  file(folder: string, name: string): string | undefined;
  setFile(folder: string, name: string, text: string): void;
  /** File names in "<dynasty>/photos". */
  photos(folder: string): string[];
  /** Puts the user's own file into the photos folder, or removes a picture behind the program's back. */
  setPhoto(folder: string, name: string, present: boolean): void;
  /** Saved copies in "<dynasty>/backups": name → text. */
  versions(folder: string): Map<string, string>;
  /** Another window or copy of the program opens the dynasty. */
  occupy(folder: string): void;
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
    file: (folder, name) => place.directories.get(folder)?.files.get(name),
    setFile: (folder, name, text) => place.directories.get(folder)!.files.set(name, text),
    photos: (folder) => {
      const photos = place.directories.get(folder)?.directories.get("photos");
      return photos ? [...photos.files.keys(), ...photos.binary.keys()].sort() : [];
    },
    setPhoto: (folder, name, present) => {
      const photos = place.directories.get(folder)!.directories.get("photos")!;
      if (present) photos.files.set(name, "Свой файл");
      else photos.binary.delete(name);
    },
    versions: (folder) => new Map(place.directories.get(folder)?.directories.get("backups")?.files ?? []),
    occupy: (folder) => {
      const marker = { app: "talebranch", owner: "browser_other", session: "open_other", updatedAt: Date.now() };
      place.directories.get(folder)!.files.set(OPEN_MARKER, JSON.stringify(marker));
    },
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
    file: (folder, name) => native.files.get(`D:\\Династии\\${folder}\\${name}`),
    setFile: (folder, name, text) => native.files.set(`D:\\Династии\\${folder}\\${name}`, text),
    photos: (folder) => {
      const prefix = `D:\\Династии\\${folder}\\photos\\`;
      const names = [...native.photos.keys(), ...native.files.keys()].filter((path) => path.startsWith(prefix));
      return names.map((path) => path.slice(prefix.length)).sort();
    },
    setPhoto: (folder, name, present) => {
      const path = `D:\\Династии\\${folder}\\photos\\${name}`;
      if (present) native.files.set(path, "Свой файл");
      else native.photos.delete(path);
    },
    versions: (folder) => {
      const prefix = `D:\\Династии\\${folder}\\backups\\`;
      const found = [...native.versions].filter(([path]) => path.startsWith(prefix));
      return new Map(found.map(([path, text]) => [path.slice(prefix.length), text]));
    },
    occupy: (folder) => {
      native.markers.set(`D:\\Династии\\${folder}`, "another-process");
    },
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

  describe("photos as separate files", () => {
    const picture = (text: string, type = "png") => `data:image/${type};base64,${btoa(text)}`;
    const transform = { zoom: 1.5, x: 0.1, y: 0, rotation: 90, flipped: false };
    const ORIGINAL = "original ".repeat(3000);
    /** An old dynasty: each photo twice inside dynasty.json, one without crop settings. */
    const oldDynasty = async () => {
      const project = createDemoProject();
      const [first, second] = project.characters;
      first.stages[0].photo = {
        original: picture(ORIGINAL),
        edited: picture("crop without settings", "webp"),
        updatedAt: project.updatedAt,
      };
      second.stages[0].photo = {
        original: picture(ORIGINAL),
        edited: picture("crop", "webp"),
        transform,
        updatedAt: project.updatedAt,
      };
      await create(createEmptyProject(project.name));
      const text = JSON.stringify({ app: "dynasty-chronicles", formatVersion: 1, project }, null, 2);
      disk.setFile(project.name, DYNASTY_FILE, text);
      return { project, text };
    };
    const reopen = async (name: string) => {
      disk.pick(name);
      return disk.restart().open();
    };

    it("moves the photos of an old dynasty into files after keeping a copy of the old file", async () => {
      const { project, text } = await oldDynasty();
      const opened = await reopen(project.name);
      const [first, second] = opened.project.characters;
      expect(first.stages[0].photo).toEqual(project.characters[0].stages[0].photo);
      expect(second.stages[0].photo).toMatchObject({ original: picture(ORIGINAL), transform });
      expect(disk.file(project.name, "dynasty.backup-before-photos.json")).toBe(text);
      const saved = disk.file(project.name, DYNASTY_FILE)!;
      expect(JSON.parse(saved).formatVersion).toBe(2);
      expect(saved).not.toContain("data:image");
      expect(saved.length).toBeLessThan(text.length);
      // The shared original is stored once; only the crop without settings is kept as a picture.
      expect(disk.photos(project.name)).toHaveLength(2);
      expect(disk.photos(project.name).every((name) => /^[0-9a-f]{64}\.(png|webp)$/.test(name))).toBe(true);
      // A crop with settings is drawn again from the original instead of being stored.
      const expected = structuredClone(opened.project);
      delete expected.characters[1].stages[0].photo!.edited;
      expect((await reopen(project.name)).project).toEqual(expected);
      expect(disk.file(project.name, DYNASTY_FILE)).toBe(saved);
    });

    it("removes only its own photo files that nothing refers to any more", async () => {
      const { project } = await oldDynasty();
      const opened = await reopen(project.name);
      disk.setPhoto(project.name, "notes.txt", true);
      const next = structuredClone(opened.project);
      delete next.characters[0].stages[0].photo;
      await opened.dynasty.save(next);
      expect(disk.photos(project.name)).toEqual([expect.stringMatching(/\.png$/), "notes.txt"]);
      delete next.characters[1].stages[0].photo;
      await opened.dynasty.save(next);
      expect(disk.photos(project.name)).toEqual(["notes.txt"]);
      expect((await reopen(project.name)).project).toEqual(next);
    });

    it("writes a new photo as a file and keeps dynasty.json small", async () => {
      const project = createDemoProject();
      const dynasty = await create(project);
      const next = structuredClone(project);
      const photo = {
        original: picture("x".repeat(20000)),
        edited: picture("crop", "webp"),
        transform,
        updatedAt: project.updatedAt,
      };
      next.characters[0].stages[0].photo = photo;
      await dynasty.save(next);
      expect(disk.photos(project.name)).toHaveLength(1);
      expect(disk.file(project.name, DYNASTY_FILE)!.length).toBeLessThan(20000);
      expect(disk.file(project.name, "dynasty.backup-before-photos.json")).toBeUndefined();
      const reopened = (await reopen(project.name)).project.characters[0].stages[0].photo;
      expect(reopened).toEqual({ original: photo.original, transform, updatedAt: project.updatedAt });
    });

    it("still opens a dynasty when a photo file was deleted outside the program", async () => {
      const { project } = await oldDynasty();
      await reopen(project.name);
      for (const name of disk.photos(project.name)) disk.setPhoto(project.name, name, false);
      const opened = await reopen(project.name);
      const photos = opened.project.characters.flatMap((character) => character.stages.filter((stage) => stage.photo));
      expect(photos).toEqual([]);
      expect(opened.project.characters.map((character) => character.id)).toEqual(
        project.characters.map((character) => character.id),
      );
    });
  });

  it("keeps at most one version per interval and only the latest ones, without photos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
      const project = createDemoProject();
      const dynasty = await create(project);
      expect(disk.versions(project.name).size).toBe(1);
      // Typing a minute later does not make another copy.
      vi.setSystemTime(new Date("2026-10-29T12:01:00Z"));
      await dynasty.save({ ...project, description: "Минуту спустя" });
      expect(disk.versions(project.name).size).toBe(1);
      for (let step = 1; step <= KEEP_VERSIONS + 2; step++) {
        vi.setSystemTime(Date.now() + VERSION_INTERVAL);
        await dynasty.save({ ...project, description: `Шаг ${step}` });
      }
      const versions = disk.versions(project.name);
      expect(versions.size).toBe(KEEP_VERSIONS);
      const newest = [...versions.keys()].sort().at(-1)!;
      expect(JSON.parse(versions.get(newest)!).project.description).toBe(`Шаг ${KEEP_VERSIONS + 2}`);
      expect([...versions.keys()].sort()[0]).not.toBe("dynasty-20261029-120000-000.json");
      expect([...versions.values()].every((text) => !text.includes("data:image"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores a chosen version and keeps the replaced state as a version too", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
      const project = createDemoProject();
      const dynasty = await create(project);
      vi.setSystemTime(Date.now() + VERSION_INTERVAL);
      const changed = { ...project, name: "Переименована" };
      await dynasty.save(changed);
      const [oldest] = (await dynasty.versions()).slice(-1);
      expect(oldest.characters).toBe(project.characters.length);
      vi.setSystemTime(Date.now() + 1000);
      const restored = await dynasty.restore(oldest);
      expect(restored).toEqual(project);
      expect(disk.saved(project.name)).toEqual(project);
      const kept = await dynasty.versions();
      expect(kept).toHaveLength(3);
      expect(JSON.parse(disk.versions(project.name).get(kept[0].name)!).project.name).toBe("Переименована");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the last good version for a damaged dynasty.json and keeps the damaged file", async () => {
    const project = createDemoProject();
    await (await create(project)).close();
    disk.setFile(project.name, DYNASTY_FILE, '{"app":"dynasty-chronicles","project":{"na');
    disk.pick(project.name);
    const failure = await disk.store.open().catch((error) => error);
    expect(failure).toBeInstanceOf(DamagedDynastyError);
    expect((failure as DamagedDynastyError).versions).toHaveLength(1);
    const opened = await (failure as DamagedDynastyError).restore((failure as DamagedDynastyError).versions[0]);
    expect(opened.project).toEqual(project);
    expect(disk.saved(project.name)).toEqual(project);
    expect(disk.file(project.name, DAMAGED_FILE)).toBe('{"app":"dynasty-chronicles","project":{"na');
    await opened.dynasty.save({ ...project, name: "Снова работает" });
    expect(disk.saved(project.name)!.name).toBe("Снова работает");
  });

  it("does not open a dynasty that another window has open", async () => {
    const project = createDemoProject();
    await (await create(project)).close();
    disk.occupy(project.name);
    disk.pick(project.name);
    await expect(disk.store.open()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    await expect(disk.restart().restoreLast()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    expect(disk.saved(project.name)).toEqual(project);
  });

  it("lets this window reopen its own dynasty and delete it while it is marked as open", async () => {
    const project = createDemoProject();
    await create(project);
    disk.pick(project.name);
    const again = await disk.store.open();
    expect(again.project).toEqual(project);
    await again.dynasty.delete();
    expect(disk.exists(project.name)).toBe(false);
    expect(disk.sibling()).toBe("Не трогать");
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
