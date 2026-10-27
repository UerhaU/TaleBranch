import { PermanentDeleteDialog } from "../PermanentDeleteDialog";
import { useI18n } from "../../i18n";
import type { PermanentDeleteDraft } from "../../hooks/useDialogs";

/** Picks the wording of the permanent delete confirmation for a character, the trash or the whole dynasty. */
export function PermanentDeletePrompt({
  draft,
  folderName,
  onConfirm,
  onClose,
}: {
  draft: PermanentDeleteDraft;
  folderName?: string;
  onConfirm: () => boolean | Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <PermanentDeleteDialog
      title={
        draft.kind === "dynasty"
          ? t("deleteDynastyTitle", { name: draft.name })
          : draft.kind === "character"
            ? t("purgeCharacterTitle", { name: draft.name })
            : t("emptyTrash")
      }
      description={
        draft.kind === "dynasty"
          ? folderName
            ? t("deleteFolderDynastyHint", { folder: folderName })
            : t("deleteDynastyHint", { name: draft.name })
          : draft.kind === "character"
            ? t("purgeCharacterHint", { name: draft.name })
            : t("emptyTrashHint", { count: draft.ids.length })
      }
      clearHistory={draft.kind !== "dynasty"}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
