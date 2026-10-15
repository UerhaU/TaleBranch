import type { PairLink, Project, RelationshipDirection } from "../types";
import { normalizePair } from "./project";

export function reverseDirection(direction: RelationshipDirection): RelationshipDirection {
  return direction === "a-to-b" ? "b-to-a" : direction === "b-to-a" ? "a-to-b" : "mutual";
}

// Directions are relative to the stored pair, rather than the order in the form.
export function normalizePairLink(link: PairLink): PairLink {
  const [aId, bId] = normalizePair(link.aId, link.bId);
  return { ...link, aId, bId, labels: link.labels.map((label) => ({
    ...label, direction: aId === link.aId ? label.direction : reverseDirection(label.direction),
  })) };
}

export function moveCharacterToTrash(project: Project, id: string): void {
  const character = project.characters.find((item) => item.id === id);
  if (!character) return;
  const archive = project.trashLinks ??= { parentLinks: [], pairLinks: [], positions: {} };
  archive.parentLinks.push(...project.parentLinks.filter((link) => link.parentId === id || link.childId === id));
  archive.pairLinks.push(...project.pairLinks.filter((link) => link.aId === id || link.bId === id));
  if (project.positions[id]) archive.positions[id] = project.positions[id];
  project.trashedCharacters.unshift(character);
  project.characters = project.characters.filter((item) => item.id !== id);
  project.parentLinks = project.parentLinks.filter((link) => link.parentId !== id && link.childId !== id);
  project.pairLinks = project.pairLinks.filter((link) => link.aId !== id && link.bId !== id);
  delete project.positions[id];
}

export function restoreTrashedCharacter(project: Project, id: string): void {
  const character = project.trashedCharacters.find((item) => item.id === id);
  if (!character) return;
  project.characters.push(character);
  project.trashedCharacters = project.trashedCharacters.filter((item) => item.id !== id);
  project.positions[id] = project.trashLinks?.positions[id] ?? { x: 180, y: 180 };
  const archive = project.trashLinks;
  if (!archive) return;
  const available = new Set(project.characters.map((item) => item.id));
  // Keep connections to characters still in trash until both ends are restored.
  archive.parentLinks = archive.parentLinks.filter((link) => {
    if (!available.has(link.parentId) || !available.has(link.childId)) return true;
    if (!project.parentLinks.some((item) => item.id === link.id)) project.parentLinks.push(link);
    return false;
  });
  archive.pairLinks = archive.pairLinks.filter((link) => {
    if (!available.has(link.aId) || !available.has(link.bId)) return true;
    const existing = project.pairLinks.find((item) => item.aId === link.aId && item.bId === link.bId);
    if (existing) existing.labels.push(...link.labels.filter((label) => !existing.labels.some((item) => item.id === label.id)));
    else project.pairLinks.push(link);
    return false;
  });
  delete archive.positions[id];
}
