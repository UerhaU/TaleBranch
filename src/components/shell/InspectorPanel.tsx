import type { Character } from "../../types";
import { Inspector } from "../Inspector";
import { CharacterEditor } from "../CharacterEditor";
import { useI18n } from "../../i18n";
import { makeId } from "../../lib/id";
import { validPetOwnerIds } from "../../lib/relationships";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { CharacterActions } from "./CharacterMenu";

/**
 * The right panel: the selected character, or the same panel in editing mode.
 * A new character is created here too, already linked when it came from «Add child» or «Add parent».
 */
export function InspectorPanel({
  app,
  selected,
  dialogs,
  actions,
  notify,
  onSelect,
  onPhoto,
  onClose,
}: {
  app: ProjectApi;
  selected?: Character;
  dialogs: Dialogs;
  actions: CharacterActions;
  notify: (message: string) => void;
  onSelect: (id: string | undefined) => void;
  onPhoto: (file: File, characterId: string, stageName: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { project } = app;
  const { addCharacter, editCharacter } = dialogs.state;

  if (addCharacter) {
    const relative = addCharacter.relative && project.characters.find((item) => item.id === addCharacter.relative!.id);
    return (
      <CharacterEditor
        key={`new:${addCharacter.relative?.id ?? ""}:${addCharacter.type}`}
        initialType={addCharacter.type}
        ownerCandidates={project.characters}
        initialLastName={relative?.type === "sim" ? relative.lastName : undefined}
        onClose={() => dialogs.close("addCharacter")}
        onSave={(character) => {
          if (character.type === "pet" && !validPetOwnerIds(character, project.characters).length) {
            notify(t("petOwnerRequired"));
            return;
          }
          const link = addCharacter.relative;
          if (link && character.type !== "pet" && relative) {
            // The character and its link are one step for «Undo».
            app.commit((draft) => {
              draft.characters.push(character);
              draft.positions[character.id] = addCharacter.position ?? { x: 0, y: 0 };
              draft.parentLinks.push({
                id: makeId("parent"),
                parentId: link.as === "child" ? link.id : character.id,
                childId: link.as === "child" ? character.id : link.id,
                kind: "Биологическое",
                parentRole: "Родитель",
                childRole: "Ребёнок",
                biological: "yes",
                active: true,
                comment: "",
              });
            });
          } else if (!app.addCharacter(character, addCharacter.position)) {
            notify(t("petOwnerRequired"));
            return;
          }
          onSelect(character.id);
          dialogs.close("addCharacter");
          notify(t("characterAdded"));
        }}
      />
    );
  }

  if (editCharacter) {
    return (
      <CharacterEditor
        key={`edit:${editCharacter.id}`}
        character={editCharacter}
        ownerCandidates={project.characters}
        onClose={() => dialogs.close("editCharacter")}
        onSave={(character) => {
          if (!app.updateCharacter(character.id, character)) {
            notify(t("petOwnerRequired"));
            return;
          }
          dialogs.close("editCharacter");
          notify(t("profileUpdated"));
        }}
      />
    );
  }

  if (!selected) return null;
  return (
    <Inspector
      character={selected}
      project={project}
      actions={actions}
      onSelect={onSelect}
      onClose={onClose}
      onEdit={() => actions.edit(selected.id)}
      onDelete={() => actions.trash(selected.id)}
      onAddLink={(kind) => dialogs.open("link", { kind, fromId: selected.id })}
      onPhoto={(file, stage) => onPhoto(file, selected.id, stage)}
      onLifeStage={(lifeStage) => app.updateCharacter(selected.id, { lifeStage })}
      onPasteError={() => notify(t("clipboardNoImage"))}
      onEditPhoto={(stageName) => {
        const photo = selected.stages.find((stage) => stage.name === stageName)?.photo;
        if (photo)
          dialogs.open("photo", {
            original: photo.original,
            stageName,
            characterId: selected.id,
            transform: photo.transform,
          });
      }}
      onRemovePhoto={(stageName) =>
        dialogs.open("confirm", {
          title: t("removePhoto"),
          run: () => {
            app.updateCharacter(selected.id, {
              stages: selected.stages.map((stage) =>
                stage.name === stageName ? { ...stage, photo: undefined } : stage,
              ),
            });
          },
        })
      }
      onEditLink={(edit) => dialogs.open("link", { kind: edit.kind, editing: edit })}
      onRemoveLink={(kind, id, labelId) =>
        dialogs.open("confirm", {
          title: t("removeConnection"),
          run: () => {
            if (kind === "pair" && labelId) app.removeRelationship(id, labelId);
            else app.removeLink(kind, id);
          },
        })
      }
    />
  );
}
