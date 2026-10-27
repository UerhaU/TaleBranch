import type { DynastyDirectory } from "./folderStorage";

/** Isolated disk double: pending writes become visible only on close. */
export class MemoryDirectory implements DynastyDirectory {
  name = "Династия на диске D";
  files = new Map<string, string>();
  directories = new Map<string, MemoryDirectory>();
  failWrite = false;
  failClose = false;
  failDelete = false;
  deleted = false;
  holdWrite: (() => Promise<void>) | undefined;
  permission: PermissionState = "granted";
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
  async isSameEntry(other: DynastyDirectory): Promise<boolean> {
    return this === other;
  }
  async *values() {
    for (const name of this.files.keys()) yield { name };
    for (const name of this.directories.keys()) yield { name };
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    if (this.files.has(name)) throw new DOMException("A file exists", "TypeMismatchError");
    let directory = this.directories.get(name);
    if (!directory) {
      if (!options?.create) throw new DOMException("Missing folder", "NotFoundError");
      directory = new MemoryDirectory();
      directory.name = name;
      directory.failWrite = this.failWrite;
      directory.failClose = this.failClose;
      this.directories.set(name, directory);
    }
    return directory;
  }
  async remove(options?: { recursive?: boolean }) {
    if (this.failDelete) throw new DOMException("Read only", "NotAllowedError");
    if (!options?.recursive && (this.files.size || this.directories.size))
      throw new DOMException("Not empty", "InvalidModificationError");
    this.files.clear();
    this.directories.clear();
    this.deleted = true;
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    if (this.failDelete) throw new DOMException("Read only", "NotAllowedError");
    const directory = this.directories.get(name);
    if (directory) {
      await directory.remove(options);
      this.directories.delete(name);
      return;
    }
    if (!this.files.delete(name)) throw new DOMException("Missing file", "NotFoundError");
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    if (this.deleted) throw new DOMException("Missing folder", "NotFoundError");
    if (this.directories.has(name)) throw new DOMException("A folder exists", "TypeMismatchError");
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException("Missing file", "NotFoundError");
      this.files.set(name, "");
    }
    return {
      kind: "file",
      name,
      getFile: async () => {
        if (!this.files.has(name)) throw new DOMException("Missing file", "NotFoundError");
        const text = this.files.get(name)!;
        return { text: async () => text, size: text.length };
      },
      createWritable: async () => {
        let pending = "";
        return {
          write: async (text: string) => {
            await this.holdWrite?.();
            if (this.failWrite) throw new DOMException("Disk full", "QuotaExceededError");
            pending = text;
          },
          close: async () => {
            if (this.failClose) throw new DOMException("Permission lost", "NotAllowedError");
            this.files.set(name, pending);
          },
          abort: async () => {},
        };
      },
    } as unknown as FileSystemFileHandle;
  }
}
