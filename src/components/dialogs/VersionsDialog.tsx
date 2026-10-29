import { useState } from "react";
import { History } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import type { DynastyVersion } from "../../lib/dynastyStore";

/**
 * Saved copies of dynasty.json. For a damaged file the newest one is already chosen;
 * otherwise the user picks a version and confirms it below the list.
 */
export function VersionsDialog({
  title,
  hint,
  versions,
  damaged = false,
  formatDate,
  onRestore,
  onClose,
}: {
  title: string;
  hint: string;
  versions: DynastyVersion[];
  damaged?: boolean;
  formatDate: (version: DynastyVersion) => string;
  onRestore: (version: DynastyVersion) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<DynastyVersion | undefined>(damaged ? versions[0] : undefined);
  const [working, setWorking] = useState(false);
  const restore = async () => {
    if (!chosen || working) return;
    setWorking(true);
    try {
      await onRestore(chosen);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal title={title} subtitle={hint} onClose={onClose}>
      <div className="modal-body trash-list">
        {versions.map((version) => (
          <div key={version.name} aria-current={chosen === version ? "true" : undefined}>
            <History size={22} aria-hidden="true" />
            <div>
              <strong>{formatDate(version)}</strong>
              <small>{t("charactersCount", { count: version.characters })}</small>
            </div>
            <div className="trash-actions">
              <button
                className={`button ${chosen === version ? "primary" : "subtle"}`}
                aria-pressed={chosen === version}
                onClick={() => setChosen(version)}
              >
                {t("chooseVersion")}
              </button>
            </div>
          </div>
        ))}
        {!versions.length && (
          <div className="empty-modal">
            <History size={28} />
            <p>{t("noVersions")}</p>
          </div>
        )}
        {chosen && !damaged && <p role="note">{t("restoreVersionConfirm", { date: formatDate(chosen) })}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        {chosen && (
          <button className="button primary" disabled={working} onClick={() => void restore()}>
            <History size={16} /> {t("restoreVersion")}
          </button>
        )}
      </footer>
    </Modal>
  );
}
