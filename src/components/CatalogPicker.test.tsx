// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { GameIcon } from "./CatalogPicker";

it("uses a placeholder for an unavailable local icon and can show a different icon later", () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); const root = createRoot(container);
  try {
    act(() => root.render(<GameIcon entry={{ icon: "missing.png" }} />));
    expect(container.querySelector("img")?.src).toContain("missing.png");
    act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull(); expect(container.querySelector("svg")).not.toBeNull();
    act(() => root.render(<GameIcon entry={{ icon: "another.png" }} />));
    expect(container.querySelector("img")?.src).toContain("another.png");
  } finally { act(() => root.unmount()); }
});
