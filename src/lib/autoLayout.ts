import type { Project } from "../types";

/**
 * Size of a character card on the field (`.tb-card` in styles.css; a test checks they match).
 * Pets circle the portrait at the left edge and stick out of the card by `petOverhang`
 * to the left, top and bottom.
 */
export const LAYOUT_CARD = { width: 240, height: 80, petOverhang: 14 };
/** Clear space between neighbouring cards, pets included. */
export const LAYOUT_CARD_GAP = 50;
/** Distance between partners standing side by side (positions are top-left corners of cards). */
export const LAYOUT_PARTNER_STEP = LAYOUT_CARD.width + LAYOUT_CARD.petOverhang + LAYOUT_CARD_GAP;
/** Minimal distance between neighbouring groups in one row: a bit wider, so couples read as couples. */
export const LAYOUT_BLOCK_GAP = LAYOUT_PARTNER_STEP + LAYOUT_CARD_GAP;
/** Distance from the last card of one family to the first card of the next one. */
export const LAYOUT_FAMILY_GAP = LAYOUT_PARTNER_STEP + 3 * LAYOUT_CARD_GAP;
export const LAYOUT_ROW_STEP = LAYOUT_CARD.height + 2 * LAYOUT_CARD.petOverhang + LAYOUT_CARD_GAP;
const ORIGIN = { x: 100, y: 90 };
/** Pull towards the partner's row; stronger than two parent links so a couple lands in one row. */
const PARTNER_WEIGHT = 4;
const ORDER_SWEEPS = 12;
const POSITION_SWEEPS = 10;

type Positions = Record<string, { x: number; y: number }>;

interface Graph {
  ids: string[];
  order: Map<string, number>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  partners: Map<string, Set<string>>;
}

interface Block {
  members: string[];
  center: number;
}

/**
 * Arranges people into a tidy family tree: generations are rows, couples stand side by side
 * (a person married twice stands between the partners), children are centred under their parents,
 * separate families and single people do not overlap. Pets are not placed: they orbit their owners.
 */
export function autoLayout(project: Project): Positions {
  const graph = buildGraph(project);
  const generation = assignGenerations(graph);
  const positions: Positions = {};
  const singles: string[] = [];
  let left = ORIGIN.x;
  for (const component of components(graph)) {
    if (component.length === 1 && isAlone(graph, component[0])) {
      singles.push(component[0]);
      continue;
    }
    const local = layoutComponent(graph, component, generation);
    const xs = Object.values(local).map((point) => point.x);
    const shift = left - Math.min(...xs);
    for (const [id, point] of Object.entries(local)) positions[id] = { x: point.x + shift, y: point.y };
    left = Math.max(...xs) + shift + LAYOUT_FAMILY_GAP;
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(singles.length)));
  singles.forEach((id, index) => {
    positions[id] = {
      x: left + (index % columns) * LAYOUT_PARTNER_STEP,
      y: ORIGIN.y + Math.floor(index / columns) * LAYOUT_ROW_STEP,
    };
  });
  return positions;
}

