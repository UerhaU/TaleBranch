import type { Project } from "../types";
import { readProjectDocument, serializeProject } from "./storage";
import { makeId } from "./id";
import { isTauri } from "@tauri-apps/api/core";
import { forgetDesktopFolder, pickDesktopDirectory, recentDesktopFolders, rememberDesktopFolder } from "./desktopStorage";

export const DYNASTY_FILE = "dynasty.json";
export const FOLDER_ACTIVE_KEY = "dynasty-chronicles:folder-active";
export interface DynastyDirectory {
  name: string;
  readonly displayPath?: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DynastyDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterableIterator<{ name: string }>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  isSameEntry(other: DynastyDirectory): Promise<boolean>;
}

/** A display name may contain characters that Windows cannot use in a folder. */
export function dynastyFolderName(name: string): string {
  let safe = Array.from(name.trim().replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")).slice(0, 100).join("").replace(/[.\s]+$/g, "");
  if (!safe) safe = "Dynasty";
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(safe)) safe = `_${safe}`;
  return safe;
}
type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: "readwrite"; id: string }) => Promise<DynastyDirectory> };
export const supportsDynastyFolders = () => isTauri() || typeof (window as PickerWindow).showDirectoryPicker === "function";
export function pickDynastyDirectory(): Promise<DynastyDirectory> {
  if (isTauri()) return pickDesktopDirectory();
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return Promise.reject(new Error("FOLDER_UNSUPPORTED"));
  // Invoke before any await: the browser requires a direct user gesture.
  return picker.call(window, { mode: "readwrite", id: "talebranch-dynasties" });
}
export async function grantDirectory(directory: DynastyDirectory): Promise<void> {
  if (await directory.queryPermission({ mode: "readwrite" }) !== "granted" &&
      await directory.requestPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("Folder access denied", "NotAllowedError");
}
async function digest(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Only this file is managed. No project content is copied into browser storage. */
export class DynastyFolder {
  private queue: Promise<unknown> = Promise.resolve();
  private deleted = false;
  private initialFileCreated = false;
  private constructor(public readonly directory: DynastyDirectory, private revision: string, private readonly projectId: string) {}
  static async open(directory: DynastyDirectory): Promise<{ folder: DynastyFolder; project: Project }> {
    const text = await (await directory.getFileHandle(DYNASTY_FILE)).getFile().then(file => file.text());
    const project = await readProjectDocument(text);
    return { folder: new DynastyFolder(directory, await digest(text), project.id), project };
  }
  static async create(directory: DynastyDirectory, project: Project): Promise<DynastyFolder> {
    // Only dynasty.json belongs to us. Other files may already exist here.
    const folder = new DynastyFolder(directory, "", project.id);
    try { await folder.save(project); }
    catch (error) {
      // createWritable preserves old contents; a failed first save may leave an
      // empty newly-created file. Remove only that empty placeholder.
      try {
        const file = await (await directory.getFileHandle(DYNASTY_FILE)).getFile();
        if (folder.initialFileCreated && file.size === 0) await directory.removeEntry(DYNASTY_FILE);
      } catch { /* Original failure is the useful diagnostic. */ }
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
      try { return await DynastyFolder.create(directory, project); }
      catch (error) {
        // Remove only an empty new folder; never recursively remove contents.
        try {
          let empty = true;
          for await (const _entry of directory.values()) { empty = false; break; }
          if (empty) await parent.removeEntry(name);
        } catch { /* Preserve the original write failure. */ }
        throw error;
      }
    };
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(`talebranch:create-folder:${base}`, create);
    return create();
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const job = this.queue.then(async (): Promise<T> => {
      // Share the write lock with other tabs of this app. Revision checks still
      // detect edits made by other applications outside the browser.
      if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(`talebranch:dynasty:${this.projectId}`, operation);
      return await operation();
    });
    this.queue = job.catch(() => {});
    return job;
  }
  private async checkRevision() {
    if (this.deleted) throw new Error("FOLDER_DELETED");
    if (!this.revision) {
      try { await this.directory.getFileHandle(DYNASTY_FILE); }
      catch (error) { if ((error as Error).name === "NotFoundError") return; throw error; }
      throw new Error("FOLDER_CONFLICT");
    }
    const text = await (await this.directory.getFileHandle(DYNASTY_FILE)).getFile().then(file => file.text());
    if (await digest(text) !== this.revision) throw new Error("FOLDER_CONFLICT");
  }
  save(project: Project): Promise<void> {
    return this.enqueue(async () => {
      if (project.id !== this.projectId) throw new Error("FOLDER_PROJECT_MISMATCH");
      const text = await serializeProject(project);
      await this.checkRevision();
      const file = await this.directory.getFileHandle(DYNASTY_FILE, { create: !this.revision });
      if (!this.revision) this.initialFileCreated = true;
      const writer = await file.createWritable();
      try {
        await writer.write(text);
        if (this.revision) await this.checkRevision();
        // close atomically replaces the old file; a failed write keeps it intact.
        await writer.close();
      } catch (error) { try { await writer.abort(); } catch { /* Already closed. */ } throw error; }
      this.revision = await digest(text);
    });
  }
  delete(): Promise<void> {
    return this.enqueue(async () => {
      await this.checkRevision();
      await this.directory.removeEntry(DYNASTY_FILE);
      this.deleted = true;
    });
  }
}

export interface RecentFolder { id: string; name: string; directory: DynastyDirectory }
// Only a directory handle and display metadata: no characters or photographs.
function bookmarks(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("talebranch-folder-handles", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("folders", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function recentDynastyFolders(): Promise<RecentFolder[]> {
  if (isTauri()) return recentDesktopFolders();
  const db = await bookmarks();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readonly");
    const request = tx.objectStore("folders").getAll();
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function rememberDynastyFolder(folder: DynastyFolder, project: Project): Promise<void> {
  if (isTauri()) return rememberDesktopFolder(folder.directory, project.name);
  const recent = await recentDynastyFolders();
  let id: string | undefined;
  for (const item of recent) {
    try { if (await item.directory.isSameEntry(folder.directory)) { id = item.id; break; } }
    catch { /* A stale bookmark must not prevent remembering a new folder. */ }
  }
  const db = await bookmarks();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    tx.objectStore("folders").put({ id: id ?? makeId("folder"), name: project.name, directory: folder.directory } satisfies RecentFolder);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function forgetDynastyFolder(directory: DynastyDirectory): Promise<void> {
  if (isTauri()) return forgetDesktopFolder(directory);
  const recent = await recentDynastyFolders();
  const ids: string[] = [];
  for (const item of recent) {
    try { if (await item.directory.isSameEntry(directory)) ids.push(item.id); }
    catch { /* An unrelated inaccessible folder is left alone. */ }
  }
  const db = await bookmarks();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    for (const id of ids) tx.objectStore("folders").delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
