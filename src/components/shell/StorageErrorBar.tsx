import { useI18n } from "../../i18n";
import { downloadRecoveryData } from "../../lib/storage";
import { storageFailureText } from "../../lib/storageDiagnostics";
import type { ProjectApi } from "../../hooks/projectApi";

/** Red bar under the top bar when the dynasty cannot be loaded or saved. */
export function StorageErrorBar({ app, onExport }: { app: ProjectApi; onExport: () => void }) {
  const { t } = useI18n();
  if (!(app.loadError || app.saveStatus === "error" || app.closeGuardError)) return null;
  return (
    <div className="storage-error" role="alert">
      <span>
        {app.saveStatus === "error" && app.saveError && !app.loadError
          ? app.folderName
            ? t(app.saveError.message === "FOLDER_CONFLICT" ? "folderConflict" : "folderSaveFailed")
            : storageFailureText(app.saveError, t)
          : t(
              app.loadError ? "loadFailedHint" : app.saveStatus === "error" ? "saveFailedHint" : "closeGuardFailedHint",
            )}
      </span>
      {app.loadError ? (
        <button className="button subtle" onClick={downloadRecoveryData}>
          {t("downloadRecovery")}
        </button>
      ) : (
        <>
          <button className="button subtle" onClick={() => app.forceSave()}>
            {t("retrySave")}
          </button>
          <button className="button subtle" onClick={onExport}>
            {t("exportProject")}
          </button>
        </>
      )}
      {app.saveStatus === "error" && app.saveError && (
        <details className="storage-error-details">
          <summary>{t("errorDetails")}</summary>
          <pre>{JSON.stringify(app.saveError, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
