import { invoke, isTauri } from "@tauri-apps/api/core";

/** One file is at most 1 MB, as in the desktop part. */
export const MAX_STYLE_SIZE = 1024 * 1024;

export type UserTheme = { id: string; file: string; name: string; modes: string[]; css: string };
export type UserSnippet = { file: string; css: string };
type StyleList = { folder: string; snippets: Array<{ file: string }>; themes: Array<{ file: string }> };

/**
 * The user's CSS may only change the look: `@import` and pictures or fonts from
 * anywhere except `data:` are removed, so nothing is loaded from the internet.
 */
export function sanitizeCss(text: string): string {
  return text
    .slice(0, MAX_STYLE_SIZE)
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(?!['"]?\s*data:)[^)]*\)/gi, "none");
}

/** The theme id is the file name; its first comment may give a name: `/* name: My theme; modes: light dark *\/`. */
export function readThemeFile(file: string, css: string): UserTheme {
  const id = file
    .replace(/\.css$/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const header = /^\s*\/\*([\s\S]*?)\*\//.exec(css)?.[1] ?? "";
  const field = (key: string) => new RegExp(`${key}\\s*:\\s*([^;*]+)`, "i").exec(header)?.[1].trim();
  const modes = (field("modes") ?? "light dark").split(/[\s,]+/).filter((mode) => mode === "light" || mode === "dark");
  return {
    id: id || "my-theme",
    file,
    name: field("name") || file.replace(/\.css$/i, ""),
    modes: modes.length ? modes : ["light", "dark"],
    css: sanitizeCss(css),
  };
}

/** Reads `TaleBranch-data/snippets` and `TaleBranch-data/themes` in the desktop version. */
export async function loadDesktopStyles(): Promise<{ folder: string; snippets: UserSnippet[]; themes: UserTheme[] }> {
  if (!isTauri()) return { folder: "", snippets: [], themes: [] };
  const list = await invoke<StyleList>("custom_styles_list");
  const read = (kind: "snippets" | "themes", file: string) =>
    invoke<string>("custom_style_read", { kind, file }).catch(() => "");
  const snippets = await Promise.all(
    list.snippets.map(async ({ file }) => ({ file, css: sanitizeCss(await read("snippets", file)) })),
  );
  const themes = await Promise.all(
    list.themes.map(async ({ file }) => readThemeFile(file, await read("themes", file))),
  );
  return { folder: list.folder, snippets, themes };
}
