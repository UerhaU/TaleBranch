/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Splits the game catalog into small pieces so the program starts without it.
 * - `virtual:catalog-core`: ages, packs and species, needed right away (cards on the field);
 * - `virtual:catalog-entries`: traits, skills and the rest, loaded when a catalog is opened;
 * - `virtual:catalog-texts/<language>`: catalog translations for one language only.
 * The data files in src/data stay as the generators write them.
 */
function catalogChunks(): Plugin {
  const file = (name: string) => fileURLToPath(new URL(`./src/data/${name}`, import.meta.url));
  const read = (name: string) => JSON.parse(readFileSync(file(name), "utf8"));
  const modules: Record<string, () => unknown> = {
    "virtual:catalog-core": () => {
      const { version, packs, species, entries } = read("game-catalog.json");
      return { version, packs, species, ages: entries.ages };
    },
    "virtual:catalog-entries": () => {
      const { ages: _ages, ...entries } = read("game-catalog.json").entries;
      return entries;
    },
  };
  const texts = (locale: string) => {
    const official = read("catalog-locales.json");
    const authored = read("catalog-authored.json");
    const english = official.en ?? { entries: {}, packs: {} };
    return {
      official: official[locale] ?? null,
      authored: authored[locale] ?? null,
      // Breeds keep the game's English names where a language has none; packs fall back to English.
      englishBreeds: Object.fromEntries(
        Object.entries(english.entries as Record<string, { label?: string }>)
          .filter(([key, value]) => key.startsWith("breeds:") && value.label)
          .map(([key, value]) => [key, value.label]),
      ),
      englishPacks: english.packs,
    };
  };
  return {
    name: "catalog-chunks",
    enforce: "pre",
    resolveId(id) {
      if (id in modules || id.startsWith("virtual:catalog-texts/")) return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith("\0virtual:catalog-")) return;
      const name = id.slice(1);
      ["game-catalog.json", "catalog-locales.json", "catalog-authored.json"].forEach((data) =>
        this.addWatchFile(file(data)),
      );
      const value = name.startsWith("virtual:catalog-texts/")
        ? texts(name.slice("virtual:catalog-texts/".length))
        : modules[name]();
      // JSON.parse of a string literal starts faster than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(value))});`;
    },
  };
}

export default defineConfig({
  plugins: [react(), catalogChunks()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    setupFiles: ["src/test/preloadCatalog.ts"],
  },
});
