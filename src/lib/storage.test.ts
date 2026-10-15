// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createDemoProject, createEmptyProject } from "./project";
import { importProject, listProjects, loadInitialProject, loadProject, saveProject } from "./storage";
import { parseProject } from "./validation";

const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;
const manifest = (project = createDemoProject()) => ({ app: "dynasty-chronicles", formatVersion: 1, project });

beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("project storage and import", () => {
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
