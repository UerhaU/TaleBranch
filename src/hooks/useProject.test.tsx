// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "./useProject";
import { createCharacter, createDemoProject, createEmptyProject } from "../lib/project";
import { listProjects, loadProject, saveProject } from "../lib/storage";
import { webcrypto } from "node:crypto";
import { DynastyFolder, DYNASTY_FILE, FOLDER_ACTIVE_KEY } from "../lib/folderStorage";
import { MemoryDirectory } from "../lib/folderStorage.testSupport";
import * as folderStorage from "../lib/folderStorage";

const desktop = vi.hoisted(() => ({
  active: false,
  close: undefined as ((event: { preventDefault: () => void }) => void) | undefined,
  stop: vi.fn(),
  register: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => desktop.active, invoke: desktop.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onCloseRequested: desktop.register }) }));

let app: ReturnType<typeof useProject>;
let root: Root;
function Harness() {
  app = useProject();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  desktop.active = false;
  desktop.close = undefined;
  desktop.stop.mockReset();
  desktop.invoke.mockReset().mockResolvedValue(null);
  desktop.register.mockReset().mockImplementation((handler) => {
    desktop.close = handler;
    return Promise.resolve(desktop.stop);
  });
  localStorage.clear();
  saveProject(createDemoProject());
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = () => act(() => root.render(<Harness />));

describe("autosave directly in a selected folder", () => {
  const open = async () => {
    vi.stubGlobal("crypto", webcrypto);
    const directory = new MemoryDirectory();
    const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project);
    mount();
    await act(async () => {
      expect(await app.openFolder(folder, project)).toBe(true);
    });
    return { directory, project, folder };
  };
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
    const saved = (await DynastyFolder.open(directory)).project;
    expect(saved.name).toBe("В выбранной папке");
    expect(saved.id).toBe(project.id);
    expect(saved.characters[0].notes).toBe("Только в файле");
    expect(Object.fromEntries(Object.entries(localStorage))).toEqual(localBefore);
    expect(app.saveStatus).toBe("saved");
  });
  it("transfers the current unsaved snapshot even when browser storage is full", async () => {
    vi.stubGlobal("crypto", webcrypto);
    mount();
    act(() =>
      app.commit((draft) => {
        draft.name = "Спасти несохранённые изменения";
      }),
    );
    const snapshot = app.project;
    const old = loadProject(snapshot.id);
    const directory = new MemoryDirectory();
    const folder = await DynastyFolder.create(directory, snapshot);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith("dynasty-chronicles:project:")) throw new DOMException("Full", "QuotaExceededError");
      return setItem.call(this, key, value);
    });
    act(() => {
      expect(app.forceSave()).toBe(false);
    });
    await act(async () => {
      expect(await app.openFolder(folder, snapshot, true)).toBe(true);
    });
    expect((await DynastyFolder.open(directory)).project.name).toBe(snapshot.name);
    expect(loadProject(snapshot.id)).toEqual(old);
    expect(app.saveStatus).toBe("saved");
    expect(app.folderName).toBe(directory.name);
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
    expect((await DynastyFolder.open(directory)).project.name).toBe("Не терять");
    await act(async () => {
      expect(await app.closeFolder()).toBe(true);
    });
    expect(app.hasProject).toBe(false);
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
  it("does not resume an old browser copy or create a phantom dynasty after reload", async () => {
    await open();
    expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    await act(async () => mount());
    expect(app.hasProject).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(listProjects()).toHaveLength(1); // The pre-existing browser dynasty is untouched.
  });
  it("purges characters in the source file and prevents autosave or undo from restoring them", async () => {
    const { directory } = await open();
    act(() => app.deleteCharacter("char_vera"));
    await act(async () => {
      expect(await app.permanentlyDeleteCharacters(["char_vera"])).toBe(true);
    });
    act(() => {
      app.undo();
      app.redo();
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(JSON.stringify((await DynastyFolder.open(directory)).project)).not.toContain("char_vera");
    expect(app.canUndo).toBe(false);
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
    expect(JSON.stringify((await DynastyFolder.open(directory)).project)).not.toContain("char_vera");
    expect(app.canUndo).toBe(false);
  });
  it("deletes the whole source folder without resurrecting it or deleting browser dynasties", async () => {
    const { directory } = await open();
    directory.files.set("other.txt", "Inside dynasty");
    await act(async () => {
      expect(await app.deleteProject()).toBe(true);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(1000);
    });
    expect(directory.deleted).toBe(true);
    expect(directory.files.size).toBe(0);
    expect(localStorage.getItem(FOLDER_ACTIVE_KEY)).toBe("closed");
    expect(app.hasProject).toBe(false);
    expect(listProjects()).toHaveLength(1);
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    await act(async () => mount());
    expect(app.hasProject).toBe(false);
    expect(listProjects()).toHaveLength(1);
  });
});

