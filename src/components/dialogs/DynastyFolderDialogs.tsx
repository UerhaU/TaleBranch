import { FolderOpen, Plus } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import { supportsDynastyFolders } from "../../lib/folderStorage";
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
        {!supportsDynastyFolders() && <p role="note">{t("folderUnsupported")}</p>}
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

/** Choosing where an imported dynasty file is saved. */
export function ImportDynastyDialog({ files, name }: { files: DynastyFiles; name: string }) {
  const { t } = useI18n();
  return (
    <Modal title={t("import")} subtitle={name} onClose={files.cancelImport}>
      <div className="modal-body form-stack">
        <p>{t("importFolderHint")}</p>
        <button
          className="button subtle"
          disabled={files.choosingDirectory}
          onClick={() => void files.chooseDirectory()}
        >
          <FolderOpen size={16} /> {files.chosenDirectoryName ?? t("chooseDynastyFolder")}
        </button>
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={files.cancelImport}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          disabled={!files.chosenDirectoryName || files.choosingDirectory}
          onClick={() => void files.workWithFolder("import")}
        >
          {t("import")}
        </button>
      </footer>
    </Modal>
  );
}