function buildGraph(project: Project): Graph {
  const ids = project.characters.filter((character) => character.type !== "pet").map((character) => character.id);
  const order = new Map(ids.map((id, index) => [id, index]));
  const parents = new Map(ids.map((id) => [id, [] as string[]]));
  const children = new Map(ids.map((id) => [id, [] as string[]]));
  const partners = new Map(ids.map((id) => [id, new Set<string>()]));
  const seen = new Set<string>();
  const links = project.parentLinks.filter((link) => {
    const key = `${link.parentId}>${link.childId}`;
    if (!link.active || link.parentId === link.childId || !order.has(link.parentId) || !order.has(link.childId))
      return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dropped = cycleBreakingLinks(ids, links);
  const kept = links.filter((link) => !dropped.has(`${link.parentId}>${link.childId}`));
  kept.forEach((link) => {
    parents.get(link.childId)!.push(link.parentId);
    children.get(link.parentId)!.push(link.childId);
  });

  // Co-parents form a couple. Biological and adoptive parents of one child are separate couples.
  const byChild = new Map<string, { biological: string[]; adoptive: string[] }>();
  kept.forEach((link) => {
    const entry = byChild.get(link.childId) ?? { biological: [], adoptive: [] };
    (link.biological === "no" ? entry.adoptive : entry.biological).push(link.parentId);
    byChild.set(link.childId, entry);
  });
  const addPartners = (a: string, b: string) => {
    partners.get(a)!.add(b);
    partners.get(b)!.add(a);
  };
  byChild.forEach(({ biological, adoptive }) => {
    for (const group of [biological, adoptive])
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) addPartners(group[i], group[j]);
  });

  // A person without parents or children joins the row of someone they have a relationship with.
  const linked = (id: string) => parents.get(id)!.length > 0 || children.get(id)!.length > 0;
  const pairLinks = project.pairLinks.filter(
    (link) => link.aId !== link.bId && order.has(link.aId) && order.has(link.bId),
  );
  const strength = (link: (typeof pairLinks)[number], other: string) =>
    (link.labels.some((label) => label.active) ? 2 : 0) + (linked(other) ? 1 : 0);
  ids
    .filter((id) => !linked(id) && partners.get(id)!.size === 0)
    .forEach((id) => {
      const options = pairLinks
        .filter((link) => link.aId === id || link.bId === id)
        .map((link) => {
          const other = link.aId === id ? link.bId : link.aId;
          return { other, score: strength(link, other) };
        })
        .sort((a, b) => b.score - a.score || order.get(a.other)! - order.get(b.other)!);
      if (options[0]) addPartners(id, options[0].other);
    });

  return { ids, order, parents, children, partners };
}

/** Finds parent links that close a loop of ancestry, so the rest stays a proper tree of generations. */
function cycleBreakingLinks(ids: string[], links: { parentId: string; childId: string }[]): Set<string> {
  const next = new Map<string, string[]>();
  links.forEach((link) => next.set(link.parentId, [...(next.get(link.parentId) ?? []), link.childId]));
  const state = new Map<string, 1 | 2>();
  const dropped = new Set<string>();
  for (const start of ids) {
    if (state.has(start)) continue;
    const stack: { id: string; index: number }[] = [{ id: start, index: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const childIds = next.get(top.id) ?? [];
      if (top.index >= childIds.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const child = childIds[top.index++];
      const childState = state.get(child);
      if (childState === 1) dropped.add(`${top.id}>${child}`);
      else if (!childState) {
        state.set(child, 1);
        stack.push({ id: child, index: 0 });
      }
    }
  }
  return dropped;
}

/**
 * Rows: every child is below all of their parents. Starting from the longest line of ancestors,
 * each person moves to the row that keeps links short and partners in the same row.
 */
function assignGenerations(graph: Graph): Map<string, number> {
  const { ids, parents, children, partners } = graph;
  const generation = new Map<string, number>();
  const pending = new Map(ids.map((id) => [id, parents.get(id)!.length]));
  const queue = ids.filter((id) => pending.get(id) === 0);
  queue.forEach((id) => generation.set(id, 0));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const child of children.get(id)!) {
      generation.set(child, Math.max(generation.get(child) ?? 0, generation.get(id)! + 1));
      pending.set(child, pending.get(child)! - 1);
      if (pending.get(child) === 0) queue.push(child);
    }
  }

  // A person or a whole couple moves together: partners pulling at each other would otherwise stay stuck.
  const tryMove = (group: string[]) => {
    const inside = new Set(group);
    const current = generation.get(group[0])!;
    const outside = (list: Iterable<string>) => [...list].filter((id) => !inside.has(id));
    if (group.some((id) => parents.get(id)!.some((parent) => inside.has(parent)))) return false;
    const cost = (level: number) =>
      group.reduce((total, id) => {
        for (const parent of parents.get(id)!) total += level - generation.get(parent)! - 1;
        for (const child of children.get(id)!) total += generation.get(child)! - level - 1;
        for (const partner of outside(partners.get(id)!))
          total += PARTNER_WEIGHT * Math.abs(level - generation.get(partner)!);
        return total;
      }, 0);
    const above = group.flatMap((id) => parents.get(id)!.map((parent) => generation.get(parent)! + 1));
    const below = group.flatMap((id) => children.get(id)!.map((child) => generation.get(child)! - 1));
    const beside = group.flatMap((id) => outside(partners.get(id)!).map((partner) => generation.get(partner)!));
    const low = Math.max(-Infinity, ...above);
    const high = Math.min(Infinity, ...below);
    let best = current;
    let bestCost = cost(current);
    for (const level of [...above, ...below, ...beside]) {
      if (level < low || level > high) continue;
      const value = cost(level);
      if (value < bestCost || (value === bestCost && Math.abs(level - current) < Math.abs(best - current))) {
        best = level;
        bestCost = value;
      }
    }
    if (best === current) return false;
    group.forEach((id) => generation.set(id, best));
    return true;
  };
  const couples = () => {
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const start of ids) {
      if (seen.has(start)) continue;
      const level = generation.get(start)!;
      const group = [start];
      seen.add(start);
      for (let index = 0; index < group.length; index++)
        for (const other of partners.get(group[index])!)
          if (!seen.has(other) && generation.get(other) === level) {
            seen.add(other);
            group.push(other);
          }
      if (group.length > 1) result.push(group);
    }
    return result;
  };
  for (let sweep = 0; sweep < 200; sweep++) {
    let changed = false;
    for (const id of [...queue].reverse()) changed = tryMove([id]) || changed;
    for (const group of couples()) changed = tryMove(group) || changed;
    if (!changed) break;
  }

  for (const component of components(graph)) {
    const top = Math.min(...component.map((id) => generation.get(id)!));
    component.forEach((id) => generation.set(id, generation.get(id)! - top));
  }
  return generation;
}

