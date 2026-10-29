import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DynastyDirectory, RecentFolder } from "./folderStorage";
import type { FolderBackend } from "./dynastyStore";
import { photoType, type PhotoFiles } from "./photoFiles";
import type { OpenMarker, VersionFiles } from "./dynastyProtection";

interface DirectoryInfo {
  path: string;
  name: string;
}
interface FileContents {
  text: string;
  revision: string;
}
async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
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
  constructor(info: DirectoryInfo) {
    this.displayPath = info.path;
    this.name = info.name;
  }
  private io<T>(op: string, args: Record<string, unknown> = {}) {
    return native<T>("desktop_io", { request: { op, directory: this.displayPath, ...args } });
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DesktopDirectory> {
    return new DesktopDirectory(await this.io<DirectoryInfo>("child", { name, create: options?.create ?? false }));
  }
  async *values() {
    yield* await this.io<Array<{ name: string }>>("list");
  }
  async removeEntry(name: string) {
    await this.io("remove", { name });
  }
  async deleteDynasty(expected: string) {
    await this.io("deleteDynasty", { expected });
  }
  /** Rust accepts only our own file names inside "<dynasty>/photos". */
  photoFiles(): PhotoFiles {
    return {
      list: () => this.io<string[]>("photoList"),
      read: async (name) => {
        const data = await this.io<string | null>("photoRead", { name });
        return data === null ? undefined : `data:${photoType(name)};base64,${data}`;
      },
      write: async (name, dataUrl) => {
        await this.io("photoWrite", { name, base64: dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, "") });
      },
      remove: async (name) => {
        await this.io("photoRemove", { name });
      },
    };
  }
  backupDynasty(expected: string, damaged = false) {
    return this.io<string>("backup", { expected, damaged });
  }
  /** Rust accepts only version names inside "<dynasty>/backups" and only valid documents. */
  versionFiles(): VersionFiles {
    return {
      list: () => this.io<string[]>("versionList"),
      read: async (name) => (await this.io<string | null>("versionRead", { name })) ?? undefined,
      write: async (name, text) => {
        await this.io("versionWrite", { name, contents: text });
      },
      remove: async (name) => {
        await this.io("versionRemove", { name });
      },
    };
  }
  /** The marker belongs to this process; Rust also removes it when the program exits. */
  openMarker(): OpenMarker {
    const claim = async () => {
      await this.io("openClaim");
    };
    return {
      claim,
      refresh: claim,
      release: async () => {
        await this.io("openRelease");
      },
    };
  }
  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }
  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }
  async isSameEntry(other: DynastyDirectory) {
    return other instanceof DesktopDirectory && this.displayPath === other.displayPath;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    if (name !== "dynasty.json") throw new Error("UNMANAGED_FILE");
    await this.io("file", { create: options?.create ?? false });
    return {
      kind: "file",
      name,
      getFile: async () => {
        const contents = await this.io<FileContents>("read");
        return { text: async () => contents.text, size: contents.text.length } as unknown as File;
      },
      createWritable: async () => {
        const previous = await this.io<FileContents>("read");
        let contents = "";
        let aborted = false;
        return {
          write: async (text: string) => {
            contents = text;
          },
          close: async () => {
            if (aborted) throw new DOMException("Write aborted", "AbortError");
            await this.io("write", { text: contents, expected: previous.revision });
          },
          abort: async () => {
            aborted = true;
            contents = "";
          },
        };
      },
    } as unknown as FileSystemFileHandle;
  }
}

type NativeRecent = { id: string; name: string; directory: DirectoryInfo };
const recentFolder = (item: NativeRecent): RecentFolder => ({
  ...item,
  directory: new DesktopDirectory(item.directory),
});
function nativePath(directory: DynastyDirectory) {
  if (!(directory instanceof DesktopDirectory)) throw new Error("INVALID_DESKTOP_DIRECTORY");
  return directory.displayPath;
}

/** Dynasty folders through the Rust commands; settings stay in TaleBranch-data beside the .exe. */
export const desktopBackend: FolderBackend = {
  kind: "desktop",
  supported: true,
  async pick() {
    const info = await native<DirectoryInfo | null>("desktop_pick_directory");
    if (!info) throw new DOMException("Cancelled", "AbortError");
    return new DesktopDirectory(info);
  },
  recent: async () => (await native<NativeRecent[]>("desktop_recent_folders")).map(recentFolder),
  async last() {
    const entry = await native<NativeRecent | null>("desktop_last_folder");
    return entry ? recentFolder(entry) : undefined;
  },
  async remember(folder, name) {
    await native("desktop_remember_folder", { directory: nativePath(folder.directory), name });
  },
  async clearLast() {
    await native("desktop_clear_last_folder");
  },
  async forget(directory) {
    await native("desktop_forget_folder", { directory: nativePath(directory) });
  },
  saveFile: (name, contents, png) => native("desktop_save_export", { name, contents, png }),
  // WebView destruction need not dispatch beforeunload. Intercept the native close too.
  guardClose(flush, onGuardFailure) {
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (closing) return;
        const result = flush();
        if (result instanceof Promise) {
          event.preventDefault();
          void result.then((ok) => {
            if (!ok) return;
            closing = true;
            void getCurrentWindow()
              .close()
              .catch(() => {
                closing = false;
                onGuardFailure();
              });
          });
        } else if (!result) event.preventDefault();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        if (!disposed) onGuardFailure();
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
};
