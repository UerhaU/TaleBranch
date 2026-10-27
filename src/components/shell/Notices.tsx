import { Sparkles, X } from "lucide-react";
import { useI18n } from "../../i18n";

/** Message about a failed folder operation, closed by the user. */
export function FolderErrorBar({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="tb-folder-error folder-error" role="alert">
      <span>{message}</span>
      <button className="tb-icon-btn" onClick={onClose} aria-label={t("close")} title={t("close")}>
        <X size={16} />
      </button>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="tb-toast toast" role="status" aria-live="polite">
      <Sparkles size={17} />
      <span>{message}</span>
    </div>
  );
}
