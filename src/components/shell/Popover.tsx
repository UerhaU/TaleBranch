import { useEffect, useRef, type ReactNode } from "react";

/**
 * A button with a menu that floats above the tree. The menu closes on Escape
 * and on a click anywhere outside of it.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  placement = "down",
  align = "start",
  className = "",
  menuClassName = "",
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  placement?: "up" | "down";
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);
  return (
    <div className={`tb-popover ${className}`} ref={root}>
      {trigger}
      {open && (
        <div className={`tb-menu ${placement} align-${align} ${menuClassName}`} role="menu" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
