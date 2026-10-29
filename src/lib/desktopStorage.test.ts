// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke, isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({}) }));
import { DesktopDirectory, desktopBackend } from "./desktopStorage";
afterEach(() => {
  runtime.invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("native desktop file adapter", () => {
  const info = { name: "Династии", path: "D:\\Династии" };
  it("uses a native folder dialog instead of the browser picker or permission prompts", async () => {
    const browserPicker = vi.fn();
    vi.stubGlobal("showDirectoryPicker", browserPicker);
    runtime.invoke.mockResolvedValueOnce(info);
    const directory = await desktopBackend.pick();
    expect(directory).toBeInstanceOf(DesktopDirectory);
    expect(directory.displayPath).toBe(info.path);
    expect(await directory.queryPermission({ mode: "readwrite" })).toBe("granted");
    expect(await directory.requestPermission({ mode: "readwrite" })).toBe("granted");
    expect(browserPicker).not.toHaveBeenCalled();
    expect(runtime.invoke.mock.calls).toEqual([["desktop_pick_directory", undefined]]);
  });
  it("treats cancellation as cancellation rather than an empty directory", async () => {
    runtime.invoke.mockResolvedValueOnce(null);
    await expect(desktopBackend.pick()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("holds writes until close and sends the original revision for conflict detection", async () => {
    runtime.invoke
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ text: "old", revision: "revision-1" })
      .mockResolvedValueOnce(null);
    const directory = new DesktopDirectory(info);
    const file = await directory.getFileHandle("dynasty.json");
    const writer = await file.createWritable();
    await writer.write("new");
    expect(runtime.invoke).toHaveBeenCalledTimes(2);
    await writer.close();
    expect(runtime.invoke).toHaveBeenLastCalledWith("desktop_io", {
      request: { op: "write", directory: info.path, text: "new", expected: "revision-1" },
    });
  });
  it("does not write aborted streams and preserves native error names", async () => {
    const directory = new DesktopDirectory(info);
    runtime.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce({ text: "old", revision: "revision-1" });
    const writer = await (await directory.getFileHandle("dynasty.json")).createWritable();
    await writer.write("new");
    await writer.abort();
    await expect(writer.close()).rejects.toMatchObject({ name: "AbortError" });
    expect(runtime.invoke).toHaveBeenCalledTimes(2);
    runtime.invoke.mockRejectedValueOnce({ name: "NotAllowedError", message: "Disk is read-only" });
    await expect(directory.getFileHandle("dynasty.json")).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Disk is read-only",
    });
  });
  it("reconstructs recent folders from native path metadata without browser permission handles", async () => {
    runtime.invoke.mockResolvedValueOnce([{ id: "folder-1", name: "Дом Вороновых", directory: info }]);
    const recent = await desktopBackend.recent();
    expect(recent[0].directory).toBeInstanceOf(DesktopDirectory);
    expect(recent[0].directory.displayPath).toBe(info.path);
    expect(runtime.invoke).toHaveBeenCalledWith("desktop_recent_folders", undefined);
  });
  it("uses the native Save dialog for JSON and PNG exports", async () => {
    runtime.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await desktopBackend.saveFile("Dynasty.dynasty-tree", "{}", false)).toBe(true);
    expect(runtime.invoke).toHaveBeenCalledWith("desktop_save_export", {
      name: "Dynasty.dynasty-tree",
      contents: "{}",
      png: false,
    });
    expect(await desktopBackend.saveFile("Tree.png", "aGVsbG8=", true)).toBe(false);
  });
  it("loads and clears the last folder through app settings rather than dynasty contents", async () => {
    runtime.invoke
      .mockResolvedValueOnce({ id: "last", name: "Воробьёвы", directory: info })
      .mockResolvedValueOnce(null);
    const last = await desktopBackend.last();
    expect(last?.directory).toBeInstanceOf(DesktopDirectory);
    expect(last?.directory.displayPath).toBe(info.path);
    await desktopBackend.clearLast();
    expect(runtime.invoke.mock.calls).toEqual([
      ["desktop_last_folder", undefined],
      ["desktop_clear_last_folder", undefined],
    ]);
  });
  it("deletes the selected dynasty folder with a revision check", async () => {
    runtime.invoke.mockResolvedValueOnce(null);
    await new DesktopDirectory(info).deleteDynasty("revision");
    expect(runtime.invoke).toHaveBeenCalledWith("desktop_io", {
      request: { op: "deleteDynasty", directory: info.path, expected: "revision" },
    });
  });
});
