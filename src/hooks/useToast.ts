import { useCallback, useEffect, useRef, useState } from "react";

/** A short message at the bottom of the screen that hides itself after 5 seconds. */
export function useToast() {
  const [toast, setToast] = useState<string | undefined>();
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  return { toast, notify };
}
