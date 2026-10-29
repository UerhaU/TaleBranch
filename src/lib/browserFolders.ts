import type { DynastyDirectory, RecentFolder } from "./folderStorage";
import type { FolderBackend } from "./dynastyStore";
import { makeId } from "./id";

const LAST_BOOKMARK_KEY = "dynasty-chronicles:last-folder-bookmark";
// Set by earlier versions next to the bookmark; the bookmark alone now marks the last dynasty.
const OLD_FOLDER_ACTIVE_KEY = "dynasty-chronicles:folder-active";

/** Saved folder permissions with display names: no characters or photographs. */
export interface FolderBookmarks {
  all(): Promise<RecentFolder[]>;
  put(item: RecentFolder): Promise<void>;
  delete(ids: string[]): Promise<void>;
}

function openBookmarks(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("talebranch-folder-handles", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("folders", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (folders: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openBookmarks();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", mode);
    const request = run(tx.objectStore("folders"));
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
/** Directory handles can only be kept in IndexedDB. */
export const indexedDbBookmarks: FolderBookmarks = {
  all: async () => (await transaction<RecentFolder[]>("readonly", (folders) => folders.getAll())) ?? [],
  put: async (item) => {
    await transaction("readwrite", (folders) => {
      folders.put(item);
    });
  },
  delete: async (ids) => {
    await transaction("readwrite", (folders) => ids.forEach((id) => folders.delete(id)));
  },
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: "readwrite"; id: string }) => Promise<DynastyDirectory>;
};
const picker = () => (window as PickerWindow).showDirectoryPicker;

async function findBookmark(bookmarks: FolderBookmarks, directory: DynastyDirectory) {
  const ids: string[] = [];
  for (const item of await bookmarks.all()) {
    try {
      if (await item.directory.isSameEntry(directory)) ids.push(item.id);
    } catch {
      /* An inaccessible unrelated folder is left alone. */
    }
  }
  return ids;
}
function setLast(id?: string) {
  try {
    if (id) localStorage.setItem(LAST_BOOKMARK_KEY, id);
    else {
      localStorage.removeItem(LAST_BOOKMARK_KEY);
      localStorage.removeItem(OLD_FOLDER_ACTIVE_KEY);
    }
  } catch {
    /* Optional browser metadata. */
  }
}

/** Dynasty folders through the File System Access API of Chrome and Edge. */
export function browserBackend(bookmarks: FolderBookmarks = indexedDbBookmarks): FolderBackend {
  return {
    kind: "browser",
    get supported() {
      return typeof picker() === "function";
    },
    pick() {
      const show = picker();
      if (!show) return Promise.reject(new Error("FOLDER_UNSUPPORTED"));
      // Invoke before any await: the browser requires a direct user gesture.
      return show.call(window, { mode: "readwrite", id: "talebranch-dynasties" });
    },
    recent: () => bookmarks.all(),
    async last() {
      const id = localStorage.getItem(LAST_BOOKMARK_KEY);
      if (!id) return;
      return (await bookmarks.all()).find((item) => item.id === id);
    },
    async remember(folder, name) {
      // Never resume a previous bookmark if saving the new one fails.
      setLast();
      const id = (await findBookmark(bookmarks, folder.directory))[0] ?? makeId("folder");
      await bookmarks.put({ id, name, directory: folder.directory, parent: folder.parent });
      setLast(id);
    },
    async clearLast() {
      setLast();
    },
    async forget(directory) {
      await bookmarks.delete(await findBookmark(bookmarks, directory));
    },
    async forgetRecent(folder) {
      await bookmarks.delete([folder.id]);
      try {
        if (localStorage.getItem(LAST_BOOKMARK_KEY) === folder.id) setLast();
      } catch {
        /* Optional browser metadata. */
      }
    },
    async saveFile(name, contents, png) {
      const url = png
        ? `data:image/png;base64,${contents}`
        : URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      // Attach the link so browsers that ignore detached download links can save it.
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        if (!png) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return true;
    },
    // Closing a tab is guarded by beforeunload in useProject.
    guardClose: () => () => {},
  };
}
