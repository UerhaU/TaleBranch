import { GitBranch, Save } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import { lastStorageFailure } from "../../lib/storageDiagnostics";
import type { ProjectApi } from "../../hooks/projectApi";
import { APP_VERSION } from "../../version";

export function AboutDialog({ app, onClose }: { app: ProjectApi; onClose: () => void }) {
  const { t } = useI18n();
  const storedFailure = lastStorageFailure();
  const lastFailure =
    app.saveError && (!storedFailure || app.saveError.time > storedFailure.time) ? app.saveError : storedFailure;
  return (
    <Modal title={t("about")} subtitle={t("aboutSubtitle").replace("0.1.0", APP_VERSION)} onClose={onClose}>
      <div className="modal-body about-copy">
        <div className="about-mark">
          <GitBranch size={28} />
        </div>
        <p>{t("aboutText")}</p>
        <p className="offline-note">
          <Save size={16} /> {t("offline")}. {t("offlineExtra")}
        </p>
        {lastFailure && (
          <details className="storage-error-details">
            <summary>{t("lastStorageError")}</summary>
            <pre>{JSON.stringify(lastFailure, null, 2)}</pre>
          </details>
        )}
      </div>
    </Modal>
  );
}
