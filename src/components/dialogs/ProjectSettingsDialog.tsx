import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";

export function ProjectSettingsDialog({
  app,
  onClose,
  onDeleteDynasty,
}: {
  app: ProjectApi;
  onClose: () => void;
  onDeleteDynasty: () => void;
}) {
  const { t } = useI18n();
  const [projectDetails, setProjectDetails] = useState(() => ({
    name: app.project.name,
    description: app.project.description,
  }));
  return (
    <Modal title={t("projectSettings")} onClose={onClose}>
      <div className="modal-body form-stack">
        <label className="field">
          <span>{t("projectName")}</span>
          <input
            autoFocus
            value={projectDetails.name}
            onChange={(event) => setProjectDetails({ ...projectDetails, name: event.target.value })}
          />
        </label>
        <label className="field">
          <span>{t("projectDescription")}</span>
          <textarea
            rows={4}
            value={projectDetails.description}
            onChange={(event) => setProjectDetails({ ...projectDetails, description: event.target.value })}
          />
        </label>
      </div>
      <footer className="modal-footer dynasty-settings-footer">
        <button className="button ghost danger-text" disabled={app.loadError} onClick={onDeleteDynasty}>
          <Trash2 size={16} /> {t("deleteDynasty")}
        </button>
        <button className="button ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          disabled={!projectDetails.name.trim()}
          onClick={() => {
            app.commit((draft) => {
              Object.assign(draft, projectDetails, { name: projectDetails.name.trim() });
            });
            onClose();
          }}
        >
          {t("save")}
        </button>
      </footer>
    </Modal>
  );
}
