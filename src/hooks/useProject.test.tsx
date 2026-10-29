// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "./useProject";
import { DynastyStoreContext } from "./useDynastyStore";
import { createCharacter, createDemoProject, createEmptyProject } from "../lib/project";
import { webcrypto } from "node:crypto";
import { DYNASTY_FILE } from "../lib/folderStorage";
import { MemoryDirectory } from "../lib/folderStorage.testSupport";
import { browserTestStore, FakeNative, memoryBookmarks, storeLegacyProject } from "../lib/dynastyStore.testSupport";
import { createFolderStore, type DynastyStore } from "../lib/dynastyStore";
import { desktopBackend } from "../lib/desktopStorage";
import { listLegacyProjects } from "../lib/legacyStorage";
import type { Project } from "../types";

const desktop = vi.hoisted(() => ({
  native: undefined as unknown as { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> },
  close: undefined as ((event: { preventDefault: () => void }) => void) | undefined,
  closeWindow: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: (command: string, args?: Record<string, unknown>) => desktop.native.invoke(command, args),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: desktop.register, close: desktop.closeWindow }),
}));

let app: ReturnType<typeof useProject>;
let root: Root;
let store: DynastyStore;
let bookmarks: ReturnType<typeof memoryBookmarks>;
let place: MemoryDirectory;
function Harness() {
  app = useProject();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", webcrypto);
  desktop.close = undefined;
  desktop.closeWindow.mockReset().mockResolvedValue(undefined);
  desktop.register.mockReset().mockImplementation((handler) => {
    desktop.close = handler;
    return Promise.resolve(vi.fn());
  });
  localStorage.clear();
  // An old browser record must never be opened, changed or deleted by these flows.
  storeLegacyProject(createEmptyProject("Старая запись браузера"));
  place = new MemoryDirectory();
  place.name = "Династии";
  vi.stubGlobal(
    "showDirectoryPicker",
    vi.fn(async () => place),
  );
  bookmarks = memoryBookmarks();
  store = browserTestStore(bookmarks);
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Starts the hook and waits until the last dynasty, if any, has been restored. */
async function mount(strict = false) {
  const tree = (
    <DynastyStoreContext.Provider value={store}>
      <Harness />
    </DynastyStoreContext.Provider>
  );
  await act(async () => root.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(app.busy).toBe(false);
  });
}
async function restart() {
  act(() => root.unmount());
  root = createRoot(document.createElement("div"));
  store = browserTestStore(bookmarks);
  await mount();
}
/** A dynasty created earlier and left open, so that it is restored on start. */
async function seed(project = createDemoProject()) {
  const dynasty = await store.create(place, project);
  await store.remember(dynasty);
  return place.directories.get(project.name)!;
}
async function open(project = createDemoProject()) {
  const directory = await seed(project);
  await mount();
  expect(app.hasProject).toBe(true);
  return { directory, project };
}
const saved = (directory: MemoryDirectory): Project => JSON.parse(directory.files.get(DYNASTY_FILE)!).project;
const settle = (check: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {});
    check();
  });

