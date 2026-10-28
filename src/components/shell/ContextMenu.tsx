import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A menu at the mouse pointer (right click). It stays inside the window,
 * closes on Escape, on a click elsewhere or when the tree is scrolled,
 * and the arrow keys move between its items.
 */
export function ContextMenu({
  x,
  y,
  label,
  onClose,
  children,
}: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const menu = root.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPlace({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
    const previous = document.activeElement;
    menu.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [x, y]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Tab") return;
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      items[(index + step + items.length) % items.length].focus();
    };
    const onWheel = () => close.current();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("blur", onWheel);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("blur", onWheel);
    };
  }, []);

  return (
    <div
      ref={root}
      className="tb-menu tb-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: place.left, top: place.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
