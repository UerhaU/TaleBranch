import { describe, expect, it } from "vitest";
import { autoLayout, createCharacter, createEmptyProject, normalizePair, wouldCreateAncestorCycle } from "./project";
import type { ParentLink } from "../types";

function link(parentId: string, childId: string): ParentLink {
  return {
    id: `${parentId}-${childId}`,
    parentId,
    childId,
    kind: "Биологическое",
    parentRole: "Родитель",
    childRole: "Ребёнок",
    biological: "yes",
    active: true,
    comment: "",
  };
}

describe("модель графа", () => {
  it("ставит потомка ниже самого длинного пути предков при нескольких родителях", () => {
    const project = createEmptyProject();
    project.characters = ["root", "short", "long1", "long2", "child", "grandchild"].map((id) =>
      createCharacter(id, "sim", { id }),
    );
    project.parentLinks = [
      link("root", "short"),
      link("root", "long1"),
      link("long1", "long2"),
      link("short", "child"),
      link("long2", "child"),
      link("child", "grandchild"),
    ];
    const positions = autoLayout(project);
    for (const relation of project.parentLinks)
      expect(positions[relation.childId].y).toBeGreaterThan(positions[relation.parentId].y);
  });
  it("нормализует порядок участников пары", () => {
    expect(normalizePair("z", "a")).toEqual(["a", "z"]);
    expect(normalizePair("a", "z")).toEqual(["a", "z"]);
  });

  it("предупреждает о цикле предков, но не зависает", () => {
    const project = createEmptyProject();
    project.characters = [
      createCharacter("A", "sim", { id: "a" }),
      createCharacter("B", "sim", { id: "b" }),
      createCharacter("C", "sim", { id: "c" }),
    ];
    project.parentLinks = [link("a", "b"), link("b", "c")];
    expect(wouldCreateAncestorCycle(project, "c", "a")).toBe(true);
    expect(wouldCreateAncestorCycle(project, "a", "c")).toBe(false);
  });

  it("завершает автораскладку даже при существующем цикле", () => {
    const project = createEmptyProject();
    project.characters = [
      createCharacter("A", "sim", { id: "a" }),
      createCharacter("B", "sim", { id: "b" }),
      createCharacter("C", "sim", { id: "c" }),
    ];
    project.parentLinks = [link("a", "b"), link("b", "c"), link("c", "a")];
    const positions = autoLayout(project);
    expect(Object.keys(positions)).toHaveLength(3);
    expect(positions.a).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("не создаёт отдельную позицию для питомца", () => {
    const project = createEmptyProject();
    project.characters = [
      createCharacter("Владелец", "sim", { id: "owner" }),
      createCharacter("Питомец", "pet", { id: "pet", ownerIds: ["owner"] }),
    ];
    const positions = autoLayout(project);
    expect(Object.keys(positions)).toEqual(["owner"]);
    expect(positions.pet).toBeUndefined();
  });
});