describe("restoring the last dynasty on startup", () => {
  it.each([false, true])(
    "opens the last folder and its latest photos instead of an old browser record (desktop=%s)",
    async (native) => {
      vi.stubGlobal("crypto", webcrypto);
      desktop.active = native;
      const directory = new MemoryDirectory();
      const saved = createDemoProject();
      saved.name = "Воробьёвы";
      saved.characters[0].notes = "Latest disk change";
      saved.characters[0].stages[0].photo = {
        original: "data:image/png;base64,photo",
        edited: "data:image/png;base64,crop",
        updatedAt: saved.updatedAt,
      };
      await DynastyFolder.create(directory, saved);
      localStorage.setItem(FOLDER_ACTIVE_KEY, saved.id);
      vi.spyOn(folderStorage, "lastDynastyFolder").mockResolvedValue({ id: "bookmark", name: saved.name, directory });
      const prompts = vi.spyOn(directory, "requestPermission");
      const oldRecords = listProjects();
      await act(async () => {
        root.render(
          <StrictMode>
            <Harness />
          </StrictMode>,
        );
      });
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(app.busy).toBe(false);
      });
      expect(app.hasProject).toBe(true);
      expect(app.busy).toBe(false);
      expect(app.project).toEqual(saved);
      expect(app.folderName).toBe(directory.name);
      expect(prompts).not.toHaveBeenCalled();
      expect(listProjects()).toEqual(oldRecords);
      act(() =>
        app.commit((draft) => {
          draft.name = "Continue in same folder";
        }),
      );
      await act(async () => {
        expect(await app.forceSave()).toBe(true);
      });
      expect((await DynastyFolder.open(directory)).project.name).toBe("Continue in same folder");
    },
  );
  it.each(["missing", "corrupt", "denied"])(
    "leaves the welcome screen without replacing a %s folder with browser data",
    async (kind) => {
      vi.stubGlobal("crypto", webcrypto);
      localStorage.setItem(FOLDER_ACTIVE_KEY, "saved-folder");
      const directory = new MemoryDirectory();
      if (kind === "corrupt") directory.files.set(DYNASTY_FILE, "{}");
      if (kind === "denied") directory.permission = "prompt";
      vi.spyOn(folderStorage, "lastDynastyFolder").mockResolvedValue({ id: "bookmark", name: "Last", directory });
      const prompt = vi.spyOn(directory, "requestPermission");
      await act(async () => mount());
      expect(app.hasProject).toBe(false);
      expect(app.busy).toBe(false);
      expect(app.startupError).toBe(kind !== "denied");
      expect(prompt).not.toHaveBeenCalled();
      expect(listProjects()).toHaveLength(1);
    },
  );
  it("shows the empty state on first desktop launch even if a browser record exists", async () => {
    desktop.active = true;
    await act(async () => mount());
    expect(app.hasProject).toBe(false);
    expect(app.busy).toBe(false);
    expect(listProjects()).toHaveLength(1);
  });
});

