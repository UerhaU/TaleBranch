// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createDemoProject, createEmptyProject } from "./project";
import { exportDocument, importProject } from "./storage";
import {
  deleteLegacyProject,
  hasUnreadableLegacyRecords,
  legacyRecoveryData,
  listLegacyProjects,
  loadLegacyProject,
} from "./legacyStorage";
import { storeLegacyProject } from "./dynastyStore.testSupport";
import { parseProject } from "./validation";

const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;
const manifest = (project = createDemoProject()) => ({ app: "dynasty-chronicles", formatVersion: 1, project });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("export and import format", () => {
  it("exports a .dynasty-tree file and imports it with photos intact", async () => {
    vi.stubGlobal("crypto", webcrypto);
    try {
      const project = createDemoProject();
      project.characters[0].stages[0].photo = {
        original: "data:image/png;base64,b3JpZ2luYWw=",
        edited: "data:image/webp;base64,Y3JvcA==",
        updatedAt: project.updatedAt,
      };
      const { filename, contents } = await exportDocument(project);
      expect(filename).toMatch(/\.dynasty-tree$/);
      expect(JSON.parse(contents).app).toBe("dynasty-chronicles");
      const imported = await importProject({ text: async () => contents } as File, "копия");
      expect(imported.characters).toEqual(parseProject(project).characters);
    } finally {
      vi.unstubAllGlobals();
    }
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
  ])("rejects incomplete or incompatible files", async (contents) => {
    await expect(importProject(file(contents), "copy")).rejects.toThrow();
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

  it("rejects duplicate characters and dangling connections", () => {
    const project = createDemoProject();
    project.characters.push(project.characters[0]);
    expect(() => parseProject(project)).toThrow();
    project.characters.pop();
    project.parentLinks[0].parentId = "missing";
    expect(() => parseProject(project)).toThrow();
  });
});

describe("old browser records for transfer", () => {
  it("lists nothing in an empty browser and never writes", () => {
    expect(listLegacyProjects()).toEqual([]);
    expect(hasUnreadableLegacyRecords()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("reads compressed and plain records with photographs and Unicode text, without an index", () => {
    const compressed = createDemoProject();
    compressed.characters[0].notes = "Личный текст 🐈 — заметки";
    compressed.characters[0].stages[0].photo = {
      original: `data:image/png;base64,${btoa("photo".repeat(3000))}`,
      edited: "data:image/webp;base64,Y3JvcA==",
      updatedAt: compressed.updatedAt,
    };
    storeLegacyProject(compressed);
    const plain = createEmptyProject("Простой JSON");
    storeLegacyProject(plain, false);
    expect(loadLegacyProject(compressed.id)).toEqual(parseProject(compressed));
    expect(loadLegacyProject(plain.id)).toEqual(parseProject(plain));
    expect(
      listLegacyProjects()
        .map((item) => item.id)
        .sort(),
    ).toEqual([compressed.id, plain.id].sort());
  });

  it("updates colours of the oldest palette when reading", () => {
    const project = createDemoProject();
    project.characters[0].color = "#b7744c";
    storeLegacyProject(project);
    expect(loadLegacyProject(project.id)?.characters[0].color).toBe("#3E4B8E");
  });

  it("keeps damaged records untouched and offers them for the recovery download", () => {
    localStorage.setItem("dynasty-chronicles:project:damaged", "dynasty-lz16-v1:broken");
    expect(listLegacyProjects()).toEqual([]);
    expect(hasUnreadableLegacyRecords()).toBe(true);
    expect(() => loadLegacyProject("damaged")).toThrow();
    expect(JSON.parse(legacyRecoveryData())["dynasty-chronicles:project:damaged"]).toBe("dynasty-lz16-v1:broken");
    expect(localStorage.getItem("dynasty-chronicles:project:damaged")).toBe("dynasty-lz16-v1:broken");
  });

  it("deletes only the chosen record and keeps other records and preferences", () => {
    const removed = createDemoProject();
    const remaining = createEmptyProject("Keep me");
    storeLegacyProject(removed);
    storeLegacyProject(remaining);
    localStorage.setItem("dynasty-chronicles:index", JSON.stringify(listLegacyProjects()));
    localStorage.setItem("dynasty-chronicles:active", removed.id);
    localStorage.setItem("dynasty-chronicles:language", "ru");
    const saved = localStorage.getItem(`dynasty-chronicles:project:${remaining.id}`);
    deleteLegacyProject(removed.id);
    expect(loadLegacyProject(removed.id)).toBeNull();
    expect(localStorage.getItem(`dynasty-chronicles:project:${remaining.id}`)).toBe(saved);
    expect(localStorage.getItem("dynasty-chronicles:language")).toBe("ru");
    expect(localStorage.getItem("dynasty-chronicles:active")).toBeNull();
    expect(listLegacyProjects().map((item) => item.id)).toEqual([remaining.id]);
  });

  it("removes the record even if the index cannot be rewritten", () => {
    const project = createDemoProject();
    storeLegacyProject(project);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    deleteLegacyProject(project.id);
    expect(listLegacyProjects()).toEqual([]);
  });
});
