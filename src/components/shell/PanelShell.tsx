import { useEffect, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../i18n";
import { displayColor } from "../../lib/colors";
import { readPreference, writePreference } from "../../lib/preferences";

const widthKey = "dynasty-chronicles:panel-width";
const MIN_WIDTH = 360;
const MAX_WIDTH = 560;

function setWidth(width: number) {
  const value = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
  document.documentElement.style.setProperty("--tb-inspector-width", `${value}px`);
  return value;
}

/** Drag the left edge of the panel to make it wider (up to 560 px); arrow keys work too. */
function ResizeHandle() {
  const { t } = useI18n();
  useEffect(() => {
    const saved = Number(readPreference(widthKey));
    if (saved) setWidth(saved);
  }, []);
  const current = () => document.querySelector(".tb-inspector")?.getBoundingClientRect().width ?? MIN_WIDTH;
  const zoom = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--tb-ui-zoom")) || 1;
  return (
    <div
      className="tb-panel-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resizePanel")}
      title={t("resizePanel")}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = current() / zoom();
        const move = (moveEvent: PointerEvent) => setWidth(startWidth + (startX - moveEvent.clientX) / zoom());
        const up = (upEvent: PointerEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          writePreference(widthKey, String(setWidth(startWidth + (startX - upEvent.clientX) / zoom())));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const width = current() / zoom() + (event.key === "ArrowLeft" ? 20 : -20);
        writePreference(widthKey, String(setWidth(width)));
      }}
    />
  );
}

/** The floating right panel: colored cover with the close button, then the content. */
export function PanelShell({
  className = "",
  color,
  label,
  closeLabel,
  onClose,
  children,
}: {
  className?: string;
  color: string;
  label: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      className={`tb-island tb-inspector tb-panel ${className}`}
      aria-label={label}
      style={{ "--pc": displayColor(color) } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // A catalog list or a menu inside the panel closes first.
        if ((event.target as HTMLElement | null)?.closest("[data-escape-layer]")) return;
        event.preventDefault();
        onClose();
      }}
    >
      <ResizeHandle />
      <div className="tb-panel-cover">
        <button className="tb-icon-btn tb-panel-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X size={18} />
        </button>
      </div>
      {children}
    </aside>
  );
}