describe("autosave across project transitions", () => {
  it("rejects a new pet without an explicit eligible owner, regardless of household", () => {
    mount();
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

  it("does not accept an owner in trash and allows choosing another owner", () => {
    mount();
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

  it("rejects removing the last owner or converting a Sim without assigning an owner", () => {
    mount();
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

  it("persists a purge immediately and clears undo and redo so deleted profiles cannot return", () => {
    mount();
    act(() => app.deleteCharacter("char_vera"));
    act(() =>
      app.commit((draft) => {
        draft.description = "Future edit";
      }),
    );
    act(() => app.undo());
    expect(app.canUndo).toBe(true);
    expect(app.canRedo).toBe(true);
    act(() => {
      expect(app.permanentlyDeleteCharacters(["char_vera"])).toBe(true);
    });
    expect(app.canUndo).toBe(false);
    expect(app.canRedo).toBe(false);
    expect(JSON.stringify(loadProject(app.project.id))).not.toContain("char_vera");
    act(() => {
      app.undo();
      app.redo();
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(1000);
    });
    expect(JSON.stringify(app.project)).not.toContain("char_vera");
    expect(JSON.stringify(loadProject(app.project.id))).not.toContain("char_vera");
  });

  it("keeps a trashed profile and history when its irreversible save fails", () => {
    mount();
    act(() => app.deleteCharacter("char_vera"));
    act(() => app.forceSave());
    const original = app.project;
    const saved = localStorage.getItem(`dynasty-chronicles:project:${original.id}`);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === `dynasty-chronicles:project:${original.id}`) throw Error("Failed to write record");
      setItem.call(this, key, value);
    });
    act(() => {
      expect(app.permanentlyDeleteCharacters(["char_vera"])).toBe(false);
    });
    expect(app.project).toBe(original);
    expect(app.canUndo).toBe(true);
    expect(localStorage.getItem(`dynasty-chronicles:project:${original.id}`)).toBe(saved);
    expect(app.saveStatus).toBe("error");
  });

  it("deletes a dynasty with pending changes without autosave, undo or unmount recreating it", () => {
    const remaining = createEmptyProject("Other dynasty");
    saveProject(remaining);
    saveProject(createDemoProject());
    mount();
    const deletedId = app.project.id;
    act(() =>
      app.commit((draft) => {
        draft.description = "Pending edit";
      }),
    );
    act(() => {
      expect(app.deleteProject()).toBe(true);
    });
    expect(app.project.id).toBe(remaining.id);
    act(() => {
      app.undo();
      app.redo();
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(loadProject(deletedId)).toBeNull();
    expect(app.canUndo).toBe(false);
    expect(app.canRedo).toBe(false);
    expect(listProjects().map((item) => item.id)).toEqual([remaining.id]);
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    mount();
    expect(app.project.id).toBe(remaining.id);
    expect(loadProject(deletedId)).toBeNull();
  });

  it("leaves no active dynasty after deleting the last one, including after autosave and reopening", () => {
    mount();
    const deletedId = app.project.id;
    act(() => {
      expect(app.deleteProject()).toBe(true);
    });
    expect(app.hasProject).toBe(false);
    act(() => {
      app.commit((draft) => {
        draft.name = "Should not be saved";
      });
      expect(app.addCharacter(createCharacter("Should not exist"))).toBe(false);
      app.undo();
      app.redo();
      expect(app.forceSave()).toBe(true);
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(listProjects()).toEqual([]);
    expect(loadProject(deletedId)).toBeNull();
    expect(localStorage.getItem("dynasty-chronicles:active")).toBeNull();
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    mount();
    act(() => vi.advanceTimersByTime(1000));
    expect(app.hasProject).toBe(false);
    expect(listProjects()).toEqual([]);
    act(() => {
      expect(app.replace(createEmptyProject("Дом Соколовых"))).toBe(true);
    });
    expect(app.hasProject).toBe(true);
    expect(listProjects().map((item) => item.name)).toEqual(["Дом Соколовых"]);
  });

  it("keeps the current dynasty and pending edits open when deletion fails", () => {
    mount();
    act(() => app.forceSave());
    act(() =>
      app.commit((draft) => {
        draft.description = "Unsaved text";
      }),
    );
    const original = app.project;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("Storage unavailable");
    });
    act(() => {
      expect(app.deleteProject()).toBe(false);
    });
    expect(app.project).toBe(original);
    expect(app.project.description).toBe("Unsaved text");
    expect(app.canUndo).toBe(true);
    expect(app.saveStatus).toBe("error");
    expect(loadProject(original.id)).not.toBeNull();
  });

  it("flushes pending edits on native close before allowing the window to be destroyed", async () => {
    desktop.active = true;
    await act(async () => root.render(<Harness />));
    await act(async () => {
      expect(await app.replace(createDemoProject())).toBe(true);
    });
    act(() =>
      app.commit((draft) => {
        draft.name = "Native close edit";
      }),
    );
    const preventDefault = vi.fn();
    act(() => desktop.close!({ preventDefault }));
    expect(loadProject(app.project.id)?.name).toBe("Native close edit");
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("prevents native close if writing failed so the unsaved project stays accessible", async () => {
    desktop.active = true;
    await act(async () => root.render(<Harness />));
    await act(async () => {
      expect(await app.replace(createDemoProject())).toBe(true);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    act(() =>
      app.commit((draft) => {
        draft.description = "Pending native edit";
      }),
    );
    const preventDefault = vi.fn();
    act(() => desktop.close!({ preventDefault }));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(app.saveStatus).toBe("error");
  });

  it("flushes recent edits before switching, without waiting for the debounce", () => {
    mount();
    const oldId = app.project.id;
    act(() =>
      app.commit((draft) => {
        draft.description = "Last second edit";
      }),
    );
    act(() => {
      expect(app.replace(createEmptyProject("Next"))).toBe(true);
    });
    expect(loadProject(oldId)?.description).toBe("Last second edit");
    act(() => vi.advanceTimersByTime(500));
    expect(app.project.name).toBe("Next");
    expect(localStorage.getItem("dynasty-chronicles:active")).toBe(app.project.id);
  });

  it("keeps the current project open and reports failure when saving fails", () => {
    mount();
    const oldId = app.project.id;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    act(() =>
      app.commit((draft) => {
        draft.description = "Unsaved";
      }),
    );
    act(() => {
      expect(app.forceSave()).toBe(false);
      expect(app.replace(createEmptyProject("Next"))).toBe(false);
    });
    expect(app.project.id).toBe(oldId);
    expect(app.project.description).toBe("Unsaved");
    expect(app.saveStatus).toBe("error");
  });

  it("flushes a pending edit on pagehide", () => {
    mount();
    act(() =>
      app.commit((draft) => {
        draft.name = "Before closing";
      }),
    );
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(loadProject(app.project.id)?.name).toBe("Before closing");
  });

  it("shows recovery state without overwriting corrupt records", () => {
    localStorage.setItem("dynasty-chronicles:active", "project_demo");
    localStorage.setItem("dynasty-chronicles:project:project_demo", "broken");
    mount();
    act(() => vi.advanceTimersByTime(1000));
    expect(app.loadError).toBe(true);
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe("broken");
    act(() => {
      expect(app.replace(createEmptyProject("Recovered work"))).toBe(true);
    });
    expect(app.loadError).toBe(false);
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe("broken");
  });
});
