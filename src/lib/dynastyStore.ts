import type { Project } from "../types";
import type { DynastyVersion } from "./dynastyProtection";
import {
  DynastyFolder,
  FolderDamagedError,
  grantDirectory,
  type DynastyDirectory,
  type RecentFolder,
} from "./folderStorage";

export type { DynastyVersion } from "./dynastyProtection";

/** A place chosen by the user; a new dynasty gets its own folder inside it. */
export interface DynastyPlace {
  readonly name: string;
  readonly displayPath?: string;
}
/** An open dynasty folder with its dynasty.json. */
export interface Dynasty {
  /** Folder shown to the user: the full path on the desktop, the folder name in a browser. */
  readonly folderName: string;
  /** Writes the project; a new name also renames the entry in the recent list. */
  save(project: Project): Promise<void>;
  /** Removes the whole dynasty folder and forgets it. */
  delete(): Promise<void>;
  /** Saved copies of dynasty.json, newest first. */
  versions(): Promise<DynastyVersion[]>;
  /** Replaces the dynasty with a saved copy; the current state becomes a version too. */
  restore(version: DynastyVersion): Promise<Project>;
  /** The dynasty is no longer shown here: other windows may open it. */
  close(): Promise<void>;
}
/** dynasty.json is unreadable or missing, and saved copies can replace it. */
export class DamagedDynastyError extends Error {
  name = "DamagedDynastyError";
  constructor(
    /** Newest first; empty when no copy is readable. */
    readonly versions: DynastyVersion[],
    readonly restore: (version: DynastyVersion) => Promise<OpenedDynasty>,
  ) {
    super("DYNASTY_DAMAGED");
  }
}
export interface RecentDynasty {
  readonly id: string;
  readonly name: string;
  readonly folderName: string;
}
export interface OpenedDynasty {
  dynasty: Dynasty;
  project: Project;
}
/** Resolves true once everything is saved and the application may close. */
export type FlushBeforeClose = () => boolean | Promise<boolean>;

/** The only storage the rest of the application knows about. */
export interface DynastyStore {
  readonly kind: "browser" | "desktop";
  /** False when this browser cannot write to chosen folders. */
  readonly supported: boolean;
  /** Opens the system folder dialog. Rejects with AbortError on cancel. */
  choosePlace(): Promise<DynastyPlace>;
  /** Creates "<place>/<dynasty name>/dynasty.json", adding a number to an occupied name. */
  create(place: DynastyPlace, project: Project): Promise<Dynasty>;
  /** Opens a recent dynasty, or asks for a folder when none is given. */
  open(recent?: RecentDynasty): Promise<OpenedDynasty>;
  /** The dynasty that was open on the last run, without any dialogs. */
  restoreLast(): Promise<OpenedDynasty | undefined>;
  recent(): Promise<RecentDynasty[]>;
  /** Marks a dynasty as the last one and adds it to the recent list. */
  remember(dynasty: Dynasty): Promise<void>;
  /** After an explicit close: the next start shows the welcome screen. */
  forgetLast(): Promise<void>;
  /** Exports a file: a download in a browser, a Save dialog on the desktop. */
  saveFile(name: string, contents: string, png?: boolean): Promise<boolean>;
  /** Lets pending changes be written before the window closes. Returns a function that stops it. */
  guardClose(flush: FlushBeforeClose, onGuardFailure: () => void): () => void;
}

/** What differs between the browser and the desktop version. */
export interface FolderBackend {
  readonly kind: DynastyStore["kind"];
  readonly supported: boolean;
  pick(): Promise<DynastyDirectory>;
  recent(): Promise<RecentFolder[]>;
  last(): Promise<RecentFolder | undefined>;
  remember(folder: DynastyFolder, name: string): Promise<void>;
  clearLast(): Promise<void>;
  forget(directory: DynastyDirectory): Promise<void>;
  saveFile(name: string, contents: string, png: boolean): Promise<boolean>;
  guardClose(flush: FlushBeforeClose, onGuardFailure: () => void): () => void;
}

