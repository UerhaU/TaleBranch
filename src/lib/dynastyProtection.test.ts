import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleOpenMarker,
  isVersionName,
  MARKER_STALE,
  newestFirst,
  OPEN_MARKER,
  VERSION_INTERVAL,
  versionName,
  versionTime,
} from "./dynastyProtection";
import { DYNASTY_FILE, DynastyFolder, FolderDamagedError } from "./folderStorage";
import { MemoryDirectory } from "./folderStorage.testSupport";
import { createDemoProject } from "./project";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("saved versions", () => {
  it("names versions by time so that they sort and round-trip", () => {
    const time = Date.UTC(2026, 9, 29, 7, 5, 3, 9);
    const name = versionName(new Date(time));
    expect(name).toBe("dynasty-20261029-070503-009.json");
    expect(isVersionName(name)).toBe(true);
    expect(versionTime(name)).toBe(time);
    for (const other of ["dynasty.json", "dynasty-20261029-0705-009.json", "../dynasty-20261029-070503-009.json"])
      expect(isVersionName(other)).toBe(false);
    expect(newestFirst(["notes.txt", versionName(new Date(time + 1)), name])).toEqual([
      versionName(new Date(time + 1)),
      name,
    ]);
  });
  it("keeps photo files that a saved version still refers to", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const directory = new MemoryDirectory();
    const project = createDemoProject();
    project.characters[0].stages[0].photo = {
      original: "data:image/png;base64,b3JpZ2luYWw=",
      updatedAt: project.updatedAt,
    };
    const folder = await DynastyFolder.create(directory, project);
    const photos = directory.directories.get("photos")!;
    expect(photos.binary.size).toBe(1);
    vi.setSystemTime(Date.now() + VERSION_INTERVAL);
    const withoutPhoto = structuredClone(project);
    delete withoutPhoto.characters[0].stages[0].photo;
    await folder.save(withoutPhoto);
    // The first version still shows the photo, so restoring it brings the picture back.
    expect(photos.binary.size).toBe(1);
    const [, first] = await folder.listVersions();
    expect(await folder.restoreVersion(first.name)).toEqual(project);
  });
  it("reports a damaged file without versions and never offers broken copies", async () => {
    const directory = new MemoryDirectory();
    const project = createDemoProject();
    await (await DynastyFolder.create(directory, project)).close();
    const backups = directory.directories.get("backups")!;
    const [good] = [...backups.files.keys()];
    backups.files.set("dynasty-20000101-000000-000.json", "{ broken");
    directory.files.set(DYNASTY_FILE, "");
    const failure = await DynastyFolder.open(directory).catch((error) => error);
    expect(failure).toBeInstanceOf(FolderDamagedError);
    expect((failure as FolderDamagedError).versions.map((version) => version.name)).toEqual([good]);
    // A file from a newer program is not damaged: it is never replaced by an older copy.
    directory.files.set(DYNASTY_FILE, JSON.stringify({ app: "dynasty-chronicles", formatVersion: 3, project: {} }));
    await expect(DynastyFolder.open(directory)).rejects.toThrow("INVALID_PROJECT_FORMAT");
    // The marker of a failed opening is removed again.
    expect(directory.files.has(OPEN_MARKER)).toBe(false);
  });
});

/** Another window runs its own copy of the module. */
async function otherWindow() {
  vi.resetModules();
  return (await import("./dynastyProtection")).handleOpenMarker;
}

describe("open marker", () => {
  it("refuses a second window until the first one releases the dynasty", async () => {
    const directory = new MemoryDirectory();
    const first = handleOpenMarker(directory, "browser_first");
    const second = (await otherWindow())(directory, "browser_second");
    await first.claim();
    expect(JSON.parse(directory.files.get(OPEN_MARKER)!).owner).toBe("browser_first");
    await expect(second.claim()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    // A refresh by the refused window never takes the marker over.
    await second.refresh();
    expect(JSON.parse(directory.files.get(OPEN_MARKER)!).owner).toBe("browser_first");
    await second.release();
    expect(directory.files.has(OPEN_MARKER)).toBe(true);
    await first.release();
    expect(directory.files.has(OPEN_MARKER)).toBe(false);
    await second.claim();
  });
  it("treats a marker that has not been refreshed for a while as left by a crash", async () => {
    const directory = new MemoryDirectory();
    let now = Date.UTC(2026, 9, 29, 12);
    const crashed = handleOpenMarker(directory, "desktop-1", () => now);
    const next = (await otherWindow())(directory, "browser_next", () => now);
    await crashed.claim();
    now += MARKER_STALE - 1000;
    await expect(next.claim()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    await crashed.refresh();
    now += MARKER_STALE - 1000;
    await expect(next.claim()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    now += 2000;
    await next.claim();
    expect(JSON.parse(directory.files.get(OPEN_MARKER)!).owner).toBe("browser_next");
  });
  it("tells tabs of one browser apart by their web locks", async () => {
    const held = new Set<string>();
    vi.stubGlobal("navigator", {
      locks: {
        query: async () => ({ held: [...held].map((name) => ({ name })) }),
        request: async (name: string, operation: () => Promise<unknown>) => {
          if (name.startsWith("talebranch:open:")) {
            held.add(name);
            return operation().finally(() => held.delete(name));
          }
          return operation();
        },
      },
    });
    const directory = new MemoryDirectory();
    const tab = handleOpenMarker(directory, "browser_profile");
    const otherTab = (await otherWindow())(directory, "browser_profile");
    await tab.claim();
    // Another tab of the same browser: the first tab still holds its lock.
    await expect(otherTab.claim()).rejects.toThrow("DYNASTY_OPEN_ELSEWHERE");
    // A reloaded or closed tab loses its lock at once, even if its marker is fresh.
    const marker = directory.files.get(OPEN_MARKER)!;
    await tab.release();
    directory.files.set(OPEN_MARKER, marker);
    await otherTab.claim();
  });
  it("opens a read-only folder without a marker", async () => {
    const project = createDemoProject();
    const directory = new MemoryDirectory();
    await (await DynastyFolder.create(directory, project)).close();
    directory.failClose = true;
    const opened = await DynastyFolder.open(directory);
    expect(opened.project).toEqual(project);
    expect(directory.files.has(OPEN_MARKER)).toBe(false);
  });
});
