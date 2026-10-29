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

export const DYNASTY_FILE = "dynasty.json";
/** A copy of dynasty.json from before photos became separate files. */
export const PHOTO_BACKUP_FILE = "dynasty.backup-before-photos.json";
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
  backupDynasty?(expected: string): Promise<string>;
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

/** Keeps the old dynasty.json before its photos are moved out. An existing copy is never replaced. */
async function backupBeforePhotos(directory: DynastyDirectory, text: string, revision: string) {
  if (directory.backupDynasty) return directory.backupDynasty(revision);
  for (let number = 1; ; number++) {
    const name = number === 1 ? PHOTO_BACKUP_FILE : PHOTO_BACKUP_FILE.replace(".json", ` (${number}).json`);
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

/** Content stays in the selected folder; bookmarks contain only metadata. */
export class DynastyFolder {
  private queue: Promise<unknown> = Promise.resolve();
  private deleted = false;
  private initialFileCreated = false;
  private readonly photos: PhotoFiles;
  /** Our picture files known to be on disk: listed on open or written by this window. */
  private readonly photoNames = new Set<string>();
  private constructor(
    public readonly directory: DynastyDirectory,
    private revision: string,
    private readonly projectId: string,
    public parent?: DynastyDirectory,
  ) {
    this.photos = photoFilesOf(directory);
  }
  static async open(
    directory: DynastyDirectory,
    parent?: DynastyDirectory,
  ): Promise<{ folder: DynastyFolder; project: Project }> {
    const text = await readText(directory, DYNASTY_FILE);
    const photos = photoFilesOf(directory);
    const project = await readProjectDocument(text, (name) => photos.read(name));
    const folder = new DynastyFolder(directory, await digest(text), project.id, parent);
    for (const name of await photos.list().catch(() => [])) folder.photoNames.add(name);
    // Older versions kept every photo twice inside dynasty.json. Move them out once, after a backup.
    if (JSON.parse(text).formatVersion === 1 && hasPhotos(project)) {
      try {
        await backupBeforePhotos(directory, text, folder.revision);
        await folder.save(project);
      } catch (error) {
        // The old file stays as it was; the next save tries again.
        console.warn("Photo migration failed", error);
      }
    }
    return { folder, project };
  }
  static async create(directory: DynastyDirectory, project: Project): Promise<DynastyFolder> {
    // Only dynasty.json belongs to us. Other files may already exist here.
    const folder = new DynastyFolder(directory, "", project.id);
    try {
      await folder.save(project);
    } catch (error) {
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
    return this.enqueue(async () => {
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
      await this.removeUnusedPhotos(new Set(photos.keys()));
    });
  }
  /** Only our own files that dynasty.json no longer names; a failure leaves them for the next save. */
  private async removeUnusedPhotos(used: Set<string>) {
    for (const name of [...this.photoNames]) {
      if (used.has(name)) continue;
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
    });
  }
}

export interface RecentFolder {
  id: string;
  name: string;
  directory: DynastyDirectory;
  parent?: DynastyDirectory;
}
