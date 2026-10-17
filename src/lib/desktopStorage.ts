import { invoke } from "@tauri-apps/api/core";
import type { DynastyDirectory, RecentFolder } from "./folderStorage";

interface DirectoryInfo { path: string; name: string }
interface FileContents { text: string; revision: string }
async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try { return await invoke<T>(command, args); }
  catch (error) {
    if (error && typeof error === "object" && "message" in error) {
      const details = error as { name?: string; message: string };
      throw new DOMException(details.message, details.name ?? "Error");
    }
    throw new Error(String(error));
  }
}

/** The same folder workflow backed by native file calls, with no HTTP server. */
export class DesktopDirectory implements DynastyDirectory {
  readonly displayPath: string;
  readonly name: string;
  constructor(info: DirectoryInfo) { this.displayPath = info.path; this.name = info.name; }
  private io<T>(op: string, args: Record<string, unknown> = {}) {
    return native<T>("desktop_io", { request: { op, directory: this.displayPath, ...args } });
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DesktopDirectory> {
    return new DesktopDirectory(await this.io<DirectoryInfo>("child", { name, create: options?.create ?? false }));
  }
  async *values() {
    yield* await this.io<Array<{ name: string }>>("list");
  }
  async removeEntry(name: string) { await this.io("remove", { name }); }
  async queryPermission(): Promise<PermissionState> { return "granted"; }
  async requestPermission(): Promise<PermissionState> { return "granted"; }
  async isSameEntry(other: DynastyDirectory) { return other instanceof DesktopDirectory && this.displayPath === other.displayPath; }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    if (name !== "dynasty.json") throw new Error("UNMANAGED_FILE");
    await this.io("file", { create: options?.create ?? false });
    return {
      kind: "file", name,
      getFile: async () => {
        const contents = await this.io<FileContents>("read");
        return new File([contents.text], name, { type: "application/json" });
      },
      createWritable: async () => {
        const previous = await this.io<FileContents>("read");
        let contents = ""; let aborted = false;
        return {
          write: async (text: string) => { contents = text; },
          close: async () => {
            if (aborted) throw new DOMException("Write aborted", "AbortError");
            await this.io("write", { text: contents, expected: previous.revision });
          },
          abort: async () => { aborted = true; contents = ""; },
        };
      },
    } as unknown as FileSystemFileHandle;
  }
}

export async function pickDesktopDirectory(): Promise<DesktopDirectory> {
  const info = await native<DirectoryInfo | null>("desktop_pick_directory");
  if (!info) throw new DOMException("Cancelled", "AbortError");
  return new DesktopDirectory(info);
}
export async function recentDesktopFolders(): Promise<RecentFolder[]> {
  const recent = await native<Array<{ id: string; name: string; directory: DirectoryInfo }>>("desktop_recent_folders");
  return recent.map(item => ({ ...item, directory: new DesktopDirectory(item.directory) }));
}
export async function rememberDesktopFolder(directory: DynastyDirectory, name: string): Promise<void> {
  if (!(directory instanceof DesktopDirectory)) throw new Error("INVALID_DESKTOP_DIRECTORY");
  await native("desktop_remember_folder", { directory: directory.displayPath, name });
}
export async function forgetDesktopFolder(directory: DynastyDirectory): Promise<void> {
  if (!(directory instanceof DesktopDirectory)) throw new Error("INVALID_DESKTOP_DIRECTORY");
  await native("desktop_forget_folder", { directory: directory.displayPath });
}
export async function saveDesktopExport(name: string, contents: string, png = false): Promise<boolean> {
  return native("desktop_save_export", { name, contents, png });
}
