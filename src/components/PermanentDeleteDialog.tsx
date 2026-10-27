import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "../i18n";
import { Modal } from "./Modal";

export function PermanentDeleteDialog({
  title,
  description,
  clearHistory,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  clearHistory: boolean;
  onClose: () => void;
  onConfirm: () => boolean | Promise<boolean>;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = () => {
    if (pending) return;
    const result = onConfirm();
    const finish = (ok: boolean) => {
      setPending(false);
      if (ok) onClose();
      else setFailed(true);
    };
    if (result instanceof Promise) {
      setPending(true);
      void result.then(finish).catch(() => finish(false));
    } else finish(result);
  };
  return (
    <Modal title={title} subtitle={t("irreversibleAction")} onClose={onClose}>
      <div className="modal-body form-stack irreversible-copy">
        <p>{description}</p>
        {clearHistory && <p>{t("purgeHistoryHint")}</p>}
        {failed && <p role="alert">{t("deleteFailed")}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button ghost" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </button>
        <button className="button danger" disabled={pending} onClick={confirm}>
          <Trash2 size={16} /> {t("deletePermanently")}
        </button>
      </footer>
    </Modal>
  );
}
