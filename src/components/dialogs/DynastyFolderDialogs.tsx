import { useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { PermanentDeleteDialog } from "../PermanentDeleteDialog";
import { useI18n } from "../../i18n";
import type { DynastyFiles } from "../../hooks/useDynastyFiles";

/** Choosing where a new dynasty is created. */
export function NewDynastyDialog({ files }: { files: DynastyFiles }) {
  const { t } = useI18n();
  const name = files.newProjectName ?? "";
  return (
    <Modal title={t("newProject")} subtitle={t("newProjectHint")} onClose={files.cancelNewProject}>
      <div className="modal-body form-stack">
        <label className="field">
          <span>{t("projectName")}</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => files.setNewProjectName(event.target.value)}
            placeholder={t("projectNameExample")}
            onKeyDown={(event) => event.key === "Enter" && files.createNewProject()}
          />
        </label>
        <p>{t("folderHint")}</p>
        <button
          className="button subtle"
          disabled={files.choosingDirectory}
          onClick={() => void files.chooseDirectory()}
        >
          <FolderOpen size={16} /> {files.chosenDirectoryName ?? t("chooseDynastyFolder")}
        </button>
        {!files.supported && <p role="note">{t("folderUnsupported")}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={files.cancelNewProject}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          onClick={files.createNewProject}
          disabled={!name.trim() || !files.chosenDirectoryName || files.choosingDirectory}
        >
          <Plus size={16} /> {t("create")}
        </button>
      </footer>
    </Modal>
  );
}

/** Choosing where an imported file or an old browser record is saved as a folder. */
export function ImportDynastyDialog({ files, name }: { files: DynastyFiles; name: string }) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const transfer = Boolean(files.pendingLegacyId);
  if (confirmDelete)
    return (
      <PermanentDeleteDialog
        title={t("deleteBrowserRecordTitle", { name })}
        description={t("deleteBrowserRecordHint", { name })}
        clearHistory={false}
        onClose={() => setConfirmDelete(false)}
        onConfirm={files.deleteLegacy}
      />
    );
  return (
    <Modal title={t(transfer ? "saveDynastyFolder" : "import")} subtitle={name} onClose={files.cancelImport}>
      <div className="modal-body form-stack">
        <p>{t(transfer ? "transferFolderHint" : "importFolderHint")}</p>
        <button
          className="button subtle"
          disabled={files.choosingDirectory}
          onClick={() => void files.chooseDirectory()}
        >
          <FolderOpen size={16} /> {files.chosenDirectoryName ?? t("chooseDynastyFolder")}
        </button>
      </div>
      <footer className="modal-footer">
        {transfer && (
          <button className="button danger-text ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> {t("deleteBrowserRecord")}
          </button>
        )}
        <button className="button ghost" onClick={files.cancelImport}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          disabled={!files.chosenDirectoryName || files.choosingDirectory}
          onClick={() => void files.workWithFolder("import")}
        >
          {t(transfer ? "transferDynasty" : "import")}
        </button>
      </footer>
    </Modal>
  );
}