type RecentEntry = RecentDynasty & { folder: RecentFolder };

class FolderDynasty implements Dynasty {
  remembered = false;
  constructor(
    readonly folder: DynastyFolder,
    private readonly backend: FolderBackend,
    private name: string,
  ) {}
  get folderName() {
    return this.folder.directory.displayPath ?? this.folder.directory.name;
  }
  async save(project: Project) {
    await this.folder.save(project);
    if (project.name === this.name) return;
    this.name = project.name;
    if (this.remembered) await this.backend.remember(this.folder, project.name).catch(() => {});
  }
  async remember() {
    await this.backend.remember(this.folder, this.name);
    this.remembered = true;
  }
  versions() {
    return this.folder.listVersions();
  }
  async restore(version: DynastyVersion) {
    const project = await this.folder.restoreVersion(version.name);
    this.name = project.name;
    return project;
  }
  close() {
    return this.folder.close();
  }
  async delete() {
    await this.folder.delete();
    this.remembered = false;
    await this.backend.clearLast().catch(() => {});
    await this.backend.forget(this.folder.directory).catch(() => {});
  }
}

/** One folder workflow for both versions; only the backend differs. */
export function createFolderStore(backend: FolderBackend): DynastyStore {
  const opened = (folder: DynastyFolder, project: Project): OpenedDynasty => ({
    dynasty: new FolderDynasty(folder, backend, project.name),
    project,
  });
  /** Opens a folder; an unreadable dynasty.json comes back with a way to restore a copy. */
  const openFolder = async (directory: DynastyDirectory, parent?: DynastyDirectory) => {
    try {
      const { folder, project } = await DynastyFolder.open(directory, parent);
      return opened(folder, project);
    } catch (error) {
      if (!(error instanceof FolderDamagedError)) throw error;
      throw new DamagedDynastyError(error.versions, async (version) => {
        const { folder, project } = await DynastyFolder.restoreDamaged(directory, version.name, parent);
        return opened(folder, project);
      });
    }
  };
  // Deleting a folder in a browser needs its parent, which is saved when the dynasty is created.
  const parentOf = async (directory: DynastyDirectory) => {
    for (const item of await backend.recent().catch(() => [])) {
      try {
        if (item.parent && (await item.directory.isSameEntry(directory))) return item.parent;
      } catch {
        /* A stale bookmark must not block opening a selected folder. */
      }
    }
  };
  return {
    kind: backend.kind,
    supported: backend.supported,
    choosePlace: () => backend.pick(),
    async create(place, project) {
      const folder = await DynastyFolder.createInLocation(place as DynastyDirectory, project);
      return opened(folder, project).dynasty;
    },
    async open(recent) {
      let directory: DynastyDirectory;
      let parent: DynastyDirectory | undefined;
      if (recent) {
        ({ directory, parent } = (recent as RecentEntry).folder);
        // Bookmarks from earlier sessions may need the permission to be renewed.
        await grantDirectory(directory);
      } else {
        // Called before any await: a browser requires a direct user gesture.
        directory = await backend.pick();
        parent = await parentOf(directory);
      }
      return openFolder(directory, parent);
    },
    async restoreLast() {
      const entry = await backend.last();
      // Startup never opens a permission dialog; a browser may need a click first.
      if (!entry || (await entry.directory.queryPermission({ mode: "readwrite" })) !== "granted") return;
      return openFolder(entry.directory, entry.parent);
    },
    async recent() {
      return (await backend.recent()).map((folder): RecentEntry => ({
        id: folder.id,
        name: folder.name,
        folderName: folder.directory.name,
        folder,
      }));
    },
    remember: (dynasty) => (dynasty as FolderDynasty).remember(),
    forgetLast: () => backend.clearLast(),
    saveFile: (name, contents, png = false) => backend.saveFile(name, contents, png),
    guardClose: (flush, onGuardFailure) => backend.guardClose(flush, onGuardFailure),
  };
}
