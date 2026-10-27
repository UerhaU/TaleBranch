import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoLayout, LAYOUT_CARD, LAYOUT_PARTNER_STEP, LAYOUT_ROW_STEP } from "./autoLayout";
import { createCharacter, createEmptyProject } from "./project";
import type { PairLink, ParentLink, Project } from "../types";

function parent(parentId: string, childId: string, patch: Partial<ParentLink> = {}): ParentLink {
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
    ...patch,
  };
}

function pair(aId: string, bId: string, active = true): PairLink {
  return {
    id: `${aId}+${bId}`,
    aId,
    bId,
    labels: [
      {
        id: `label-${aId}-${bId}`,
        name: "Супруги",
        color: "#F6E0B6",
        icon: "rings",
        direction: "mutual",
        active,
        publicity: "open",
        comment: "",
      },
    ],
  };
}

function tree(people: string[], parentLinks: ParentLink[], pairLinks: PairLink[] = []): Project {
  const project = createEmptyProject();
  project.characters = people.map((id) => createCharacter(id, "sim", { id }));
  project.parentLinks = parentLinks;
  project.pairLinks = pairLinks;
  return project;
}

/** Links each child to both parents. */
function family(parents: string[], children: string[]): ParentLink[] {
  return children.flatMap((child) => parents.map((id) => parent(id, child)));
}

type Layout = ReturnType<typeof autoLayout>;
const row = (layout: Layout, id: string) => (layout[id].y - layout[Object.keys(layout)[0]].y) / LAYOUT_ROW_STEP;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function expectSameRow(layout: Layout, ...ids: string[]) {
  ids.forEach((id) => expect(layout[id].y, id).toBe(layout[ids[0]].y));
}

/** Partners stand next to each other with nobody between them. */
function expectSideBySide(layout: Layout, a: string, b: string) {
  expect(layout[a].y).toBe(layout[b].y);
  expect(Math.abs(layout[a].x - layout[b].x)).toBe(LAYOUT_PARTNER_STEP);
}

function expectChildrenUnder(layout: Layout, parents: string[], children: string[]) {
  expect(mean(children.map((id) => layout[id].x))).toBeCloseTo(mean(parents.map((id) => layout[id].x)), 0);
}

/** When relatives compete for the same place, children stay within half a step of their parents' middle. */
function expectRoughlyUnder(layout: Layout, parents: string[], children: string[]) {
  const shift = mean(children.map((id) => layout[id].x)) - mean(parents.map((id) => layout[id].x));
  expect(Math.abs(shift)).toBeLessThanOrEqual(LAYOUT_PARTNER_STEP / 2);
}

function expectNoOverlaps(layout: Layout) {
  const points = Object.entries(layout);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const [a, pa] = points[i];
      const [b, pb] = points[j];
      // Cards with pets around the portrait keep at least 40 px of clear space in one direction.
      const clearX = Math.abs(pa.x - pb.x) - LAYOUT_CARD.width - LAYOUT_CARD.petOverhang;
      const clearY = Math.abs(pa.y - pb.y) - LAYOUT_CARD.height - 2 * LAYOUT_CARD.petOverhang;
      const apart = clearX >= 40 || clearY >= 40;
      expect(apart, `${a} и ${b} налезают друг на друга`).toBe(true);
    }
}

function expectChildrenBelow(layout: Layout, project: Project) {
  for (const link of project.parentLinks.filter((item) => item.active))
    expect(layout[link.childId].y, `${link.childId} ниже ${link.parentId}`).toBeGreaterThan(layout[link.parentId].y);
}

