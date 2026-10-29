import type { DynastyDirectory } from "./folderStorage";
import { makeId } from "./id";

/** Recent copies of dynasty.json: `<dynasty>/backups/dynasty-YYYYMMDD-HHMMSS-mmm.json`. Photos are not copied. */
export const VERSION_FOLDER = "backups";
export const KEEP_VERSIONS = 10;
/** A new copy at most this often while editing, so typing never floods the folder. */
export const VERSION_INTERVAL = 10 * 60_000;
/** Marks a dynasty as open in a window; refreshed while it stays open. */
export const OPEN_MARKER = ".talebranch-open.json";
export const MARKER_REFRESH = 30_000;
/** A marker this old was left by a crash. Hidden browser tabs may refresh only once a minute. */
export const MARKER_STALE = 3 * 60_000;

const VERSION_PATTERN = /^dynasty-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})\.json$/;
export const isVersionName = (name: string) => VERSION_PATTERN.test(name);
export function versionName(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `dynasty-${day}-${time}-${pad(date.getUTCMilliseconds(), 3)}.json`;
}
/** When the copy was made, from its name. */
export function versionTime(name: string): number {
  const [, year, month, day, hours, minutes, seconds, ms] = VERSION_PATTERN.exec(name)!.map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes, seconds, ms);
}
/** Newest first; names sort by time. */
export const newestFirst = (names: string[]) => names.filter(isVersionName).sort().reverse();

/** A saved copy offered for restoring. */
export interface DynastyVersion {
  readonly name: string;
  /** ISO time of the copy. */
  readonly savedAt: string;
  readonly characters: number;
}
/** A quick look without photos; restoring reads the copy fully. */
export function describeVersion(name: string, text: string): DynastyVersion | undefined {
  try {
    const raw = JSON.parse(text);
    const characters = raw?.project?.characters;
    if (raw?.app !== "dynasty-chronicles" || ![1, 2].includes(raw.formatVersion) || !Array.isArray(characters)) return;
    return { name, savedAt: new Date(versionTime(name)).toISOString(), characters: characters.length };
  } catch {
    return;
  }
}

/** Version files in the backups folder; the desktop version checks every name natively. */
export interface VersionFiles {
  list(): Promise<string[]>;
  read(name: string): Promise<string | undefined>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}
const missing = (error: unknown) => (error as Error)?.name === "NotFoundError";

export function handleVersionFiles(directory: DynastyDirectory): VersionFiles {
  const folder = (create = false) => directory.getDirectoryHandle(VERSION_FOLDER, { create });
  return {
    async list() {
      let versions: DynastyDirectory;
      try {
        versions = await folder();
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const names: string[] = [];
      for await (const entry of versions.values()) if (isVersionName(entry.name)) names.push(entry.name);
      return names;
    },
    async read(name) {
      try {
        return await (await (await folder()).getFileHandle(name)).getFile().then((file) => file.text());
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
    },
    async write(name, text) {
      const writer = await (await (await folder(true)).getFileHandle(name, { create: true })).createWritable();
      try {
        await writer.write(text);
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

/** One copy of the program owning an open dynasty. Rejects with DYNASTY_OPEN_ELSEWHERE. */
export interface OpenMarker {
  claim(): Promise<void>;
  /** Keeps the marker fresh; never takes it from a live owner. */
  refresh(): Promise<void>;
  release(): Promise<void>;
}
interface MarkerContents {
  app: "talebranch";
  /** The browser profile or the desktop process. */
  owner: string;
  /** One opening in one tab. */
  session: string;
  updatedAt: number;
}

const OWNER_KEY = "talebranch:window-owner";
let profileOwner: string | undefined;
/** Shared by the tabs of one browser profile; tabs are told apart by their web locks. */
function browserOwner() {
  if (profileOwner) return profileOwner;
  try {
    profileOwner = localStorage.getItem(OWNER_KEY) ?? undefined;
    if (!profileOwner) localStorage.setItem(OWNER_KEY, (profileOwner = makeId("browser")));
  } catch {
    profileOwner = makeId("browser");
  }
  return profileOwner;
}
/** Sessions held by this tab: reopening its own dynasty is allowed. */
const heldSessions = new Set<string>();
/** Web locks that can also be listed; without them markers rely on their time only. */
function locks() {
  const web = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return typeof web?.query === "function" ? web : undefined;
}
const sessionLock = (session: string) => `talebranch:open:${session}`;

/** The marker through directory handles, for browser folders and the test disk. */
export function handleOpenMarker(
  directory: DynastyDirectory,
  owner = browserOwner(),
  now: () => number = Date.now,
): OpenMarker {
  const session = makeId("open");
  let unlock: (() => void) | undefined;
  const read = async (): Promise<MarkerContents | undefined> => {
    let text: string;
    try {
      text = await (await directory.getFileHandle(OPEN_MARKER)).getFile().then((file) => file.text());
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
    try {
      const marker = JSON.parse(text);
      return marker?.app === "talebranch" && typeof marker.updatedAt === "number" ? marker : undefined;
    } catch {
      return undefined;
    }
  };
  const write = async () => {
    const contents: MarkerContents = { app: "talebranch", owner, session, updatedAt: now() };
    const writer = await (await directory.getFileHandle(OPEN_MARKER, { create: true })).createWritable();
    try {
      await writer.write(JSON.stringify(contents));
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
  };
  const alive = async (marker: MarkerContents) => {
    if (marker.session === session) return false;
    // Another tab of this browser: its web lock disappears when the tab is closed or reloaded.
    const web = locks();
    if (marker.owner === owner && web)
      return ((await web.query()).held ?? []).some((lock) => lock.name === sessionLock(marker.session));
    return now() - marker.updatedAt < MARKER_STALE;
  };
  const claim = async () => {
    const marker = await read();
    // This tab reopening its own dynasty takes the marker over.
    if (marker && !heldSessions.has(marker.session) && (await alive(marker))) throw new Error("DYNASTY_OPEN_ELSEWHERE");
    const web = locks();
    if (web && !unlock)
      await new Promise<void>((granted) => {
        void web.request(sessionLock(session), () => {
          granted();
          return new Promise<void>((release) => (unlock = release));
        });
      });
    heldSessions.add(session);
    try {
      await write();
    } catch (error) {
      // A read-only folder cannot be changed by another window either: open it without a marker.
      console.warn("Open marker not written", error);
      await removeEmpty();
      return;
    }
    // Two windows that claimed at the same moment: only the last writer keeps it.
    if ((await read())?.session !== session) {
      await release();
      throw new Error("DYNASTY_OPEN_ELSEWHERE");
    }
  };
  /** A failed first write may leave an empty file behind. */
  const removeEmpty = async () => {
    try {
      const file = await (await directory.getFileHandle(OPEN_MARKER)).getFile();
      if (file.size === 0) await directory.removeEntry(OPEN_MARKER);
    } catch {
      /* Nothing to clean up. */
    }
  };
  const release = async () => {
    heldSessions.delete(session);
    unlock?.();
    unlock = undefined;
    try {
      if ((await read())?.session === session) await directory.removeEntry(OPEN_MARKER);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  };
  return {
    async claim() {
      const web = locks();
      // Tabs of this browser claim one at a time.
      if (web) await web.request("talebranch:claim-dynasty", claim);
      else await claim();
    },
    async refresh() {
      const marker = await read();
      if (!marker || marker.session === session || (!heldSessions.has(marker.session) && !(await alive(marker))))
        await write();
    },
    release,
  };
}
