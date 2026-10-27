// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createDemoProject, createEmptyProject } from "./project";
import {
  deleteStoredProject,
  downloadProject,
  importProject,
  listProjects,
  loadInitialProject,
  loadProject,
  saveProject,
  saveProjectIrreversibly,
} from "./storage";
import { parseProject } from "./validation";

const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;
const manifest = (project = createDemoProject()) => ({ app: "dynasty-chronicles", formatVersion: 1, project });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("project storage and import", () => {
  it("returns no dynasty for an empty store without generating or saving one", () => {
    expect(loadInitialProject()).toBeNull();
    expect(listProjects()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("deletes the last dynasty without saving a replacement", () => {
    const project = createDemoProject();
    saveProject(project);
    deleteStoredProject(project.id);
    expect(loadProject(project.id)).toBeNull();
    expect(loadInitialProject()).toBeNull();
    expect(listProjects()).toEqual([]);
    expect(localStorage.getItem("dynasty-chronicles:active")).toBeNull();
  });

  it("rolls back metadata when removing the last dynasty fails", () => {
    const project = createDemoProject();
    saveProject(project);
    const before = { ...localStorage };
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key === `dynasty-chronicles:project:${project.id}`) throw Error("Removal failed");
      remove.call(this, key);
    });
    expect(() => deleteStoredProject(project.id)).toThrow();
    expect({ ...localStorage }).toEqual(before);
  });
  it("downloads a normal JSON export through an attached link and imports it with photos intact", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const originalURL = URL;
    let downloaded: Blob | undefined;
    vi.stubGlobal(
      "URL",
      class extends originalURL {
        static createObjectURL(blob: Blob) {
          downloaded = blob;
          return "blob:test-export";
        }
        static revokeObjectURL() {}
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toMatch(/\.dynasty-tree$/);
    });
    try {
      const project = createDemoProject();
      project.characters[0].stages[0].photo = {
        original: "data:image/png;base64,b3JpZ2luYWw=",
        edited: "data:image/webp;base64,Y3JvcA==",
        updatedAt: project.updatedAt,
      };
      saveProject(project);
      await downloadProject(loadProject(project.id)!);
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector("a[download]")).toBeNull();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(downloaded!);
      });
      expect(JSON.parse(text).app).toBe("dynasty-chronicles");
      const imported = await importProject({ text: async () => text } as File, "копия");
      expect(imported.characters).toEqual(parseProject(project).characters);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains a damaged compressed record for recovery instead of replacing it", () => {
    localStorage.setItem("dynasty-chronicles:active", "damaged");
    localStorage.setItem("dynasty-chronicles:project:damaged", "dynasty-lz16-v1:broken");
    expect(() => loadInitialProject()).toThrow();
    expect(localStorage.getItem("dynasty-chronicles:project:damaged")).toBe("dynasty-lz16-v1:broken");
  });

  it("compresses local records and restores photographs, catalog values and Unicode text losslessly", () => {
    const project = createDemoProject();
    project.characters[0].notes = "Личный текст 🐈 — заметки";
    project.characters[0].stages[0].photo = {
      original: `data:image/png;base64,${btoa("photo".repeat(3000))}`,
      edited: "data:image/webp;base64,Y3JvcA==",
      updatedAt: project.updatedAt,
    };
    saveProject(project);
    const stored = localStorage.getItem(`dynasty-chronicles:project:${project.id}`)!;
    expect(stored.length).toBeLessThan(JSON.stringify(project).length / 2);
    expect(loadProject(project.id)).toEqual(parseProject(project));
    localStorage.removeItem("dynasty-chronicles:index");
    expect(listProjects().map((item) => item.id)).toEqual([project.id]);
  });

  it("opens legacy plain JSON and saves the same data in the compressed format", () => {
    const project = createDemoProject();
    localStorage.setItem(`dynasty-chronicles:project:${project.id}`, JSON.stringify(project));
    expect(loadInitialProject()).toEqual(parseProject(project));
    saveProject(project);
    expect(loadProject(project.id)).toEqual(parseProject(project));
  });

  it("fits a project into a quota that rejects its old uncompressed representation", () => {
    const project = createDemoProject();
    const quota = JSON.stringify(project).length / 2;
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.length > quota) throw new DOMException("Quota", "QuotaExceededError");
      original.call(this, key, value);
    });
    expect(() => localStorage.setItem(`dynasty-chronicles:project:${project.id}`, JSON.stringify(project))).toThrow();
    expect(() => saveProject(project)).not.toThrow();
    expect(loadProject(project.id)?.characters).toHaveLength(6);
  });

  it.each(["dynasty-chronicles:index", "dynasty-chronicles:active", "dynasty-chronicles:project:project_demo"])(
    "preserves the source if a purge write to %s fails",
    (failedKey) => {
      const project = createDemoProject();
      saveProject(project);
      const original = localStorage.getItem("dynasty-chronicles:project:project_demo");
      const setItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
        if (key === failedKey) throw Error("Failed storage write");
        setItem.call(this, key, value);
      });
      expect(() => saveProjectIrreversibly({ ...project, characters: [], parentLinks: [], pairLinks: [] })).toThrow();
      expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe(original);
      expect(loadInitialProject()?.id).toBe(project.id);
    },
  );

  it("rolls back a dynasty switch when the final removal fails", () => {
    const project = createDemoProject();
    saveProject(project);
    const replacement = createEmptyProject("Empty");
    const before = { ...localStorage };
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key === "dynasty-chronicles:project:project_demo") throw Error("Failed removal");
      removeItem.call(this, key);
    });
    expect(() => deleteStoredProject(project.id, replacement)).toThrow();
    expect({ ...localStorage }).toEqual(before);
  });

  it("removes only the chosen dynasty and preserves other data and preferences", () => {
    const removed = createDemoProject(),
      remaining = createEmptyProject("Keep me");
    saveProject(remaining);
    saveProject(removed);
    localStorage.setItem("dynasty-chronicles:language", "ru");
    const saved = localStorage.getItem(`dynasty-chronicles:project:${remaining.id}`);
    deleteStoredProject(removed.id, remaining);
    expect(loadProject(removed.id)).toBeNull();
    expect(localStorage.getItem(`dynasty-chronicles:project:${remaining.id}`)).toBe(saved);
    expect(localStorage.getItem("dynasty-chronicles:language")).toBe("ru");
    expect(listProjects().map((item) => item.id)).toEqual([remaining.id]);
    expect(loadInitialProject()?.id).toBe(remaining.id);
  });
  it("reads existing exports as a new independent project", async () => {
    const source = manifest();
    const imported = await importProject(file(source), "копия");
    expect(imported.id).not.toBe(source.project.id);
    expect(imported.name).toContain("копия");
    expect(imported.characters).toEqual(source.project.characters);
    expect(imported.parentLinks).toEqual(source.project.parentLinks);
  });

  it.each([
    null,
    { ...manifest(), formatVersion: 2 },
    { ...manifest(), app: "different-app" },
    { ...manifest(), project: { ...createEmptyProject(), characters: [{}] } },
    { ...manifest(), checksum: "0:0:0" },
    { ...manifest(), project: { ...createDemoProject(), positions: { char_vera: { x: "bad", y: 0 } } } },
  ])("rejects incomplete or incompatible files without touching stored data", async (contents) => {
    saveProject(createDemoProject());
    const saved = localStorage.getItem("dynasty-chronicles:project:project_demo");
    await expect(importProject(file(contents), "copy")).rejects.toThrow();
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe(saved);
  });

  it("detects content changes even when counts are unchanged", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const contents = manifest();
    const hash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(contents.project)));
    const contentHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await expect(importProject(file({ ...contents, contentHash }), "copy")).resolves.toBeDefined();
    contents.project.characters[0].biography = "Changed after export";
    await expect(importProject(file({ ...contents, contentHash }), "copy")).rejects.toThrow("CHECKSUM");
    vi.unstubAllGlobals();
  });

  it("recovers a project if its index write failed", () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "dynasty-chronicles:index") throw new DOMException("Quota", "QuotaExceededError");
      original.call(this, key, value);
    });
    expect(() => saveProject(createDemoProject())).toThrow();
    expect(listProjects().map((project) => project.id)).toEqual(["project_demo"]);
    expect(loadProject("project_demo")?.characters).toHaveLength(6);
  });

  it("never replaces a damaged active project with the demo", () => {
    localStorage.setItem("dynasty-chronicles:active", "project_demo");
    localStorage.setItem("dynasty-chronicles:project:project_demo", "broken JSON");
    expect(() => loadInitialProject()).toThrow();
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe("broken JSON");
  });

  it("rejects duplicate characters and dangling connections", () => {
    const project = createDemoProject();
    project.characters.push(project.characters[0]);
    expect(() => parseProject(project)).toThrow();
    project.characters.pop();
    project.parentLinks[0].parentId = "missing";
    expect(() => parseProject(project)).toThrow();
  });
});