describe("умная автораскладка", () => {
  it("знает настоящий размер карточки и выступ питомцев", () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const styles = source("../styles.css");
    const characterNode = source("../components/CharacterNode.tsx");
    // Takes the block of a CSS rule, e.g. everything between `.tb-card {` and `}`.
    const rule = (selector: string) => styles.split(`\n${selector} {`)[1].split("}")[0];
    const px = (block: string, name: string) => Number(block.match(new RegExp(`\\s${name}: ([\\d.]+)px`))![1]);
    const card = rule(".tb-card");
    expect(px(card, "width")).toBe(LAYOUT_CARD.width);
    expect(px(card, "height")).toBe(LAYOUT_CARD.height);
    // Portrait centre sits at the left padding plus half the portrait; pets circle it.
    const padding = Number(card.match(/padding: 0 \d+px 0 (\d+)px/)![1]);
    const portrait = Number(characterNode.match(/<Avatar character=\{character\} size=\{(\d+)\}/)![1]);
    const radius = Number(characterNode.match(/const radius = (\d+);/)![1]);
    const pet = px(rule(".tb-pet"), "width");
    const reach = radius + pet / 2 + 2.5;
    expect(reach - (padding + portrait / 2)).toBeLessThanOrEqual(LAYOUT_CARD.petOverhang);
    expect(reach - LAYOUT_CARD.height / 2).toBeLessThanOrEqual(LAYOUT_CARD.petOverhang);
  });

  it("раскладывает четыре поколения рядами, пары рядом, детей под родителями", () => {
    const project = tree(
      ["grandpa", "grandma", "son", "daughter", "sonWife", "daughterHusband", "g1", "g2", "g3", "g4", "gg1", "gg1wife"],
      [
        ...family(["grandpa", "grandma"], ["son", "daughter"]),
        ...family(["son", "sonWife"], ["g1", "g2"]),
        ...family(["daughter", "daughterHusband"], ["g3", "g4"]),
        ...family(["g1", "gg1wife"], ["gg1"]),
      ],
    );
    const layout = autoLayout(project);
    expect(row(layout, "grandpa")).toBe(0);
    expectSameRow(layout, "son", "daughter", "sonWife", "daughterHusband");
    expectSameRow(layout, "g1", "g2", "g3", "g4", "gg1wife");
    expect(layout.son.y - layout.grandpa.y).toBe(LAYOUT_ROW_STEP);
    expect(layout.gg1.y - layout.g1.y).toBe(LAYOUT_ROW_STEP);
    expectSideBySide(layout, "grandpa", "grandma");
    expectSideBySide(layout, "son", "sonWife");
    expectSideBySide(layout, "daughter", "daughterHusband");
    expectSideBySide(layout, "g1", "gg1wife");
    expectChildrenUnder(layout, ["grandpa", "grandma"], ["son", "daughter"]);
    expectChildrenUnder(layout, ["son", "sonWife"], ["g1", "g2"]);
    expectChildrenUnder(layout, ["daughter", "daughterHusband"], ["g3", "g4"]);
    // Married-in partners stand on the outer side, next to their own children, not between siblings.
    expect(layout.son.x < layout.daughter.x).toBe(layout.sonWife.x < layout.son.x);
    expectChildrenBelow(layout, project);
    expectNoOverlaps(layout);
  });

  it("ставит партнёра без родителей в ряд его пары, а не наверх", () => {
    const project = tree(
      ["a", "b", "c", "d", "wife", "baby"],
      [parent("a", "b"), parent("b", "c"), parent("c", "d"), ...family(["d", "wife"], ["baby"])],
    );
    const layout = autoLayout(project);
    expect(row(layout, "wife")).toBe(3);
    expectSideBySide(layout, "d", "wife");
    expectChildrenUnder(layout, ["d", "wife"], ["baby"]);
  });

  it("ставит семью супруга в ряды по его месту в древе", () => {
    // The husband's parents are in the tree too: they line up one row above him.
    const project = tree(
      ["a", "b", "wife", "hMother", "hFather", "husband", "kid"],
      [
        parent("a", "b"),
        parent("b", "wife"),
        ...family(["hMother", "hFather"], ["husband"]),
        ...family(["wife", "husband"], ["kid"]),
      ],
    );
    const layout = autoLayout(project);
    expectSameRow(layout, "b", "hMother", "hFather");
    expectSideBySide(layout, "wife", "husband");
    expectSideBySide(layout, "hMother", "hFather");
    expectRoughlyUnder(layout, ["hMother", "hFather"], ["husband"]);
    expectRoughlyUnder(layout, ["b"], ["wife"]);
    expectNoOverlaps(layout);
  });

  it("при повторном браке ставит человека между партнёрами", () => {
    const project = tree(
      ["first", "hero", "second", "kidA", "kidB", "kidC"],
      [...family(["first", "hero"], ["kidA", "kidB"]), ...family(["hero", "second"], ["kidC"])],
    );
    const layout = autoLayout(project);
    expectSideBySide(layout, "first", "hero");
    expectSideBySide(layout, "hero", "second");
    expect(Math.sign(layout.kidC.x - layout.kidA.x)).toBe(Math.sign(layout.second.x - layout.first.x));
    expectRoughlyUnder(layout, ["first", "hero"], ["kidA", "kidB"]);
    expectRoughlyUnder(layout, ["hero", "second"], ["kidC"]);
    expectNoOverlaps(layout);
  });

  it("держит приёмных родителей парой отдельно от родного", () => {
    const project = tree(
      ["bioMom", "adoptMom", "adoptDad", "child", "sibling"],
      [
        parent("bioMom", "child"),
        parent("adoptMom", "child", { biological: "no", kind: "Приёмное" }),
        parent("adoptDad", "child", { biological: "no", kind: "Приёмное" }),
        ...family(["adoptMom", "adoptDad"], ["sibling"]),
      ],
    );
    const layout = autoLayout(project);
    expectSameRow(layout, "bioMom", "adoptMom", "adoptDad");
    expectSameRow(layout, "child", "sibling");
    expectSideBySide(layout, "adoptMom", "adoptDad");
    expectChildrenBelow(layout, project);
    expectNoOverlaps(layout);
  });

  it("учитывает только активные связи", () => {
    const project = tree(["a", "b", "c"], [parent("a", "b"), parent("b", "c", { active: false })]);
    const layout = autoLayout(project);
    expect(layout.b.y).toBeGreaterThan(layout.a.y);
    expect(layout.c.y).toBe(layout.a.y);
  });

  it("разводит отдельные семьи и одиночек, не накладывая их", () => {
    const project = tree(
      ["p1", "p2", "k1", "k2", "q1", "q2", "m1", "loner1", "loner2", "loner3", "single", "friend"],
      [...family(["p1", "p2"], ["k1", "k2"]), ...family(["q1", "q2"], ["m1"])],
      [pair("single", "friend")],
    );
    const layout = autoLayout(project);
    expectNoOverlaps(layout);
    const span = (ids: string[]) => [
      Math.min(...ids.map((id) => layout[id].x)),
      Math.max(...ids.map((id) => layout[id].x)),
    ];
    const [, firstRight] = span(["p1", "p2", "k1", "k2"]);
    const [secondLeft] = span(["q1", "q2", "m1"]);
    expect(secondLeft).toBeGreaterThan(firstRight + LAYOUT_PARTNER_STEP);
    expectSideBySide(layout, "single", "friend");
    expect(Object.keys(layout)).toHaveLength(project.characters.length);
  });

  it("ставит пару без детей и родителей в ряд партнёра", () => {
    const project = tree(["mom", "dad", "son", "girlfriend"], family(["mom", "dad"], ["son"]), [
      pair("son", "girlfriend"),
    ]);
    const layout = autoLayout(project);
    expectSideBySide(layout, "son", "girlfriend");
  });

  it("не зависает и не ломается на петле в родстве", () => {
    const project = tree(
      ["a", "b", "c", "d", "e"],
      [parent("a", "b"), parent("b", "c"), parent("c", "a"), parent("c", "d"), parent("e", "e"), parent("d", "b")],
    );
    const layout = autoLayout(project);
    expect(Object.keys(layout).sort()).toEqual(["a", "b", "c", "d", "e"]);
    Object.values(layout).forEach((point) => {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    });
    expectNoOverlaps(layout);
  });

  it("не даёт питомцам своих мест: они кружат у хозяина", () => {
    const project = tree(["owner"], []);
    project.characters.push(createCharacter("Кот", "pet", { id: "cat", ownerIds: ["owner"] }));
    project.parentLinks = [parent("owner", "cat")];
    const layout = autoLayout(project);
    expect(Object.keys(layout)).toEqual(["owner"]);
  });

  it("быстро раскладывает большое древо из 200 персонажей", () => {
    // Deterministic pseudo-random dynasty: couples, remarriages, married-in partners and side families.
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const people: string[] = [];
    const links: ParentLink[] = [];
    const add = () => {
      const id = `p${people.length}`;
      people.push(id);
      return id;
    };
    let couples: [string, string][] = [];
    for (let i = 0; i < 4; i++) couples.push([add(), add()]);
    while (people.length < 200) {
      const next: [string, string][] = [];
      for (const couple of couples) {
        const kids = 1 + Math.floor(random() * 3);
        for (let k = 0; k < kids && people.length < 200; k++) {
          const kid = add();
          links.push(...family(couple, [kid]));
          if (people.length < 199 && random() < 0.7) next.push([kid, add()]);
        }
        if (random() < 0.1 && people.length < 199) next.push([couple[0], add()]);
      }
      couples = next.length ? next : [[add(), add()]];
    }
    const project = tree(people, links);
    const started = performance.now();
    const layout = autoLayout(project);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(Object.keys(layout)).toHaveLength(people.length);
    expectChildrenBelow(layout, project);
    expectNoOverlaps(layout);
  });
});
