import type { Character, Project } from "../types";

export function inferPetOwner(pet: Character, project: Project): string | undefined {
  const people = project.characters.filter((character) => character.type !== "pet");
  const explicitOwner = pet.ownerIds?.find((id) => people.some((character) => character.id === id));
  if (explicitOwner) return explicitOwner;

  const linkedOwner = project.pairLinks
    .filter((link) => link.aId === pet.id || link.bId === pet.id)
    .map((link) => (link.aId === pet.id ? link.bId : link.aId))
    .find((id) => people.some((character) => character.id === id));
  if (linkedOwner) return linkedOwner;

  const sameHousehold = pet.household ? people.filter((character) => character.household === pet.household) : [];
  return [...sameHousehold].sort(
    (a, b) => Math.abs(a.generation - pet.generation) - Math.abs(b.generation - pet.generation),
  )[0]?.id;
}
