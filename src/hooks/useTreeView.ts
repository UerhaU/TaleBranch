import { useCallback, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { CharacterNodeData } from "../components/CharacterNode";
import { useI18n } from "../i18n";
import { inferPetOwner } from "../lib/pets";
import type { Character, CharacterStatus, Project } from "../types";

/** Selection, search and filters of the tree, plus the nodes and lines they produce. */
export function useTreeView(project: Project) {
  const { t, valueLabel } = useI18n();
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => project.characters.find((item) => item.id === "char_vera")?.id ?? project.characters[0]?.id,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CharacterStatus | "all">("all");
  const [showParents, setShowParents] = useState(true);
  const [showRelations, setShowRelations] = useState(true);
  const resetFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
  }, []);

  const selected = project.characters.find((character) => character.id === selectedId);

  const visibleCharacters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return project.characters.filter((character) => {
      const matchesSearch =
        !query ||
        [character.displayName, ...character.aliases, ...character.tags]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query);
      const matchesStatus = statusFilter === "all" || character.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [project.characters, search, statusFilter]);

  const visiblePeople = useMemo(() => {
    const directlyVisible = new Set(
      visibleCharacters.filter((character) => character.type !== "pet").map((character) => character.id),
    );
    visibleCharacters
      .filter((character) => character.type === "pet")
      .forEach((pet) => {
        const ownerIds = pet.ownerIds?.length ? pet.ownerIds : [inferPetOwner(pet, project)];
        ownerIds.forEach((id) => {
          if (id) directlyVisible.add(id);
        });
      });
    return project.characters.filter((character) => character.type !== "pet" && directlyVisible.has(character.id));
  }, [visibleCharacters, project]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((character) => character.id)), [visiblePeople]);
  const petsByOwner = useMemo(() => {
    const grouped = new Map<string, Character[]>();
    visibleCharacters
      .filter((character) => character.type === "pet")
      .forEach((pet) => {
        const ownerIds = pet.ownerIds?.length ? pet.ownerIds : [inferPetOwner(pet, project)];
        ownerIds.forEach((ownerId) => {
          if (ownerId) grouped.set(ownerId, [...(grouped.get(ownerId) ?? []), pet]);
        });
      });
    return grouped;
  }, [project, visibleCharacters]);

  const nodes = useMemo<Node<CharacterNodeData>[]>(
    () =>
      visiblePeople.map((character) => {
        const pets = petsByOwner.get(character.id) ?? [];
        const selected = selectedId === character.id || pets.some((pet) => pet.id === selectedId);
        return {
          id: character.id,
          type: "character",
          position: project.positions[character.id] ?? { x: 100, y: 100 },
          data: {
            character,
            pets,
            selected,
            selectedPetId: selectedId,
            onOpen: setSelectedId,
          },
          selected,
        };
      }),
    [visiblePeople, petsByOwner, project.positions, selectedId],
  );

  const edges = useMemo<Edge[]>(() => {
    const familyLinks = showParents
      ? project.parentLinks.filter(
          (link) => link.active && visibleIds.has(link.parentId) && visibleIds.has(link.childId),
        )
      : [];
    const parentsOf = new Map<string, string[]>();
    familyLinks.forEach((link) => parentsOf.set(link.childId, [...(parentsOf.get(link.childId) ?? []), link.parentId]));
    const familyEdges: Edge[] = familyLinks.map((link) => {
      const parents = parentsOf.get(link.childId)!;
      const coParentId = parents.length === 2 ? parents.find((id) => id !== link.parentId) : undefined;
      return {
        id: link.id,
        source: link.parentId,
        target: link.childId,
        type: "family",
        className: "family-edge",
        data: { coParentId, drawsShared: parents[0] === link.parentId },
        style: { stroke: "var(--tb-kin-line)", strokeWidth: 2.2 },
      };
    });
    const personalEdges: Edge[] = showRelations
      ? project.pairLinks
          .filter((pair) => pair.labels.length && visibleIds.has(pair.aId) && visibleIds.has(pair.bId))
          .map((pair) => {
            const shown = pair.labels.find((label) => label.active) ?? pair.labels[0];
            return {
              id: `relationship:${pair.id}`,
              source: pair.aId,
              target: pair.bId,
              type: "relationship",
              className: "personal-edge",
              data: {
                text: pair.labels
                  .map(
                    (label) =>
                      `${valueLabel(label.name)}${label.publicity === "secret" ? t("secretSuffix") : ""}${!label.active ? ` · ${t("endedConnection")}` : ""}`,
                  )
                  .join(" / "),
                icon: shown.icon,
                ended: pair.labels.every((label) => !label.active),
                toSource: pair.labels.some((label) => label.direction === "b-to-a"),
                toTarget: pair.labels.some((label) => label.direction === "a-to-b"),
              },
              ariaLabel: pair.labels.map((label) => valueLabel(label.name)).join(", "),
            };
          })
      : [];
    return [...familyEdges, ...personalEdges];
  }, [project.parentLinks, project.pairLinks, showParents, showRelations, visibleIds, valueLabel, t]);

  return {
    selectedId,
    setSelectedId,
    selected,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    showParents,
    setShowParents,
    showRelations,
    setShowRelations,
    resetFilters,
    visibleCharacters,
    visiblePeople,
    nodes,
    edges,
  };
}

export type TreeView = ReturnType<typeof useTreeView>;