/** Groups of people connected by parenthood or partnership, in the order of the character list. */
function components(graph: Graph): string[][] {
  const groupOf = new Map<string, number>();
  const result: string[][] = [];
  for (const start of graph.ids) {
    if (groupOf.has(start)) continue;
    const group = [start];
    groupOf.set(start, result.length);
    for (let index = 0; index < group.length; index++) {
      const id = group[index];
      for (const other of [...graph.parents.get(id)!, ...graph.children.get(id)!, ...graph.partners.get(id)!]) {
        if (groupOf.has(other)) continue;
        groupOf.set(other, result.length);
        group.push(other);
      }
    }
    result.push(group.sort((a, b) => graph.order.get(a)! - graph.order.get(b)!));
  }
  return result;
}

function isAlone(graph: Graph, id: string): boolean {
  return !graph.parents.get(id)!.length && !graph.children.get(id)!.length && !graph.partners.get(id)!.size;
}

function layoutComponent(graph: Graph, people: string[], generation: Map<string, number>): Positions {
  const rows = buildRows(graph, people, generation);
  orderRows(graph, rows);
  placeRows(graph, rows);
  const positions: Positions = {};
  rows.forEach((blocks, level) => {
    for (const block of blocks)
      memberOffsets(block).forEach((offset, index) => {
        positions[block.members[index]] = {
          x: Math.round(block.center + offset),
          y: ORIGIN.y + level * LAYOUT_ROW_STEP,
        };
      });
  });
  return positions;
}

/** Each row is a list of blocks; a block is a couple (or a chain of partners) kept side by side. */
function buildRows(graph: Graph, people: string[], generation: Map<string, number>): Block[][] {
  const depth = Math.max(...people.map((id) => generation.get(id)!));
  const rows: Block[][] = Array.from({ length: depth + 1 }, () => []);
  const placed = new Set<string>();
  for (const start of people) {
    if (placed.has(start)) continue;
    const level = generation.get(start)!;
    const sameRow = (id: string) => [...graph.partners.get(id)!].filter((other) => generation.get(other) === level);
    const members = [start];
    placed.add(start);
    for (let index = 0; index < members.length; index++)
      for (const other of sameRow(members[index]))
        if (!placed.has(other)) {
          placed.add(other);
          members.push(other);
        }
    rows[level].push({ members: chainOrder(members, sameRow, graph.order), center: 0 });
  }
  return rows;
}

/** A line of partners keeps its natural order: someone with two partners stands between them. */
function chainOrder(members: string[], neighbours: (id: string) => string[], order: Map<string, number>): string[] {
  if (members.length < 3) return members;
  const degree = (id: string) => neighbours(id).length;
  const byOrder = (a: string, b: string) => order.get(a)! - order.get(b)!;
  const edges = members.reduce((sum, id) => sum + degree(id), 0) / 2;
  if (edges === members.length - 1 && members.every((id) => degree(id) <= 2)) {
    const line = [members.filter((id) => degree(id) === 1).sort(byOrder)[0]];
    while (line.length < members.length) line.push(neighbours(line[line.length - 1]).find((id) => !line.includes(id))!);
    return line;
  }
  // Several partners of one person: that person in the middle, the others around.
  const center = [...members].sort((a, b) => degree(b) - degree(a) || byOrder(a, b))[0];
  const visit = [center];
  for (let index = 0; index < visit.length; index++)
    for (const other of [...neighbours(visit[index])].sort(byOrder)) if (!visit.includes(other)) visit.push(other);
  const line = [center];
  visit.slice(1).forEach((id, index) => (index % 2 ? line.unshift(id) : line.push(id)));
  return line;
}

