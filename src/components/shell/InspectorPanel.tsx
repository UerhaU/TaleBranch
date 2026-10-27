import type { Character } from "../../types";
import { Inspector } from "../Inspector";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** The selected character's card on the right, wired to the main screen windows. */
export function InspectorPanel({
  app,
  selected,
  dialogs,
  notify,
  onClose,
}: {
  app: ProjectApi;
  selected: Character;
  dialogs: Dialogs;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { project } = app;

  const onPhotoFile = async (file: File, stageName: string) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify(t("unsupportedImage"));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify(t("fileTooLarge"));
      return;
    }
    const characterId = selected.id;
    try {
      dialogs.open("photo", { original: await readAsDataUrl(file), stageName, characterId });
    } catch {
      notify(t("imageReadError"));
    }
  };

  const requestDelete = () => {
    dialogs.open("deleteCharacter", {
      character: selected,
      family: project.parentLinks.filter((link) => link.parentId === selected.id || link.childId === selected.id)
        .length,
      pairs: project.pairLinks.filter((link) => link.aId === selected.id || link.bId === selected.id).length,
      photos: selected.stages.filter((stage) => stage.photo).length,
    });
  };

  return (
    <Inspector
      character={selected}
      project={project}
      onClose={onClose}
      onEdit={() => dialogs.open("editCharacter", selected)}
      onDelete={requestDelete}
      onAddLink={(kind) => dialogs.open("link", { kind })}
      onPhoto={(file, stage) => void onPhotoFile(file, stage)}
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
