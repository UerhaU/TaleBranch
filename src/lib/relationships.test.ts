import { describe, expect, it } from "vitest";
import { createDemoProject } from "./project";
import { moveCharacterToTrash, normalizePairLink, permanentlyDeleteTrashedCharacters, restoreTrashedCharacter } from "./relationships";
import { parseProject } from "./validation";

describe("trash and relationship integrity", () => {
  it("purges photos, archived connections, positions and pet owner references without deleting other profiles", () => {
    const project = createDemoProject();
    project.characters.find((item) => item.id === "char_vera")!.stages[0].photo = { original: "private-original", edited: "private-crop", updatedAt: project.updatedAt };
    project.characters.find((item) => item.id === "char_rune")!.ownerIds = ["char_vera", "char_nika"];
    moveCharacterToTrash(project, "char_vera");
    moveCharacterToTrash(project, "char_nika");
    permanentlyDeleteTrashedCharacters(project, ["char_vera", "char_rune", "missing"]);
    expect(project.trashedCharacters.map((item) => item.id)).toEqual(["char_nika"]);
    expect(project.characters.find((item) => item.id === "char_rune")?.ownerIds).toEqual(["char_nika"]);
    const json = JSON.stringify(project);
    expect(json).not.toContain("char_vera");
    expect(json).not.toContain("private-original");
    expect(json).not.toContain("private-crop");
    const reopened = parseProject(JSON.parse(json));
    restoreTrashedCharacter(reopened, "char_nika");
    expect(reopened.parentLinks.some((item) => item.parentId === "char_leon" && item.childId === "char_nika")).toBe(true);
    expect(reopened.characters).toHaveLength(5);
  });

  it("empties trash while preserving the active tree and other pets", () => {
    const project = createDemoProject();
    moveCharacterToTrash(project, "char_nika");
    moveCharacterToTrash(project, "char_vera");
    const active = structuredClone(project.characters);
    permanentlyDeleteTrashedCharacters(project, project.trashedCharacters.map((item) => item.id));
    expect(project.trashedCharacters).toEqual([]);
    expect(project.trashLinks).toEqual({ parentLinks: [], pairLinks: [], positions: {} });
    expect(project.characters.map((item) => item.id)).toEqual(active.map((item) => item.id));
    expect(project.characters.find((item) => item.id === "char_rune")?.ownerIds).toEqual([]);
    expect(() => parseProject(project)).not.toThrow();
  });
  it("restores a character with all connections, photos and its original position after reopening", () => {
    const project = createDemoProject();
    const original = structuredClone(project);
    moveCharacterToTrash(project, "char_vera");
    expect(project.parentLinks).toHaveLength(1);
    const reopened = parseProject(JSON.parse(JSON.stringify(project)));
    restoreTrashedCharacter(reopened, "char_vera");
    expect(reopened.positions.char_vera).toEqual(original.positions.char_vera);
    expect(reopened.parentLinks.map((link) => link.id).sort()).toEqual(original.parentLinks.map((link) => link.id).sort());
    expect(reopened.pairLinks).toEqual(original.pairLinks);
  });

  it.each([["char_elena", "char_vera"], ["char_vera", "char_elena"]])("restores both ends in either order: %s, %s", (first, second) => {
    const project = createDemoProject();
    moveCharacterToTrash(project, "char_elena");
    moveCharacterToTrash(project, "char_vera");
    restoreTrashedCharacter(project, first);
    expect(project.parentLinks.some((link) => link.parentId === "char_elena" && link.childId === "char_vera")).toBe(false);
    restoreTrashedCharacter(project, second);
    expect(project.parentLinks).toHaveLength(4);
    expect(project.pairLinks).toHaveLength(2);
    restoreTrashedCharacter(project, second);
    expect(project.parentLinks).toHaveLength(4);
  });

  it("preserves who loves whom when the form uses the reverse pair order", () => {
    const pair = createDemoProject().pairLinks[0];
    const normalized = normalizePairLink({ ...pair, aId: "z", bId: "a", labels: [{ ...pair.labels[0], direction: "a-to-b" }] });
    expect(normalized.aId).toBe("a");
    expect(normalized.bId).toBe("z");
    expect(normalized.labels[0].direction).toBe("b-to-a");
    expect(normalizePairLink(normalized)).toEqual(normalized);
  });
});
