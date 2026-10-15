// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "./useProject";
import { createEmptyProject } from "../lib/project";
import { loadProject } from "../lib/storage";

const desktop = vi.hoisted(() => ({
  active: false, close: undefined as ((event: { preventDefault: () => void }) => void) | undefined,
  stop: vi.fn(), register: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => desktop.active }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onCloseRequested: desktop.register }) }));

let app: ReturnType<typeof useProject>;
let root: Root;
function Harness() { app = useProject(); return null; }

beforeEach(() => {
  vi.useFakeTimers();
  desktop.active = false; desktop.close = undefined; desktop.stop.mockReset();
  desktop.register.mockReset().mockImplementation((handler) => { desktop.close = handler; return Promise.resolve(desktop.stop); });
  localStorage.clear();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
});
afterEach(() => { vi.restoreAllMocks(); act(() => root.unmount()); vi.useRealTimers(); });
const mount = () => act(() => root.render(<Harness />));

describe("autosave across project transitions", () => {
  it("flushes pending edits on native close before allowing the window to be destroyed", async () => {
    desktop.active = true;
    await act(async () => root.render(<Harness />));
    act(() => app.commit((draft) => { draft.name = "Native close edit"; }));
    const preventDefault = vi.fn();
    act(() => desktop.close!({ preventDefault }));
    expect(loadProject(app.project.id)?.name).toBe("Native close edit");
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("prevents native close if writing failed so the unsaved project stays accessible", async () => {
    desktop.active = true;
    await act(async () => root.render(<Harness />));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    act(() => app.commit((draft) => { draft.description = "Pending native edit"; }));
    const preventDefault = vi.fn();
    act(() => desktop.close!({ preventDefault }));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(app.saveStatus).toBe("error");
  });

  it("flushes recent edits before switching, without waiting for the debounce", () => {
    mount();
    const oldId = app.project.id;
    act(() => app.commit((draft) => { draft.description = "Last second edit"; }));
    act(() => { expect(app.replace(createEmptyProject("Next"))).toBe(true); });
    expect(loadProject(oldId)?.description).toBe("Last second edit");
    act(() => vi.advanceTimersByTime(500));
    expect(app.project.name).toBe("Next");
    expect(localStorage.getItem("dynasty-chronicles:active")).toBe(app.project.id);
  });

  it("keeps the current project open and reports failure when saving fails", () => {
    mount();
    const oldId = app.project.id;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    act(() => app.commit((draft) => { draft.description = "Unsaved"; }));
    act(() => { expect(app.forceSave()).toBe(false); expect(app.replace(createEmptyProject("Next"))).toBe(false); });
    expect(app.project.id).toBe(oldId);
    expect(app.project.description).toBe("Unsaved");
    expect(app.saveStatus).toBe("error");
  });

  it("flushes a pending edit on pagehide", () => {
    mount();
    act(() => app.commit((draft) => { draft.name = "Before closing"; }));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(loadProject(app.project.id)?.name).toBe("Before closing");
  });

  it("shows recovery state without overwriting corrupt records", () => {
    localStorage.setItem("dynasty-chronicles:active", "project_demo");
    localStorage.setItem("dynasty-chronicles:project:project_demo", "broken");
    mount();
    act(() => vi.advanceTimersByTime(1000));
    expect(app.loadError).toBe(true);
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe("broken");
    act(() => { expect(app.replace(createEmptyProject("Recovered work"))).toBe(true); });
    expect(app.loadError).toBe(false);
    expect(localStorage.getItem("dynasty-chronicles:project:project_demo")).toBe("broken");
  });
});
