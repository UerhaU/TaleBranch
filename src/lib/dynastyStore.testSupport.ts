import type { RecentFolder } from "./folderStorage";
import { browserBackend, type FolderBookmarks } from "./browserFolders";
import { createFolderStore } from "./dynastyStore";
import LZString from "lz-string";
import { createHash } from "node:crypto";
import type { Project } from "../types";

/** IndexedDB stand-in: jsdom has none. */
export function memoryBookmarks(): FolderBookmarks & { items: Map<string, RecentFolder> } {
  const items = new Map<string, RecentFolder>();
  return {
    items,
    all: async () => [...items.values()],
    put: async (item) => {
      items.set(item.id, item);
    },
    delete: async (ids) => ids.forEach((id) => items.delete(id)),
  };
}
export const browserTestStore = (bookmarks = memoryBookmarks()) => createFolderStore(browserBackend(bookmarks));

/** A record as earlier web versions saved it in localStorage. */
export function storeLegacyProject(project: Project, compressed = true) {
  const json = JSON.stringify(project);
  localStorage.setItem(
    `dynasty-chronicles:project:${project.id}`,
    compressed ? `dynasty-lz16-v1:${LZString.compressToUTF16(json)}` : json,
  );
}

type Recent = { id: string; name: string; directory: { path: string; name: string } };
const fail = (name: string, message = name) => Promise.reject({ name, message });

/** The Rust commands of desktop_storage.rs over an in-memory disk. */
export class FakeNative {
  directories = new Set<string>(["D:"]);
  files = new Map<string, string>();
  /** "<dynasty>\\photos\\<name>" → base64, as Rust reads and writes them. */
  photos = new Map<string, string>();
  /** "<dynasty>\\backups\\<name>" → text. */
  versions = new Map<string, string>();
  /** Dynasty path → the process that marked it as open. */
  markers = new Map<string, string>();
  /** This process in open markers; another FakeNative over the same disk is another copy of the program. */
  owner = "this-process";
  recent: Recent[] = [];
  last: Recent | null = null;
  exports: Array<{ name: string; contents: string; png: boolean }> = [];
  nextPick: string | null = null;
  failWrite = false;

