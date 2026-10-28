import { LinkDialog } from "../LinkDialog";
import { Modal } from "../Modal";
import { PhotoEditor } from "../PhotoEditor";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { PhotoTransform } from "../../types";

/** Windows for links and photos, plus the undoable confirmation. */
export function CharacterDialogs({
  app,
  dialogs,
  selectedId,
  notify,
}: {
  app: ProjectApi;
  dialogs: Dialogs;
  selectedId?: string;
  notify: (message: string) => void;
}) {
  const { t } = useI18n();
  const { project } = app;
  const { link, photo, confirm } = dialogs.state;

  const savePhoto = (edited: string, transform: PhotoTransform) => {
    if (!photo) return;
    const character = project.characters.find((item) => item.id === photo.characterId);
    if (!character) return;
    const stages = character.stages.map((stage) =>
      stage.name === photo.stageName
        ? {
            ...stage,
            photo: { original: photo.original, edited, transform, updatedAt: new Date().toISOString() },
          }
        : stage,
    );
    app.updateCharacter(character.id, { stages });
    dialogs.close("photo");
    notify(t("photoSaved", { stage: photo.stageName }));
  };

  return (
    <>
      {link && (
        <LinkDialog
          project={project}
          selectedId={link.fromId ?? selectedId}
          initialTo={link.toId}
          initialKind={link.kind}
          editing={link.editing}
          onClose={() => dialogs.close("link")}
          onParent={(parentLink) => {
            app.addParentLink(parentLink);
            dialogs.close("link");
            notify(t(link.editing ? "connectionUpdated" : "familyAdded"));
          }}
          onPair={(pairLink) => {
            app.addPairLink(pairLink);
            dialogs.close("link");
            notify(t(link.editing ? "connectionUpdated" : "relationAdded"));
          }}
        />
      )}
      {photo && (
        <PhotoEditor
          source={photo.original}
          initialTransform={photo.transform}
          onClose={() => dialogs.close("photo")}
          onSave={savePhoto}
        />
      )}
      {confirm && (
        <Modal title={confirm.title} subtitle={t("canUndoAction")} onClose={() => dialogs.close("confirm")}>
          <footer className="modal-footer">
            <button className="button ghost" onClick={() => dialogs.close("confirm")}>
              {t("cancel")}
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirm.run();
                dialogs.close("confirm");
              }}
            >
              {t("confirmAction")}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
