// Pieces of the game catalog produced by the `catalog-chunks` plugin in vite.config.ts.
declare module "virtual:catalog-core" {
  const core: import("./lib/catalog").CatalogCore;
  export default core;
}

declare module "virtual:catalog-entries" {
  const entries: Omit<Record<import("./lib/catalog").CatalogKind, import("./lib/catalog").CatalogEntry[]>, "ages">;
  export default entries;
}

declare module "virtual:catalog-texts/*" {
  const texts: import("./lib/catalogLocalization").CatalogTexts;
  export default texts;
}