  info(path: string) {
    return { path, name: path.slice(path.lastIndexOf("\\") + 1) };
  }
  mkdir(path: string) {
    this.directories.add(path);
    return this;
  }
  private children(directory: string) {
    const prefix = `${directory}\\`;
    return [...this.directories, ...this.files.keys()].filter(
      (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("\\"),
    );
  }
  private io(request: Record<string, string> & { create?: boolean }) {
    const { op, directory } = request;
    if (!this.directories.has(directory)) return fail("NotFoundError", "Missing folder");
    const file = `${directory}\\dynasty.json`;
    // Same as hash() in desktop_storage.rs and digest() in folderStorage.ts.
    const revision = () =>
      createHash("sha256")
        .update(this.files.get(file) ?? "")
        .digest("hex");
    switch (op) {
      case "child": {
        const path = `${directory}\\${request.name}`;
        if (this.files.has(path)) return fail("TypeMismatchError");
        if (!this.directories.has(path)) {
          if (!request.create) return fail("NotFoundError");
          this.directories.add(path);
        }
        return Promise.resolve(this.info(path));
      }
      case "list":
        return Promise.resolve(this.children(directory).map((path) => ({ name: this.info(path).name })));
      case "file":
        if (!this.files.has(file)) {
          if (!request.create) return fail("NotFoundError");
          this.files.set(file, "");
        }
        return Promise.resolve(null);
      case "read":
        if (!this.files.has(file)) return fail("NotFoundError");
        return Promise.resolve({ text: this.files.get(file), revision: revision() });
      case "write":
        if (this.failWrite) return fail("QuotaExceededError", "Disk full");
        if (revision() !== request.expected) return fail("Error", "FOLDER_CONFLICT");
        this.files.set(file, request.text);
        return Promise.resolve(null);
      case "remove": {
        const path = `${directory}\\${request.name}`;
        if (this.children(path).length) return fail("InvalidModificationError");
        this.directories.delete(path);
        this.files.delete(path);
        return Promise.resolve(null);
      }
      case "photoList": {
        const prefix = `${directory}\\photos\\`;
        const names = [...this.photos.keys()].filter((path) => path.startsWith(prefix));
        return Promise.resolve(names.map((path) => path.slice(prefix.length)));
      }
      case "photoRead":
        return Promise.resolve(this.photos.get(`${directory}\\photos\\${request.name}`) ?? null);
      case "photoWrite":
        if (this.failWrite) return fail("QuotaExceededError", "Disk full");
        this.directories.add(`${directory}\\photos`);
        this.photos.set(`${directory}\\photos\\${request.name}`, request.base64);
        return Promise.resolve(null);
      case "photoRemove":
        this.photos.delete(`${directory}\\photos\\${request.name}`);
        return Promise.resolve(null);
      case "backup": {
        if (revision() !== request.expected) return fail("Error", "FOLDER_CONFLICT");
        const name = (request as { damaged?: boolean }).damaged
          ? "dynasty.damaged.json"
          : "dynasty.backup-before-photos.json";
        this.files.set(`${directory}\\${name}`, this.files.get(file)!);
        return Promise.resolve(name);
      }
      case "versionList": {
        const prefix = `${directory}\\backups\\`;
        const names = [...this.versions.keys()].filter((path) => path.startsWith(prefix));
        return Promise.resolve(names.map((path) => path.slice(prefix.length)));
      }
      case "versionRead":
        return Promise.resolve(this.versions.get(`${directory}\\backups\\${request.name}`) ?? null);
      case "versionWrite":
        if (this.failWrite) return fail("QuotaExceededError", "Disk full");
        this.directories.add(`${directory}\\backups`);
        this.versions.set(`${directory}\\backups\\${request.name}`, request.contents);
        return Promise.resolve(null);
      case "versionRemove":
        this.versions.delete(`${directory}\\backups\\${request.name}`);
        return Promise.resolve(null);
      case "openClaim": {
        const owner = this.markers.get(directory);
        if (owner && owner !== this.owner) return fail("Error", "DYNASTY_OPEN_ELSEWHERE");
        this.markers.set(directory, this.owner);
        return Promise.resolve(null);
      }
      case "openRelease":
        if (this.markers.get(directory) === this.owner) this.markers.delete(directory);
        return Promise.resolve(null);
      case "deleteDynasty": {
        if (revision() !== request.expected) return fail("Error", "FOLDER_CONFLICT");
        const inside = (path: string) => path === directory || path.startsWith(`${directory}\\`);
        for (const path of [...this.directories]) if (inside(path)) this.directories.delete(path);
        for (const path of [...this.files.keys()]) if (inside(path)) this.files.delete(path);
        for (const path of [...this.photos.keys()]) if (inside(path)) this.photos.delete(path);
        for (const path of [...this.versions.keys()]) if (inside(path)) this.versions.delete(path);
        this.markers.delete(directory);
        return Promise.resolve(null);
      }
    }
    return fail("Error", `Unknown op ${op}`);
  }
  invoke = (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    switch (command) {
      case "desktop_pick_directory":
        return Promise.resolve(this.nextPick ? this.info(this.nextPick) : null);
      case "desktop_io":
        return this.io(args.request as Record<string, string>);
      case "desktop_recent_folders":
        return Promise.resolve(structuredClone(this.recent));
      case "desktop_last_folder":
        return Promise.resolve(structuredClone(this.last));
      case "desktop_clear_last_folder":
        this.last = null;
        return Promise.resolve(null);
      case "desktop_remember_folder": {
        const path = args.directory as string;
        const entry = { id: `id:${path}`, name: args.name as string, directory: this.info(path) };
        this.recent = [entry, ...this.recent.filter((item) => item.directory.path !== path)];
        this.last = entry;
        return Promise.resolve(null);
      }
      case "desktop_forget_folder": {
        const path = args.directory as string;
        this.recent = this.recent.filter((item) => item.directory.path !== path);
        if (this.last?.directory.path === path) this.last = null;
        return Promise.resolve(null);
      }
      case "desktop_save_export":
        this.exports.push(args as { name: string; contents: string; png: boolean });
        return Promise.resolve(true);
    }
    return fail("Error", `Unknown command ${command}`);
  };
}
