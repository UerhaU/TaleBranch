import { afterEach, describe, expect, it, vi } from "vitest";
import { DynastyFolder, DYNASTY_FILE, dynastyFolderName, grantDirectory } from "./folderStorage";
import { createDemoProject } from "./project";
import { MemoryDirectory } from "./folderStorage.testSupport";
afterEach(() => vi.unstubAllGlobals());

describe("dynasties in user folders", () => {
  it("creates a portable file and reopens the same dynasty with photos, trash and coordinates", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    project.characters[0].stages[0].photo = { original: "data:image/png;base64,original", edited: "data:image/png;base64,edited", updatedAt: project.updatedAt };
    project.trashedCharacters.push(project.characters.pop()!);
    await DynastyFolder.create(directory, project);
    expect([...directory.files.keys()]).toEqual([DYNASTY_FILE]);
    const reopened = await DynastyFolder.open(directory);
    expect(reopened.project).toEqual(project);
    project.name = "Изменено в исходной папке";
    await reopened.folder.save(project);
    expect((await DynastyFolder.open(directory)).project).toEqual(project);
  });
  it("allows unrelated files in a target folder and leaves them intact", async () => {
    const directory = new MemoryDirectory(); directory.files.set("notes.txt", "Оставить");
    await DynastyFolder.create(directory, createDemoProject());
    expect(directory.files.get("notes.txt")).toBe("Оставить");
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
  it.each(["", "Existing dynasty"])("never replaces or deletes an existing dynasty file, including an empty file (%s)", async contents => {
    const directory = new MemoryDirectory(); directory.files.set(DYNASTY_FILE, contents);
    await expect(DynastyFolder.create(directory, createDemoProject())).rejects.toThrow("FOLDER_CONFLICT");
    expect(directory.files.get(DYNASTY_FILE)).toBe(contents);
  });
  it("creates a named dynasty folder inside a nonempty chosen location", async () => {
    const parent = new MemoryDirectory(); const project = createDemoProject();
    parent.files.set("notes.txt", "Мой файл"); parent.files.set(DYNASTY_FILE, "Другая династия");
    const old = new MemoryDirectory(); old.name = "Старая династия"; old.files.set("photo.png", "Фото");
    parent.directories.set(old.name, old);
    const folder = await DynastyFolder.createInLocation(parent, project);
    expect(folder.directory.name).toBe(project.name);
    expect((await DynastyFolder.open(await parent.getDirectoryHandle(project.name))).project).toEqual(project);
    expect([...parent.files.entries()]).toEqual([["notes.txt", "Мой файл"], [DYNASTY_FILE, "Другая династия"]]);
    expect([...old.files.entries()]).toEqual([["photo.png", "Фото"]]);
  });
  it("chooses a free name without reusing existing folders or replacing colliding files", async () => {
    const parent = new MemoryDirectory(); const project = createDemoProject();
    project.name = "Дом Вороновых";
    parent.files.set("дом вороновых", "Файл с таким именем");
    const old = await parent.getDirectoryHandle("Дом Вороновых (2)", { create: true }); old.files.set(DYNASTY_FILE, "Оставить");
    const folder = await DynastyFolder.createInLocation(parent, project);
    expect(folder.directory.name).toBe("Дом Вороновых (3)");
    expect((await DynastyFolder.open(folder.directory)).project.name).toBe(project.name);
    expect(parent.files.get("дом вороновых")).toBe("Файл с таким именем");
    expect(old.files.get(DYNASTY_FILE)).toBe("Оставить");
  });
  it("removes only the new empty folder on first-write failure and allows retry", async () => {
    const parent = new MemoryDirectory(); const project = createDemoProject();
    parent.files.set("notes.txt", "Оставить"); parent.failWrite = true;
    await expect(DynastyFolder.createInLocation(parent, project)).rejects.toThrow();
    expect(parent.directories.size).toBe(0); expect(parent.files.get("notes.txt")).toBe("Оставить");
    parent.failWrite = false;
    const folder = await DynastyFolder.createInLocation(parent, project);
    expect(folder.directory.name).toBe(project.name);
  });
  it.each([
    ["Дом Вороновых", "Дом Вороновых"], ["  Дом: Вороновы?  ", "Дом_ Вороновы_"],
    ["../Семья", ".._Семья"], ["CON.txt", "_CON.txt"], ["...", "Dynasty"], ["NUL", "_NUL"],
  ])("uses a valid folder name for %s without altering the dynasty name", (name, expected) => {
    expect(dynastyFolderName(name)).toBe(expected);
  });
  it.each(["failWrite", "failClose"] as const)("keeps the old file intact when %s fails, then can retry", async failure => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project);
    const before = directory.files.get(DYNASTY_FILE);
    project.name = "Несохранённое изменение"; directory[failure] = true;
    await expect(folder.save(project)).rejects.toThrow();
    expect(directory.files.get(DYNASTY_FILE)).toBe(before);
    directory[failure] = false; await folder.save(project);
    expect((await DynastyFolder.open(directory)).project.name).toBe(project.name);
  });
  it("leaves a reusable empty folder when the first write fails", async () => {
    const directory = new MemoryDirectory(); directory.failWrite = true;
    await expect(DynastyFolder.create(directory, createDemoProject())).rejects.toThrow();
    expect(directory.files.size).toBe(0);
    directory.failWrite = false;
    await DynastyFolder.create(directory, createDemoProject());
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
  it("detects external edits and another session's saves instead of overwriting them", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const first = await DynastyFolder.create(directory, project);
    const second = await DynastyFolder.open(directory);
    project.name = "Другая вкладка"; await first.save(project);
    const latest = directory.files.get(DYNASTY_FILE);
    await expect(second.folder.save(second.project)).rejects.toThrow("FOLDER_CONFLICT");
    await expect(second.folder.delete()).rejects.toThrow("FOLDER_CONFLICT");
    expect(directory.files.get(DYNASTY_FILE)).toBe(latest);
  });
  it("aborts a pending write if an external edit appears while writing", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project);
    directory.holdWrite = async () => { directory.files.set(DYNASTY_FILE, "Externally edited"); };
    await expect(folder.save(project)).rejects.toThrow("FOLDER_CONFLICT");
    expect(directory.files.get(DYNASTY_FILE)).toBe("Externally edited");
  });
  it("serializes autosaves so the newest change wins", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project);
    await Promise.all([folder.save({ ...project, name: "Первое" }), folder.save({ ...project, name: "Последнее" })]);
    expect((await DynastyFolder.open(directory)).project.name).toBe("Последнее");
  });
  it("coordinates simultaneous writers in separate tabs with a browser lock", async () => {
    let queue = Promise.resolve(); const requested: string[] = [];
    vi.stubGlobal("navigator", { locks: { request: (name: string, operation: () => Promise<void>) => {
      requested.push(name);
      const result = queue.then(operation); queue = result.catch(() => {}); return result;
    } } });
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const first = await DynastyFolder.create(directory, project);
    const second = (await DynastyFolder.open(directory)).folder;
    const results = await Promise.allSettled([first.save({ ...project, name: "Первая вкладка" }), second.save({ ...project, name: "Вторая вкладка" })]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason.message).toBe("FOLDER_CONFLICT");
    expect((await DynastyFolder.open(directory)).project.name).toBe("Первая вкладка");
    expect(new Set(requested)).toEqual(new Set([`talebranch:dynasty:${project.id}`]));
  });
  it("deletes the dynasty folder with its contents and cannot resurrect it", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project); directory.files.set("notes.txt", "Мои заметки");
    await folder.delete();
    expect(directory.deleted).toBe(true); expect(directory.files.size).toBe(0);
    await expect(folder.save(project)).rejects.toThrow("FOLDER_DELETED");
  });
  it("removes a created child folder recursively while preserving its parent and siblings", async () => {
    const parent = new MemoryDirectory(); parent.files.set("keep.txt", "Keep");
    const sibling = await parent.getDirectoryHandle("Соседи", { create: true }); sibling.files.set("keep.txt", "Keep");
    const folder = await DynastyFolder.createInLocation(parent, createDemoProject());
    const nested = await folder.directory.getDirectoryHandle("Фотографии", { create: true });
    (nested as MemoryDirectory).files.set("photo.png", "Photo");
    await folder.delete();
    expect([...parent.directories.keys()]).toEqual(["Соседи"]);
    expect(parent.files.get("keep.txt")).toBe("Keep"); expect(sibling.files.get("keep.txt")).toBe("Keep");
  });
  it("does not delete only the JSON when the browser cannot remove the directory", async () => {
    const directory = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.create(directory, project);
    Object.defineProperty(directory, "remove", { value: undefined });
    await expect(folder.delete()).rejects.toThrow("FOLDER_DELETE_UNSUPPORTED");
    expect(directory.files.has(DYNASTY_FILE)).toBe(true);
  });
  it("does not delete a replacement directory if the original folder was moved", async () => {
    const parent = new MemoryDirectory(); const project = createDemoProject();
    const folder = await DynastyFolder.createInLocation(parent, project);
    const original = folder.directory as MemoryDirectory;
    const replacement = new MemoryDirectory(); replacement.files.set("keep.txt", "Keep");
    parent.directories.set(original.name, replacement);
    await expect(folder.delete()).rejects.toThrow("FOLDER_CONFLICT");
    expect(original.files.has(DYNASTY_FILE)).toBe(true);
    expect(replacement.files.get("keep.txt")).toBe("Keep");
  });
  it("rejects corrupt data and denied permissions without writing", async () => {
    const directory = new MemoryDirectory(); directory.files.set(DYNASTY_FILE, "{}");
    await expect(DynastyFolder.open(directory)).rejects.toThrow("INVALID_PROJECT_FORMAT");
    directory.permission = "denied";
    await expect(grantDirectory(directory)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(directory.files.get(DYNASTY_FILE)).toBe("{}");
  });
});