/** Orders blocks in rows to keep children under parents and to cross as few lines as possible. */
function orderRows(graph: Graph, rows: Block[][]) {
  const index = new Map<string, number>();
  const reindex = () =>
    rows.forEach((blocks) => {
      let position = 0;
      for (const block of blocks) for (const id of block.members) index.set(id, position++);
    });
  const sortRow = (level: number, related: (id: string) => string[]) => {
    const blocks = rows[level];
    const keys = new Map<Block, number>();
    for (const block of blocks) {
      const known = block.members.map((id) => related(id).filter((other) => index.has(other)));
      const all = known.flat().map((other) => index.get(other)!);
      keys.set(block, all.length ? mean(all) : mean(block.members.map((id) => index.get(id) ?? 0)));
      // Turn the couple around if each partner is closer to their own relatives that way.
      if (block.members.length > 1) {
        const marks = known.map((list) => (list.length ? mean(list.map((other) => index.get(other)!)) : undefined));
        let inversions = 0;
        let agreements = 0;
        for (let i = 0; i < marks.length; i++)
          for (let j = i + 1; j < marks.length; j++) {
            if (marks[i] === undefined || marks[j] === undefined || marks[i] === marks[j]) continue;
            if (marks[i]! > marks[j]!) inversions++;
            else agreements++;
          }
        if (inversions > agreements) block.members.reverse();
      }
    }
    blocks.sort((a, b) => keys.get(a)! - keys.get(b)!);
    reindex();
  };
  const crossings = () => {
    let total = 0;
    for (let level = 0; level + 1 < rows.length; level++) {
      // One line per child from the middle of their parents: siblings never cross each other.
      const upper = new Set(rows[level].flatMap((block) => block.members));
      const lines: [number, number][] = [];
      for (const block of rows[level + 1])
        for (const child of block.members) {
          const own = graph.parents.get(child)!.filter((parent) => upper.has(parent));
          if (own.length) lines.push([mean(own.map((parent) => index.get(parent)!)), index.get(child)!]);
        }
      for (let i = 0; i < lines.length; i++)
        for (let j = i + 1; j < lines.length; j++)
          if ((lines[i][0] - lines[j][0]) * (lines[i][1] - lines[j][1]) < 0) total++;
    }
    return total;
  };

  reindex();
  for (let level = 1; level < rows.length; level++) sortRow(level, (id) => graph.parents.get(id)!);
  let best = rows.map((blocks) => blocks.map((block) => ({ ...block, members: [...block.members] })));
  let bestCrossings = crossings();
  for (let sweep = 0; sweep < ORDER_SWEEPS && bestCrossings > 0; sweep++) {
    if (sweep % 2 === 0) for (let level = rows.length - 2; level >= 0; level--) sortRow(level, childrenOf(graph));
    else for (let level = 1; level < rows.length; level++) sortRow(level, (id) => graph.parents.get(id)!);
    const value = crossings();
    if (value < bestCrossings) {
      bestCrossings = value;
      best = rows.map((blocks) => blocks.map((block) => ({ ...block, members: [...block.members] })));
    }
  }
  best.forEach((blocks, level) => (rows[level] = blocks));
}

function childrenOf(graph: Graph) {
  return (id: string) => graph.children.get(id)!;
}

function memberOffsets(block: Block): number[] {
  const half = ((block.members.length - 1) * LAYOUT_PARTNER_STEP) / 2;
  return block.members.map((_, index) => index * LAYOUT_PARTNER_STEP - half);
}

/**
 * Gives every block an x: children are centred under their parents and parents above their children,
 * while blocks keep their order and never come closer than the minimal gap.
 */
