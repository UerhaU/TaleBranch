import { ArchiveRestore, Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { Avatar } from "../CharacterNode";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { PermanentDeleteDraft } from "../../hooks/useDialogs";

export function TrashDialog({
  app,
  notify,
  onPermanentDelete,
  onClose,
}: {
  app: ProjectApi;
  notify: (message: string) => void;
  onPermanentDelete: (draft: PermanentDeleteDraft) => void;
  onClose: () => void;
}) {
  const { t, valueLabel } = useI18n();
  const { project } = app;
  return (
    <Modal title={t("projectTrash")} subtitle={t("trashHint")} onClose={onClose}>
      <div className="modal-body trash-list">
        {project.trashedCharacters.map((character) => (
          <div key={character.id}>
            <Avatar character={character} size={40} />
            <div>
              <strong>{character.displayName}</strong>
              <small>{valueLabel(character.lifeStage)}</small>
            </div>
            <div className="trash-actions">
              <button
                className="button subtle"
                onClick={() => {
                  app.restoreCharacter(character.id);
                  notify(t("restored"));
                }}
              >
                {t("restore")}
              </button>
              <button
                className="button ghost danger-text"
                aria-label={t("purgeCharacterTitle", { name: character.displayName })}
                onClick={() =>
                  onPermanentDelete({
                    kind: "character",
                    projectId: project.id,
                    id: character.id,
                    name: character.displayName,
                  })
                }
              >
                <Trash2 size={15} /> {t("deletePermanently")}
              </button>
            </div>
          </div>
        ))}
        {!project.trashedCharacters.length && (
          <div className="empty-modal">
            <ArchiveRestore size={28} />
            <p>{t("trashEmpty")}</p>
          </div>
        )}
      </div>
      {!!project.trashedCharacters.length && (
        <footer className="modal-footer">
          <button
            className="button danger"
            onClick={() =>
              onPermanentDelete({
                kind: "trash",
                projectId: project.id,
                ids: project.trashedCharacters.map((item) => item.id),
              })
            }
          >
            <Trash2 size={16} /> {t("emptyTrash")}
          </button>
        </footer>
      )}
    </Modal>
  );
}
