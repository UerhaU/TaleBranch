import { X } from "lucide-react";
import { useI18n } from "../../i18n";

/** Message about a failed folder operation, closed by the user. */
export function FolderErrorBar({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="folder-error" role="alert">
      <span>{message}</span>
      <button className="button ghost" onClick={onClose} aria-label={t("close")}>
        <X size={16} />
      </button>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <i />
      <span>{message}</span>
    </div>
  );
}
