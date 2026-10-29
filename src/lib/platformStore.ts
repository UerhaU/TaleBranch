import { isTauri } from "@tauri-apps/api/core";
import { browserBackend } from "./browserFolders";
import { desktopBackend } from "./desktopStorage";
import { createFolderStore, type DynastyStore } from "./dynastyStore";

let platform: DynastyStore | undefined;
/** The variant for this run: native files in the desktop version, File System Access in a browser. */
export function platformStore(): DynastyStore {
  platform ??= createFolderStore(isTauri() ? desktopBackend : browserBackend());
  return platform;
}
