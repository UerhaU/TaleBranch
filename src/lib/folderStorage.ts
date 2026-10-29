import type { Project } from "../types";
import { readProjectDocument, serializeProject } from "./storage";
import {
  bytesDataUrl,
  dataUrlBytes,
  hasPhotos,
  isPhotoFile,
  PHOTO_FOLDER,
  photoType,
  type PhotoFiles,
} from "./photoFiles";
import {
  describeVersion,
  handleOpenMarker,
  handleVersionFiles,
  KEEP_VERSIONS,
  MARKER_REFRESH,
  newestFirst,
  VERSION_INTERVAL,
  versionName,
  versionTime,
  type DynastyVersion,
  type OpenMarker,
  type VersionFiles,
} from "./dynastyProtection";

export const DYNASTY_FILE = "dynasty.json";
/** A copy of dynasty.json from before photos became separate files. */
export const PHOTO_BACKUP_FILE = "dynasty.backup-before-photos.json";
/** An unreadable dynasty.json is kept under this name when a version is restored over it. */
export const DAMAGED_FILE = "dynasty.damaged.json";
export interface DynastyDirectory {
  name: string;
  readonly displayPath?: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DynastyDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  remove?(options?: { recursive?: boolean }): Promise<void>;
  deleteDynasty?(expected: string): Promise<void>;
  /** Native photo files; other directories use the photos folder handle. */
  photoFiles?(): PhotoFiles;
  /** Native copy of dynasty.json with the given revision; returns the backup name. */
  backupDynasty?(expected: string, damaged?: boolean): Promise<string>;
  /** Native version copies; other directories use the backups folder handle. */
  versionFiles?(): VersionFiles;
  /** Native open marker, owned by the desktop process. */
  openMarker?(): OpenMarker;
  values(): AsyncIterableIterator<{ name: string }>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  isSameEntry(other: DynastyDirectory): Promise<boolean>;
}

