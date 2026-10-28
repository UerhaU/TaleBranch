// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readThemeFile, sanitizeCss } from "../lib/customStyles";
import { useCustomStyles, type CustomStylesApi } from "./useCustomStyles";

const tauri = vi.hoisted(() => ({ desktop: false, files: {} as Record<string, string> }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => tauri.desktop,
  invoke: async (command: string, args?: { kind: string; file: string }) => {
    if (command === "custom_styles_list") {
      const list = (kind: string) =>
        Object.keys(tauri.files)
          .filter((path) => path.startsWith(`${kind}/`))
          .map((path) => ({ file: path.slice(kind.length + 1), size: tauri.files[path].length }));
      return { folder: "D:\\TaleBranch\\TaleBranch-data", snippets: list("snippets"), themes: list("themes") };
    }
    if (command === "custom_style_read") return tauri.files[`${args!.kind}/${args!.file}`];
    throw new Error(command);
  },
}));

let root: Root, container: HTMLDivElement, api: CustomStylesApi;
function Probe({ onSafe }: { onSafe?: () => void }) {
  api = useCustomStyles(onSafe);
  return null;
}
const style = (id: string) => document.getElementById(id)?.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
  tauri.desktop = false;
  tauri.files = {};
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("user CSS", () => {
  it("removes everything that could load from the internet and keeps embedded pictures", () => {
    const css = sanitizeCss(
      `@import url("https://example.com/a.css");
       .a { background: url(https://example.com/x.png); }
       .b { background: url('//example.com/y.png'); }
       @font-face { src: url(http://example.com/f.woff2); }
       .c { background: url("data:image/svg+xml,%3Csvg/%3E"); }`,
    );
    expect(css).not.toMatch(/example\.com|@import/);
    expect(css).toContain('url("data:image/svg+xml,%3Csvg/%3E")');
  });

  it("reads the theme name and modes from the first comment", () => {
    const theme = readThemeFile("Мой сад.css", "/* name: Мой сад; modes: dark */ [data-theme='мой-сад'] {}");
    expect(theme).toMatchObject({ id: "мой-сад", name: "Мой сад", modes: ["dark"] });
    expect(readThemeFile("plain.css", ".x{}")).toMatchObject({ id: "plain", name: "plain", modes: ["light", "dark"] });
  });

  it("applies the browser CSS at once, survives broken CSS and turns it off with Ctrl Shift 0", () => {
    const onSafe = vi.fn();
    act(() => root.render(<Probe onSafe={onSafe} />));
    expect(api.desktop).toBe(false);
    act(() => api.setWebCss(".tb-card { color: red; } }}} @@ broken {"));
    expect(style("tb-user-snippets")).toContain(".tb-card { color: red; }");
    expect(localStorage.getItem("dynasty-chronicles:custom-css")).toContain("broken");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ")", code: "Digit0", ctrlKey: true, shiftKey: true }));
    });
    expect(onSafe).toHaveBeenCalledOnce();
    expect(api.safe).toBe(true);
    expect(document.getElementById("tb-user-snippets")).toBeNull();
    act(() => api.restore());
    expect(style("tb-user-snippets")).toContain(".tb-card");
  });

  it("lists desktop styles and themes, and switches a style on and off without a restart", async () => {
    tauri.desktop = true;
    tauri.files = {
      "snippets/round.css": ".tb-avatar { border-radius: 50%; }",
      "snippets/big-names.css": ".tb-card-name { font-size: 18px; }",
      "themes/night.css": "/* name: Ночь */ [data-theme='night'][data-mode='dark'] { --tb-canvas: #000000; }",
    };
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await vi.waitFor(() => expect(api.loaded).toBe(true));
    });
    expect(api.snippets.map((item) => item.file)).toEqual(["round.css", "big-names.css"]);
    expect(api.themes).toMatchObject([{ id: "night", name: "Ночь" }]);
    expect(style("tb-user-themes")).toContain("--tb-canvas: #000000");
    expect(style("tb-user-snippets")).toBe("");
    act(() => api.toggle("round.css", true));
    expect(style("tb-user-snippets")).toContain("border-radius: 50%");
    expect(JSON.parse(localStorage.getItem("dynasty-chronicles:snippets")!)).toEqual(["round.css"]);
    act(() => api.toggle("round.css", false));
    expect(document.getElementById("tb-user-snippets")).toBeNull();
  });
});
