import { ArchiveRestore } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import type { DeleteDraft } from "../../hooks/useDialogs";

/** Confirmation before a character goes to the trash. */
export function DeleteCharacterDialog({
  draft,
  onConfirm,
  onClose,
}: {
  draft: DeleteDraft;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={t("deleteTitle", { name: draft.character.displayName })} subtitle={t("deleteHint")} onClose={onClose}>
      <div className="modal-body delete-summary">
        <div>
          <strong>{draft.family}</strong>
          <span>{t("familyLinksCount")}</span>
        </div>
        <div>
          <strong>{draft.pairs}</strong>
          <span>{t("personalLinksCount")}</span>
        </div>
        <div>
          <strong>{draft.photos}</strong>
          <span>{t("photosCount")}</span>
        </div>
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button className="button danger" onClick={onConfirm}>
          <ArchiveRestore size={16} /> {t("moveToTrash")}
        </button>
      </footer>
    </Modal>
  );
}