/** A display name may contain characters that Windows cannot use in a folder. */
export function dynastyFolderName(name: string): string {
  let safe = Array.from(name.trim().replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_"))
    .slice(0, 100)
    .join("")
    .replace(/[.\s]+$/g, "");
  if (!safe) safe = "Dynasty";
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(safe)) safe = `_${safe}`;
  return safe;
}
export async function grantDirectory(directory: DynastyDirectory): Promise<void> {
  if (
    (await directory.queryPermission({ mode: "readwrite" })) !== "granted" &&
    (await directory.requestPermission({ mode: "readwrite" })) !== "granted"
  )
    throw new DOMException("Folder access denied", "NotAllowedError");
}
async function digest(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const missing = (error: unknown) => (error as Error)?.name === "NotFoundError";
const readText = async (directory: DynastyDirectory, name: string) =>
  (await directory.getFileHandle(name)).getFile().then((file) => file.text());

/** The photos folder through directory handles: a browser folder or the test disk. */
function handlePhotoFiles(directory: DynastyDirectory): PhotoFiles {
  const folder = (create = false) => directory.getDirectoryHandle(PHOTO_FOLDER, { create });
  return {
    async list() {
      let photos: DynastyDirectory;
      try {
        photos = await folder();
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const names: string[] = [];
      for await (const entry of photos.values()) if (isPhotoFile(entry.name)) names.push(entry.name);
      return names;
    },
    async read(name) {
      try {
        const file = await (await (await folder()).getFileHandle(name)).getFile();
        return bytesDataUrl(new Uint8Array(await file.arrayBuffer()), photoType(name));
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
    },
    async write(name, dataUrl) {
      const writer = await (await (await folder(true)).getFileHandle(name, { create: true })).createWritable();
      try {
        await writer.write(dataUrlBytes(dataUrl) as BufferSource);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        throw error;
      }
    },
    async remove(name) {
      await (await folder()).removeEntry(name);
    },
  };
}
const photoFilesOf = (directory: DynastyDirectory) => directory.photoFiles?.() ?? handlePhotoFiles(directory);

const versionFilesOf = (directory: DynastyDirectory) => directory.versionFiles?.() ?? handleVersionFiles(directory);
const openMarkerOf = (directory: DynastyDirectory) => directory.openMarker?.() ?? handleOpenMarker(directory);

/**
 * A copy of dynasty.json beside it: before photos are moved out, or an unreadable file
 * before a version is restored over it. An existing copy is never replaced.
 */
async function copyDynastyFile(directory: DynastyDirectory, text: string, revision: string, damaged = false) {
  if (directory.backupDynasty) return directory.backupDynasty(revision, damaged);
  const base = damaged ? DAMAGED_FILE : PHOTO_BACKUP_FILE;
  for (let number = 1; ; number++) {
    const name = number === 1 ? base : base.replace(".json", ` (${number}).json`);
    try {
      if ((await readText(directory, name)) === text) return name;
      continue;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();
    try {
      await writer.write(text);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
    if ((await readText(directory, name)) !== text) throw new Error("BACKUP_FAILED");
    return name;
  }
}

/** Valid copies, newest first. Unreadable copies are skipped. */
async function listVersions(versions: VersionFiles): Promise<DynastyVersion[]> {
  const found: DynastyVersion[] = [];
  for (const name of newestFirst(await versions.list())) {
    const text = await versions.read(name).catch(() => undefined);
    const version = text === undefined ? undefined : describeVersion(name, text);
    if (version) found.push(version);
  }
  return found;
}
/** Photo files that saved copies still refer to; they are kept for restoring. */
async function versionPhotos(versions: VersionFiles): Promise<Set<string>> {
  const names = new Set<string>();
  for (const name of await versions.list()) {
    const text = (await versions.read(name)) ?? "";
    for (const match of text.matchAll(/photos\/([0-9a-f]{64}\.(?:jpg|png|webp))/g)) names.add(match[1]);
  }
  return names;
}
/** Not a broken file: missing access, a failed read, or a file from a newer version of the program. */
function readFailure(error: unknown, text: string) {
  if (error instanceof DOMException) return true;
  try {
    const version = JSON.parse(text)?.formatVersion;
    return typeof version === "number" && version > 2;
  } catch {
    return false;
  }
}

/** dynasty.json cannot be read; `versions` are the saved copies that can replace it. */
export class FolderDamagedError extends Error {
  name = "DamagedDynastyError";
  constructor(readonly versions: DynastyVersion[]) {
    super("DYNASTY_DAMAGED");
  }
}

/** Content stays in the selected folder; bookmarks contain only metadata. */
export class DynastyFolder {
  private queue: Promise<unknown> = Promise.resolve();
  private deleted = false;
  private initialFileCreated = false;
  private readonly photos: PhotoFiles;
  /** Our picture files known to be on disk: listed on open or written by this window. */
  private readonly photoNames = new Set<string>();
  private readonly versions: VersionFiles;
  /** Time of the newest version copy. */
  private lastVersionAt = 0;
  private marker?: OpenMarker;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private constructor(
    public readonly directory: DynastyDirectory,
    private revision: string,
    private readonly projectId: string,
    public parent?: DynastyDirectory,
  ) {
    this.photos = photoFilesOf(directory);
    this.versions = versionFilesOf(directory);
  }
  /** Marks the dynasty as open here; rejects with DYNASTY_OPEN_ELSEWHERE when another window has it. */
  private static async claim(directory: DynastyDirectory) {
    const marker = openMarkerOf(directory);
    await marker.claim();
    return marker;
  }
  private hold(marker: OpenMarker) {
    this.marker = marker;
    this.refreshTimer = setInterval(() => void marker.refresh().catch(() => {}), MARKER_REFRESH);
  }
  static async open(
    directory: DynastyDirectory,
    parent?: DynastyDirectory,
  ): Promise<{ folder: DynastyFolder; project: Project }> {
    const marker = await DynastyFolder.claim(directory);
    try {
      const opened = await DynastyFolder.read(directory, parent);
      opened.folder.hold(marker);
      return opened;
    } catch (error) {
      await marker.release().catch(() => {});
      throw error;
    }
  }
  private static async read(directory: DynastyDirectory, parent?: DynastyDirectory) {
    let text: string | undefined;
    const photos = photoFilesOf(directory);
    let project: Project;
    try {
      text = await readText(directory, DYNASTY_FILE);
      project = await readProjectDocument(text, (name) => photos.read(name));
    } catch (error) {
      // A missing file is offered for restoring only when copies exist.
      if (text === undefined ? !missing(error) : readFailure(error, text)) throw error;
      const versions = await listVersions(versionFilesOf(directory)).catch(() => []);
      if (text === undefined && !versions.length) throw error;
      throw new FolderDamagedError(versions);
    }
    const folder = new DynastyFolder(directory, await digest(text), project.id, parent);
    for (const name of await photos.list().catch(() => [])) folder.photoNames.add(name);
    const newest = newestFirst(await folder.versions.list().catch(() => []))[0];
    if (newest) folder.lastVersionAt = versionTime(newest);
    // Older versions kept every photo twice inside dynasty.json. Move them out once, after a backup.
    if (JSON.parse(text).formatVersion === 1 && hasPhotos(project)) {
      try {
        await copyDynastyFile(directory, text, folder.revision);
        await folder.save(project);
      } catch (error) {
        // The old file stays as it was; the next save tries again.
        console.warn("Photo migration failed", error);
      }
    }
    // The opened state is kept as a version, unless a recent copy exists.
    await folder.enqueue(async () => folder.keepVersion(await readText(directory, DYNASTY_FILE)));
    return { folder, project };
  }
  /**
   * Replaces an unreadable or missing dynasty.json with a saved copy and opens it.
   * The unreadable file is kept beside it as dynasty.damaged.json.
   */
  static async restoreDamaged(
    directory: DynastyDirectory,
    version: string,
    parent?: DynastyDirectory,
  ): Promise<{ folder: DynastyFolder; project: Project }> {
    const marker = await DynastyFolder.claim(directory);
    try {
      const photos = photoFilesOf(directory);
      const text = await versionFilesOf(directory).read(version);
      if (text === undefined) throw new DOMException("Missing version", "NotFoundError");
      const project = await readProjectDocument(text, (name) => photos.read(name));
      let current: string | undefined;
      try {
        current = await readText(directory, DYNASTY_FILE);
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const revision = current === undefined ? "" : await digest(current);
      if (current !== undefined) await copyDynastyFile(directory, current, revision, true);
      const folder = new DynastyFolder(directory, revision, project.id, parent);
      // The restored text already is a version; no second copy of it.
      folder.lastVersionAt = Date.now();
      await folder.save(project);
    } finally {
      await marker.release().catch(() => {});
    }
    return DynastyFolder.open(directory, parent);
  }
  static async create(directory: DynastyDirectory, project: Project): Promise<DynastyFolder> {
    // Only dynasty.json belongs to us. Other files may already exist here.
    const folder = new DynastyFolder(directory, "", project.id);
    const marker = await DynastyFolder.claim(directory);
    try {
      await folder.save(project);
      folder.hold(marker);
    } catch (error) {
      await marker.release().catch(() => {});
      // createWritable preserves old contents; a failed first save may leave an
      // empty newly-created file. Remove only that empty placeholder.
      try {
        const file = await (await directory.getFileHandle(DYNASTY_FILE)).getFile();
        if (folder.initialFileCreated && file.size === 0) await directory.removeEntry(DYNASTY_FILE);
      } catch {
        /* Original failure is the useful diagnostic. */
      }
      throw error;
    }
    return folder;
  }
  static async createInLocation(parent: DynastyDirectory, project: Project): Promise<DynastyFolder> {
    const base = dynastyFolderName(project.name);
    const create = async () => {
      const occupied = new Set<string>();
      for await (const entry of parent.values()) occupied.add(entry.name.toLocaleLowerCase("en-US"));
      let name = base;
      for (let number = 2; occupied.has(name.toLocaleLowerCase("en-US")); number++) name = `${base} (${number})`;
      const directory = await parent.getDirectoryHandle(name, { create: true });
      try {
        const folder = await DynastyFolder.create(directory, project);
        folder.parent = parent;
        return folder;
      } catch (error) {
        // Remove only an empty new folder; never recursively remove contents.
        try {
          let empty = true;
          for await (const _entry of directory.values()) {
            empty = false;
            break;
          }
          if (empty) await parent.removeEntry(name);
        } catch {
          /* Preserve the original write failure. */
        }
        throw error;
      }
    };
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request(`talebranch:create-folder:${base}`, create);
    return create();
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const job = this.queue.then(async (): Promise<T> => {
      // Share the write lock with other tabs of this app. Revision checks still
      // detect edits made by other applications outside the browser.
      if (typeof navigator !== "undefined" && navigator.locks)
        return await navigator.locks.request(`talebranch:dynasty:${this.projectId}`, operation);
      return await operation();
    });
    this.queue = job.catch(() => {});
    return job;
  }
  private async checkRevision() {
    if (this.deleted) throw new Error("FOLDER_DELETED");
    if (!this.revision) {
      try {
        await this.directory.getFileHandle(DYNASTY_FILE);
      } catch (error) {
        if ((error as Error).name === "NotFoundError") return;
        throw error;
      }
      throw new Error("FOLDER_CONFLICT");
    }
    const text = await (await this.directory.getFileHandle(DYNASTY_FILE)).getFile().then((file) => file.text());
    if ((await digest(text)) !== this.revision) throw new Error("FOLDER_CONFLICT");
  }
  save(project: Project): Promise<void> {
    return this.enqueue(() => this.write(project));
  }
  /** Saved copies, newest first. */
  listVersions(): Promise<DynastyVersion[]> {
    return listVersions(this.versions);
  }
  /** Replaces the dynasty with a saved copy; the current state is kept as a version first. */
  restoreVersion(name: string): Promise<Project> {
    return this.enqueue(async () => {
      const text = await this.versions.read(name);
      if (text === undefined) throw new DOMException("Missing version", "NotFoundError");
      const project = await readProjectDocument(text, (file) => this.photos.read(file));
      if (project.id !== this.projectId) throw new Error("FOLDER_PROJECT_MISMATCH");
      await this.checkRevision();
      await this.keepVersion(await readText(this.directory, DYNASTY_FILE), true);
      await this.write(project);
      return project;
    });
  }
  /** Stops marking the dynasty as open in this window. */
  async close() {
    clearInterval(this.refreshTimer);
    const marker = this.marker;
    this.marker = undefined;
    await marker?.release();
  }
  /** Keeps `text` as a version at most every VERSION_INTERVAL; a failure never stops saving. */
  private async keepVersion(text: string, force = false) {
    const now = Date.now();
    if (!force && now - this.lastVersionAt < VERSION_INTERVAL) return;
    try {
      await this.versions.write(versionName(new Date(now)), text);
      this.lastVersionAt = now;
      for (const old of newestFirst(await this.versions.list()).slice(KEEP_VERSIONS)) await this.versions.remove(old);
    } catch (error) {
      console.warn("Version copy failed", error);
    }
  }
  private async write(project: Project) {
    if (project.id !== this.projectId) throw new Error("FOLDER_PROJECT_MISMATCH");
    const { text, photos } = await serializeProject(project);
    await this.checkRevision();
    // Pictures first: dynasty.json never refers to a file that is not written yet.
    for (const [name, dataUrl] of photos) {
      if (this.photoNames.has(name)) continue;
      await this.photos.write(name, dataUrl);
      this.photoNames.add(name);
    }
    const file = await this.directory.getFileHandle(DYNASTY_FILE, { create: !this.revision });
    if (!this.revision) this.initialFileCreated = true;
    const writer = await file.createWritable();
    try {
      await writer.write(text);
      if (this.revision) await this.checkRevision();
      // close atomically replaces the old file; a failed write keeps it intact.
      await writer.close();
    } catch (error) {
      try {
        await writer.abort();
      } catch {
        /* Already closed. */
      }
      throw error;
    }
    this.revision = await digest(text);
    await this.keepVersion(text);
    await this.removeUnusedPhotos(new Set(photos.keys()));
  }
  /** Only our own files that dynasty.json no longer names; a failure leaves them for the next save. */
  private async removeUnusedPhotos(used: Set<string>) {
    const unused = [...this.photoNames].filter((name) => !used.has(name));
    if (!unused.length) return;
    let kept: Set<string>;
    try {
      kept = await versionPhotos(this.versions);
    } catch {
      return;
    }
    for (const name of unused) {
      if (kept.has(name)) continue;
      try {
        await this.photos.remove(name);
        this.photoNames.delete(name);
      } catch (error) {
        if (missing(error)) this.photoNames.delete(name);
      }
    }
  }
  delete(): Promise<void> {
    return this.enqueue(async () => {
      await this.checkRevision();
      if (this.directory.deleteDynasty) await this.directory.deleteDynasty(this.revision);
      else if (this.parent) {
        const target = await this.parent.getDirectoryHandle(this.directory.name);
        if (!(await target.isSameEntry(this.directory))) throw new Error("FOLDER_CONFLICT");
        await this.parent.removeEntry(this.directory.name, { recursive: true });
      } else if (this.directory.remove) await this.directory.remove({ recursive: true });
      else throw new Error("FOLDER_DELETE_UNSUPPORTED");
      this.deleted = true;
      // The marker went with the folder; only this window's own lock is left to release.
      await this.close().catch(() => {});
    });
  }
}

export interface RecentFolder {
  id: string;
  name: string;
  directory: DynastyDirectory;
  parent?: DynastyDirectory;
}
