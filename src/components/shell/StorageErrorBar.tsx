import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";

/** Red island under the top capsule when the dynasty cannot be loaded or saved. */
export function StorageErrorBar({ app, onExport }: { app: ProjectApi; onExport: () => void }) {
  const { t } = useI18n();
  if (!(app.saveStatus === "error" || app.closeGuardError)) return null;
  return (
    <div className="tb-island tb-error-banner storage-error" role="alert">
      <span>
        {app.saveStatus === "error" && app.saveError
          ? t(app.saveError.message === "FOLDER_CONFLICT" ? "folderConflict" : "folderSaveFailed")
          : t(app.saveStatus === "error" ? "saveFailedHint" : "closeGuardFailedHint")}
      </span>
      <button className="button subtle" onClick={() => app.forceSave()}>
        {t("retrySave")}
      </button>
      <button className="button subtle" onClick={onExport}>
        {t("exportProject")}
      </button>
      {app.saveStatus === "error" && app.saveError && (
        <details className="storage-error-details">
          <summary>{t("errorDetails")}</summary>
          <pre>{JSON.stringify(app.saveError, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
