import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode, type KeyboardEventHandler } from "react";
import { useI18n } from "../i18n";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  onKeyDown,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const root = dialog.current!;
    if (!root.contains(document.activeElement))
      (root.querySelector<HTMLElement>("[autofocus], input, button") ?? root).focus();
    const keydown = (event: KeyboardEvent) => {
      // A nested dialog owns keyboard input while it is open.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== root) return;
      if (event.key === "Escape") {
        if ((event.target as HTMLElement | null)?.closest("[data-escape-layer]")) return;
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) {
        event.preventDefault();
        root.focus();
      } else if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        className={`tb-modal modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t("appName")}</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("close")}>
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
