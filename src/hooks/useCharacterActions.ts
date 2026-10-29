import { useMemo, useRef, type RefObject } from "react";
import { LAYOUT_CARD, LAYOUT_PARTNER_STEP, LAYOUT_ROW_STEP } from "../lib/autoLayout";
import { inferPetOwner } from "../lib/pets";
import type { CharacterActions } from "../components/shell/CharacterMenu";
import type { FlowInstance } from "../components/shell/TreeCanvas";
import type { ProjectApi } from "./projectApi";
import type { Dialogs } from "./useDialogs";
import type { TreeView } from "./useTreeView";
import type { Project } from "../types";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** A free place for a new card one row above or below a character, without covering other cards. */
export function placeNear(project: Project, id: string, rows: number) {
  const origin = project.positions[id] ?? { x: 0, y: 0 };
  const y = origin.y + rows * LAYOUT_ROW_STEP;
  const taken = Object.values(project.positions);
  let x = origin.x;
  for (
    let step = 1;
    taken.some((p) => Math.abs(p.y - y) < LAYOUT_CARD.height && Math.abs(p.x - x) < LAYOUT_CARD.width + 20);
    step++
  )
    x = origin.x + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * LAYOUT_PARTNER_STEP;
  return { x, y };
}

/** Everything the right-click menu, the «⋯» menu and the quick «+» can do with one character. */
export function useCharacterActions({
  app,
  dialogs,
  view,
  flowInstance,
  notify,
  t,
}: {
  app: ProjectApi;
  dialogs: Dialogs;
  view: TreeView;
  flowInstance: RefObject<FlowInstance | null>;
  notify: (message: string) => void;
  t: (key: string) => string;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<string>(undefined);
  const { project } = app;

  const actions = useMemo<CharacterActions>(() => {
    const find = (id: string) => project.characters.find((item) => item.id === id);
    const nodeOf = (id: string) => {
      const character = find(id);
      return character?.type === "pet" ? (character.ownerIds?.[0] ?? inferPetOwner(character, project)) : id;
    };
    return {
      edit: (id) => {
        const character = find(id);
        if (!character) return;
        view.setSelectedId(id);
        dialogs.close("addCharacter");
        dialogs.open("editCharacter", character);
      },
      addChild: (id) => {
        view.setSelectedId(id);
        dialogs.close("editCharacter");
        dialogs.open("addCharacter", {
          type: "sim",
          relative: { id, as: "child" },
          position: placeNear(project, id, 1),
        });
      },
      addParent: (id) => {
        view.setSelectedId(id);
        dialogs.close("editCharacter");
        dialogs.open("addCharacter", {
          type: "sim",
          relative: { id, as: "parent" },
          position: placeNear(project, id, -1),
        });
      },
      addRelation: (id) => {
        dialogs.open("link", { kind: "pair", fromId: id });
      },
      photo: (id) => {
        view.setSelectedId(id);
        photoTarget.current = id;
        photoInput.current?.click();
      },
      showRelatives: (id) => {
        const ids = new Set([id]);
        for (const link of project.parentLinks) {
          if (link.parentId === id) ids.add(link.childId);
          if (link.childId === id) ids.add(link.parentId);
        }
        for (const pair of project.pairLinks) if (pair.aId === id || pair.bId === id) ids.add(pair.aId).add(pair.bId);
        view.setSelectedId(id);
        view.resetFilters();
        const nodes = [...new Set([...ids].map(nodeOf).filter((node): node is string => Boolean(node)))];
        window.setTimeout(
          () =>
            flowInstance.current?.fitView({ nodes: nodes.map((node) => ({ id: node })), duration: 400, maxZoom: 1 }),
          50,
        );
      },
      trash: (id) => {
        const character = find(id);
        if (!character) return;
        dialogs.open("deleteCharacter", {
          character,
          family: project.parentLinks.filter((link) => link.parentId === id || link.childId === id).length,
          pairs: project.pairLinks.filter((link) => link.aId === id || link.bId === id).length,
          photos: character.stages.filter((stage) => stage.photo).length,
        });
      },
    };
  }, [project, dialogs, view, flowInstance]);

  /** A picture chosen for the current life stage goes to the photo editor first. */
  const acceptPhoto = async (file: File | undefined, characterId = photoTarget.current, stageName?: string) => {
    const character = project.characters.find((item) => item.id === characterId);
    if (!file || !character) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify(t("unsupportedImage"));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify(t("fileTooLarge"));
      return;
    }
    try {
      dialogs.open("photo", {
        original: await readAsDataUrl(file),
        stageName: stageName ?? character.lifeStage,
        characterId: character.id,
      });
    } catch {
      notify(t("imageReadError"));
    }
  };

  return { actions, photoInput, acceptPhoto };
}