describe("autosave directly in a selected folder", () => {
  it("writes edits and photos to that folder without copying them into localStorage", async () => {
    const { directory, project } = await open();
    const localBefore = Object.fromEntries(Object.entries(localStorage));
    act(() =>
      app.commit((draft) => {
        draft.name = "В выбранной папке";
        draft.characters[0].notes = "Только в файле";
      }),
    );
    await act(async () => {
      expect(await app.forceSave()).toBe(true);
    });
    expect(saved(directory).name).toBe("В выбранной папке");
    expect(saved(directory).id).toBe(project.id);
    expect(saved(directory).characters[0].notes).toBe("Только в файле");
    expect(Object.fromEntries(Object.entries(localStorage))).toEqual(localBefore);
    expect(app.saveStatus).toBe("saved");
    // The new name also appears in the recent list.
    expect((await store.recent()).map((item) => item.name)).toEqual(["В выбранной папке"]);
  });
  it("autosaves shortly after an edit and on pagehide", async () => {
    const { directory } = await open();
    act(() =>
      app.commit((draft) => {
        draft.description = "Автосохранение";
      }),
    );
    expect(app.saveStatus).toBe("saving");
    act(() => vi.advanceTimersByTime(500));
    await settle(() => expect(saved(directory).description).toBe("Автосохранение"));
    act(() =>
      app.commit((draft) => {
        draft.name = "Before closing";
      }),
    );
    act(() => window.dispatchEvent(new Event("pagehide")));
    await settle(() => expect(saved(directory).name).toBe("Before closing"));
  });
  it("keeps unsaved work on a disk failure, warns on close and retries successfully", async () => {
    const { directory } = await open();
    directory.failWrite = true;
    act(() =>
      app.commit((draft) => {
        draft.name = "Не терять";
      }),
    );
    await act(async () => {
      expect(await app.forceSave()).toBe(false);
    });
    expect(app.saveStatus).toBe("error");
    await act(async () => {
      expect(await app.closeFolder()).toBe(false);
    });
    expect(app.hasProject).toBe(true);
    expect(app.project.name).toBe("Не терять");
    const event = new Event("beforeunload", { cancelable: true });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    directory.failWrite = false;
    await act(async () => {
      expect(await app.forceSave()).toBe(true);
    });
    expect(saved(directory).name).toBe("Не терять");
    await act(async () => {
      expect(await app.closeFolder()).toBe(true);
    });
    expect(app.hasProject).toBe(false);
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
  it("shows the welcome screen after an explicit close and reload, keeping the files", async () => {
    const { directory, project } = await open();
    await act(async () => {
      expect(await app.closeFolder()).toBe(true);
    });
    await restart();
    expect(app.hasProject).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(saved(directory)).toEqual(project);
    expect(listLegacyProjects()).toHaveLength(1);
  });
  it("saves the current dynasty before switching to another folder", async () => {
    const { directory } = await open();
    act(() =>
      app.commit((draft) => {
        draft.description = "Last second edit";
      }),
    );
    const next = createEmptyProject("Next");
    const other = await store.create(place, next);
    await act(async () => {
      expect(await app.openFolder(other, next)).toBe(true);
    });
    expect(saved(directory).description).toBe("Last second edit");
    expect(app.project.name).toBe("Next");
    expect((await browserTestStore(bookmarks).restoreLast())?.project.id).toBe(next.id);
  });
  it("keeps the current dynasty open when it cannot be saved before switching", async () => {
    const { directory, project } = await open();
    directory.failWrite = true;
    act(() =>
      app.commit((draft) => {
        draft.description = "Unsaved";
      }),
    );
    const next = createEmptyProject("Next");
    const other = await store.create(place, next);
    await act(async () => {
      expect(await app.openFolder(other, next)).toBe(false);
    });
    expect(app.project.id).toBe(project.id);
    expect(app.project.description).toBe("Unsaved");
    expect(app.saveStatus).toBe("error");
  });
  it("purges characters in the source file and prevents autosave or undo from restoring them", async () => {
    const { directory } = await open();
    act(() => app.deleteCharacter("char_vera"));
    act(() =>
      app.commit((draft) => {
        draft.description = "Future edit";
      }),
    );
    act(() => app.undo());
    expect(app.canRedo).toBe(true);
    await act(async () => {
      expect(await app.permanentlyDeleteCharacters(["char_vera"])).toBe(true);
    });
    expect(app.canUndo).toBe(false);
    expect(app.canRedo).toBe(false);
    act(() => {
      app.undo();
      app.redo();
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(1000);
    });
    expect(JSON.stringify(app.project)).not.toContain("char_vera");
    expect(JSON.stringify(saved(directory))).not.toContain("char_vera");
  });
  it("keeps a trashed profile and history when its irreversible save fails", async () => {
    const { directory } = await open();
    act(() => app.deleteCharacter("char_vera"));
    await act(async () => {
      await app.forceSave();
    });
    const original = app.project;
    const before = directory.files.get(DYNASTY_FILE);
    directory.failWrite = true;
    await act(async () => {
      expect(await app.permanentlyDeleteCharacters(["char_vera"])).toBe(false);
    });
    expect(app.project).toBe(original);
    expect(app.canUndo).toBe(true);
    expect(directory.files.get(DYNASTY_FILE)).toBe(before);
    expect(app.saveStatus).toBe("error");
  });
  it("does not queue a stale autosave behind an irreversible purge already in progress", async () => {
    const { directory } = await open();
    act(() => app.deleteCharacter("char_vera"));
    let release!: () => void;
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    directory.holdWrite = () => {
      directory.holdWrite = undefined;
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    await act(async () => {
      const saving = app.forceSave();
      await writing;
      const purge = app.permanentlyDeleteCharacters(["char_vera"]);
      expect(app.forceSave()).toBe(false);
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(1000);
      release();
      expect(await saving).toBe(true);
      expect(await purge).toBe(true);
    });
    expect(JSON.stringify(saved(directory))).not.toContain("char_vera");
    expect(app.canUndo).toBe(false);
  });
  it("deletes the whole folder with pending edits, without resurrecting it or touching browser records", async () => {
    const { directory, project } = await open();
    directory.files.set("other.txt", "Inside dynasty");
    place.files.set("Сосед.txt", "Рядом");
    act(() =>
      app.commit((draft) => {
        draft.description = "Pending edit";
      }),
    );
    await act(async () => {
      expect(await app.deleteProject()).toBe(true);
    });
    act(() => {
      app.undo();
      app.redo();
      app.commit((draft) => {
        draft.name = "Should not be saved";
      });
      expect(app.addCharacter(createCharacter("Should not exist"))).toBe(false);
      expect(app.forceSave()).toBe(true);
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(1000);
    });
    expect(directory.deleted).toBe(true);
    expect(place.directories.has(project.name)).toBe(false);
    expect(place.files.get("Сосед.txt")).toBe("Рядом");
    expect(app.hasProject).toBe(false);
    expect(app.canUndo).toBe(false);
    expect(await store.recent()).toEqual([]);
    expect(listLegacyProjects()).toHaveLength(1);
    await restart();
    expect(app.hasProject).toBe(false);
    expect(place.directories.has(project.name)).toBe(false);
  });
  it("keeps the current dynasty and pending edits open when deletion fails", async () => {
    const { directory } = await open();
    act(() =>
      app.commit((draft) => {
        draft.description = "Unsaved text";
      }),
    );
    const original = app.project;
    place.failDelete = true;
    await act(async () => {
      expect(await app.deleteProject()).toBe(false);
    });
    expect(app.project).toBe(original);
    expect(app.canUndo).toBe(true);
    expect(app.saveStatus).toBe("error");
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
});

describe("restoring the last dynasty on startup", () => {
  it("opens the last folder and its latest photos without permission prompts", async () => {
    const project = createDemoProject();
    project.name = "Воробьёвы";
    project.characters[0].notes = "Latest disk change";
    project.characters[0].stages[0].photo = {
      original: "data:image/png;base64,photo",
      edited: "data:image/png;base64,crop",
      updatedAt: project.updatedAt,
    };
    const directory = await seed(project);
    const prompts = vi.spyOn(directory, "requestPermission");
    const oldRecords = listLegacyProjects();
    await mount(true);
    expect(app.hasProject).toBe(true);
    expect(app.project).toEqual(project);
    expect(app.folderName).toBe(directory.name);
    expect(prompts).not.toHaveBeenCalled();
    expect(listLegacyProjects()).toEqual(oldRecords);
    act(() =>
      app.commit((draft) => {
        draft.name = "Continue in same folder";
      }),
    );
    await act(async () => {
      expect(await app.forceSave()).toBe(true);
    });
    expect(saved(directory).name).toBe("Continue in same folder");
  });
  it.each(["missing", "corrupt", "denied"])("leaves the welcome screen for a %s folder", async (kind) => {
    const directory = await seed();
    if (kind === "missing") place.directories.delete(directory.name);
    if (kind === "missing") directory.deleted = true;
    if (kind === "corrupt") directory.files.set(DYNASTY_FILE, "{}");
    if (kind === "denied") directory.permission = "prompt";
    const prompt = vi.spyOn(directory, "requestPermission");
    await mount();
    expect(app.hasProject).toBe(false);
    expect(app.startupError).toBe(kind !== "denied");
    expect(prompt).not.toHaveBeenCalled();
    expect(listLegacyProjects()).toHaveLength(1);
  });
  it("shows the welcome screen on a first start even if old browser records exist", async () => {
    await mount();
    expect(app.hasProject).toBe(false);
    expect(app.startupError).toBe(false);
    expect(listLegacyProjects()).toHaveLength(1);
  });
});

describe("desktop version", () => {
  let native: FakeNative;
  const file = () => `D:\\Династии\\${createDemoProject().name}\\${DYNASTY_FILE}`;
  beforeEach(async () => {
    native = new FakeNative().mkdir("D:\\Династии");
    desktop.native = native;
    store = createFolderStore(desktopBackend);
    native.nextPick = "D:\\Династии";
    const dynasty = await store.create(await store.choosePlace(), createDemoProject());
    await store.remember(dynasty);
  });
  it("restores the last folder from app settings and saves to it", async () => {
    await mount();
    expect(app.hasProject).toBe(true);
    expect(app.folderName).toBe(`D:\\Династии\\${createDemoProject().name}`);
    act(() =>
      app.commit((draft) => {
        draft.description = "На диске D";
      }),
    );
    await act(async () => {
      expect(await app.forceSave()).toBe(true);
    });
    expect(JSON.parse(native.files.get(file())!).project.description).toBe("На диске D");
  });
  it("flushes pending edits on native close before letting the window close", async () => {
    await mount();
    act(() =>
      app.commit((draft) => {
        draft.name = "Native close edit";
      }),
    );
    const preventDefault = vi.fn();
    await act(async () => desktop.close!({ preventDefault }));
    await settle(() => expect(desktop.closeWindow).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(JSON.parse(native.files.get(file())!).project.name).toBe("Native close edit");
  });
  it("keeps the window open if writing failed so the unsaved project stays accessible", async () => {
    await mount();
    native.failWrite = true;
    act(() =>
      app.commit((draft) => {
        draft.description = "Pending native edit";
      }),
    );
    const preventDefault = vi.fn();
    await act(async () => desktop.close!({ preventDefault }));
    await settle(() => expect(app.saveStatus).toBe("error"));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(desktop.closeWindow).not.toHaveBeenCalled();
  });
  it("closes immediately when there is nothing to save", async () => {
    await mount();
    const preventDefault = vi.fn();
    act(() => desktop.close!({ preventDefault }));
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("character rules", () => {
  it("rejects a new pet without an explicit eligible owner, regardless of household", async () => {
    await open();
    const before = app.project;
    const owner = before.characters.find((item) => item.type === "sim")!;
    const pet = createCharacter("Без хозяина", "pet", { household: owner.household });
    for (const ownerIds of [[], ["missing"], [pet.id], ["char_rune"]]) {
      act(() => {
        expect(app.addCharacter({ ...pet, ownerIds })).toBe(false);
      });
      expect(app.project).toBe(before);
    }
    act(() => {
      expect(app.addCharacter({ ...pet, ownerIds: [owner.id] })).toBe(true);
    });
    expect(app.project.characters.find((item) => item.id === pet.id)?.ownerIds).toEqual([owner.id]);
  });

  it("does not accept an owner in trash and allows choosing another owner", async () => {
    await open();
    act(() => app.deleteCharacter("char_nika"));
    const pet = createCharacter("Питомец", "pet", { ownerIds: ["char_nika"] });
    act(() => {
      expect(app.addCharacter(pet)).toBe(false);
    });
    act(() => {
      expect(app.addCharacter({ ...pet, ownerIds: ["char_vera"] })).toBe(true);
    });
    expect(app.project.characters.some((item) => item.id === pet.id)).toBe(true);
  });

  it("rejects removing the last owner or converting a Sim without assigning an owner", async () => {
    await open();
    const before = app.project;
    act(() => {
      expect(app.updateCharacter("char_rune", { ownerIds: [] })).toBe(false);
    });
    act(() => {
      expect(app.updateCharacter("char_vera", { type: "pet" })).toBe(false);
    });
    expect(app.project).toBe(before);
    act(() => {
      expect(app.updateCharacter("char_rune", { ownerIds: ["char_vera"] })).toBe(true);
    });
    expect(app.project.characters.find((item) => item.id === "char_rune")?.ownerIds).toEqual(["char_vera"]);
  });
});

describe("lightweight undo history", () => {
  const photo = (label: string) => ({
    original: `data:image/png;base64,${label}-original`,
    edited: `data:image/png;base64,${label}-edited`,
    updatedAt: "2026-10-27T00:00:00.000Z",
  });
  const withPhotos = async () => {
    await open();
    act(() =>
      app.commit((draft) => {
        draft.characters.forEach((character, index) => {
          if (character.stages[0]) character.stages[0].photo = photo(String(index));
        });
      }),
    );
    return app.project;
  };

  it("shares unchanged characters and photos between history steps", async () => {
    const before = await withPhotos();
    const [edited, ...others] = before.characters;
    expect(others.length).toBeGreaterThan(0);
    act(() => {
      expect(app.updateCharacter(edited.id, { notes: "Новая заметка" })).toBe(true);
    });
    const after = app.project;
    expect(after).not.toBe(before);
    expect(after.characters[0]).not.toBe(edited);
    expect(after.characters[0].notes).toBe("Новая заметка");
    expect(after.characters[0].stages).toBe(edited.stages);
    others.forEach((character, index) => {
      expect(after.characters[index + 1]).toBe(character);
      expect(after.characters[index + 1].stages[0]?.photo).toBe(character.stages[0]?.photo);
    });
    expect(after.parentLinks).toBe(before.parentLinks);
    expect(after.pairLinks).toBe(before.pairLinks);
    expect(after.positions).toBe(before.positions);
  });

  it("freezes history so earlier steps cannot be changed by accident", async () => {
    const before = await withPhotos();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.characters[0])).toBe(true);
    expect(() => {
      (before.characters[0] as { notes: string }).notes = "изменено";
    }).toThrow();
  });

  it("restores the exact previous and next states on undo and redo", async () => {
    const before = await withPhotos();
    const snapshot = structuredClone(before);
    const id = before.characters[1].id;
    act(() => {
      app.updateCharacter(id, { notes: "Шаг 1" });
    });
    const first = app.project;
    act(() => app.deleteCharacter(id));
    const second = app.project;
    expect(second.characters.some((item) => item.id === id)).toBe(false);

    act(() => app.undo());
    expect(app.project).toBe(first);
    act(() => app.undo());
    expect(app.project).toBe(before);
    expect(app.project).toEqual(snapshot);
    act(() => app.redo());
    expect(app.project).toBe(first);
    act(() => app.redo());
    expect(app.project).toBe(second);
    expect(app.canRedo).toBe(false);
  });

  it("keeps at most 50 undo steps", async () => {
    await open();
    const id = app.project.characters[0].id;
    for (let step = 1; step <= 60; step++)
      act(() => {
        app.updateCharacter(id, { notes: `Шаг ${step}` });
      });
    let undone = 0;
    while (app.canUndo) {
      act(() => app.undo());
      undone++;
    }
    expect(undone).toBe(50);
    expect(app.project.characters[0].notes).toBe("Шаг 10");
  });
});
