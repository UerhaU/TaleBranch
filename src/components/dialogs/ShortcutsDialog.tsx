import { Modal } from "../Modal";
import { useI18n } from "../../i18n";

/** The keys of the main screen, as listed in «Help → Keyboard shortcuts». */
export const shortcutList: Array<[string[], string]> = [
  [["Ctrl", "K"], "kbSearch"],
  [["Ctrl", "Z"], "kbUndo"],
  [["Ctrl", "Y"], "kbRedo"],
  [["N"], "kbNewCharacter"],
  [["L"], "kbNewLink"],
  [["F"], "showAll"],
  [["Enter"], "kbEdit"],
  [["Delete"], "kbDelete"],
  [["Esc"], "kbClose"],
  [["Ctrl", ","], "settings"],
  [["Ctrl", "S"], "kbSave"],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t("shortcuts")} onClose={onClose}>
      <div className="modal-body">
        <dl className="tb-shortcuts">
          {shortcutList.map(([keys, label]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
