import { HeartHandshake, RefreshCw } from "lucide-react";
import { Modal } from "../Modal";
import { useI18n } from "../../i18n";
import type { UtilityPanel } from "../../hooks/useDialogs";

const guideSteps = [
  ["01", "guideAddTitle", "guideAddText"],
  ["02", "guideLinkTitle", "guideLinkText"],
  ["03", "guideTreeTitle", "guideTreeText"],
  ["04", "guideExportTitle", "guideExportText"],
] as const;

/** Guide, updates and donation windows opened from the middle of the left panel. */
export function UtilityDialog({ panel, onClose }: { panel: UtilityPanel; onClose: () => void }) {
  const { t } = useI18n();
  if (panel === "guide")
    return (
      <Modal title={t("guide")} subtitle={t("guideSubtitle")} onClose={onClose}>
        <div className="modal-body utility-page guide-page">
          {guideSteps.map(([number, title, text]) => (
            <div key={number}>
              <span>{number}</span>
              <section>
                <strong>{t(title)}</strong>
                <p>{t(text)}</p>
              </section>
            </div>
          ))}
        </div>
      </Modal>
    );
  const updates = panel === "updates";
  return (
    <Modal
      title={t(updates ? "checkUpdates" : "donation")}
      subtitle={t(updates ? "updatesSubtitle" : "donationSubtitle")}
      onClose={onClose}
    >
      <div className="modal-body utility-placeholder">
        <span className="utility-icon">{updates ? <RefreshCw size={26} /> : <HeartHandshake size={26} />}</span>
        <span className="status-pill">{t("soon")}</span>
        <h3>{t(updates ? "githubUpdates" : "supportPage")}</h3>
        <p>{t(updates ? "githubUpdatesText" : "supportPageText")}</p>
      </div>
    </Modal>
  );
}