function placeRows(graph: Graph, rows: Block[][]) {
  const x = new Map<string, number>();
  const sync = (blocks: Block[]) =>
    blocks.forEach((block) =>
      memberOffsets(block).forEach((offset, index) => x.set(block.members[index], block.center + offset)),
    );
  const settle = (blocks: Block[], wishes: { sum: number; weight: number }[]) => {
    const desired = blocks.map((block, index) =>
      wishes[index].weight ? wishes[index].sum / wishes[index].weight : block.center,
    );
    const weights = wishes.map((wish) => wish.weight || 0.01);
    const gaps = blocks.map((block, index) =>
      index ? halfWidth(blocks[index - 1]) + LAYOUT_BLOCK_GAP + halfWidth(block) : 0,
    );
    fitInOrder(desired, weights, gaps).forEach((center, index) => (blocks[index].center = center));
    sync(blocks);
  };

  rows.forEach((blocks) => {
    let left = 0;
    blocks.forEach((block) => {
      block.center = left + halfWidth(block);
      left = block.center + halfWidth(block) + LAYOUT_BLOCK_GAP;
    });
    sync(blocks);
  });

  const fromParents = (block: Block) => {
    const wish = { sum: 0, weight: 0 };
    memberOffsets(block).forEach((offset, index) => {
      const placed = graph.parents.get(block.members[index])!.filter((id) => x.has(id));
      if (!placed.length) return;
      wish.sum += placed.reduce((sum, id) => sum + x.get(id)!, 0) / placed.length - offset;
      wish.weight += 1;
    });
    return wish;
  };
  const fromChildren = (block: Block) => {
    const wish = { sum: 0, weight: 0 };
    const offsets = new Map(memberOffsets(block).map((offset, index) => [block.members[index], offset]));
    const kids = new Set(block.members.flatMap((id) => graph.children.get(id)!));
    for (const child of kids) {
      const own = graph.parents.get(child)!.filter((id) => offsets.has(id));
      const middle = own.reduce((sum, id) => sum + offsets.get(id)!, 0) / own.length;
      wish.sum += x.get(child)! - middle;
      wish.weight += 1;
    }
    return wish;
  };
  const sweeps = () => {
    for (let sweep = 0; sweep < POSITION_SWEEPS; sweep++) {
      for (let level = 1; level < rows.length; level++) settle(rows[level], rows[level].map(fromParents));
      for (let level = rows.length - 2; level >= 0; level--) settle(rows[level], rows[level].map(fromChildren));
    }
  };
  // How far members of a block stand from their parents and their children from them.
  const strain = (block: Block, members: string[]) => {
    const at = new Map(memberOffsets(block).map((offset, index) => [members[index], block.center + offset]));
    let total = 0;
    for (const id of members) {
      const placed = graph.parents.get(id)!.filter((other) => x.has(other));
      if (placed.length) total += Math.abs(at.get(id)! - mean(placed.map((other) => x.get(other)!)));
      for (const child of graph.children.get(id)!) {
        const own = graph.parents.get(child)!.filter((other) => at.has(other));
        total += Math.abs(x.get(child)! - mean(own.map((other) => at.get(other)!))) / own.length;
      }
    }
    return total;
  };

  sweeps();
  let flipped = false;
  for (const blocks of rows)
    for (const block of blocks) {
      if (block.members.length < 2) continue;
      const reversed = [...block.members].reverse();
      if (strain(block, reversed) < strain(block, block.members) - 1) {
        block.members = reversed;
        flipped = true;
      }
    }
  if (flipped) {
    rows.forEach(sync);
    sweeps();
  }
  rows.forEach((blocks) => {
    blocks.forEach((block) => (block.center = Math.round(block.center)));
    sync(blocks);
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function halfWidth(block: Block): number {
  return ((block.members.length - 1) * LAYOUT_PARTNER_STEP) / 2;
}

/**
 * Closest positions to the wished ones (weighted least squares) that keep the order
 * and at least `gaps[i]` between item i-1 and item i.
 */
export function fitInOrder(desired: number[], weights: number[], gaps: number[]): number[] {
  const offsets: number[] = [];
  gaps.forEach((gap, index) => offsets.push(index ? offsets[index - 1] + gap : 0));
  const pools: { value: number; weight: number; size: number }[] = [];
  desired.forEach((wish, index) => {
    pools.push({ value: wish - offsets[index], weight: weights[index], size: 1 });
    while (pools.length > 1 && pools[pools.length - 2].value > pools[pools.length - 1].value) {
      const last = pools.pop()!;
      const previous = pools[pools.length - 1];
      const weight = previous.weight + last.weight;
      previous.value = (previous.value * previous.weight + last.value * last.weight) / weight;
      previous.weight = weight;
      previous.size += last.size;
    }
  });
  const result: number[] = [];
  for (const pool of pools) for (let i = 0; i < pool.size; i++) result.push(pool.value + offsets[result.length]);
  return result;
}
