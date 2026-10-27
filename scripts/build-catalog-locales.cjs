const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const work = path.join(root, "local-data/catalog-localization");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/game-catalog.json"), "utf8"));
const refs = JSON.parse(fs.readFileSync(path.join(work, "string-refs.json"), "utf8"));
const locales = ["ru", "en", "de", "fr", "es", "pt-BR", "zh-CN"];
const tables = Object.fromEntries(
  locales.map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(work, `strings-${locale}.json`), "utf8"))]),
);
function clean(value = "") {
  return value
    .replace(/\{M\d+\.([^}]*)\}/g, "$1")
    .replace(/\{F\d+\.[^}]*\}/g, "")
    .replace(/\{T\d+\.[^}]*\}/g, "")
    .replace(/\{DAE\d+\.([^}]*)\}/g, "$1")
    .replace(/\{S\d+\.([^}]*)\}/g, "$1")
    .replace(/\{P\d+\.[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replaceAll("\\n", "\n")
    .trim()
    .normalize("NFC");
}
const normalize = (value) =>
  clean(value)
    .replace(/[™®«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru");
const ruIndex = new Map();
const englishIndex = new Map();
for (const [key, value] of Object.entries(tables.en)) {
  if (!englishIndex.has(value)) englishIndex.set(value, []);
  englishIndex.get(value).push(key);
}
for (const [key, value] of Object.entries(tables.ru)) {
  const label = normalize(value);
  if (!ruIndex.has(label)) ruIndex.set(label, []);
  ruIndex.get(label).push(key);
}
const exactKeys = (label) => (label?.trim() ? ruIndex.get(normalize(label)) || [] : []);
const first = (locale, keys) => keys?.map((key) => clean(tables[locale][key])).find(Boolean) || "";
const result = {};
const report = {};
for (const locale of locales) {
  const entries = {},
    categories = {},
    packs = {};
  const missing = [];
  for (const [kind, values] of Object.entries(catalog.entries))
    for (const entry of values) {
      const id = `${kind}:${entry.id}`,
        ref = refs[id] || {};
      const translated = {};
      for (const field of ["label", "description"]) {
        const keys =
          kind === "occults" && entry.id === "trait_Humanoid_Robots_MainTrait" && field === "label"
            ? exactKeys(entry.label)
            : ref[field]?.length
              ? ref[field]
              : exactKeys(entry[field]);
        let value = first(locale, keys);
        if (field === "description" && /\bplaceholder\b|description currently unused/i.test(value)) value = "";
        // Preference traits encode "Likes ..."; their short descriptions are
        // the game's neutral picker names, independent of like/dislike rating.
        if (kind === "preferences" && field === "label") {
          const neutral = first(locale, ref.description);
          if (neutral && neutral.length < 90 && !/[.!?。！]\s*$|\n|\{/.test(neutral)) value = neutral;
        }
        if (value) translated[field] = value;
      }
      if (kind === "ages") continue; // Ages use the interface's deliberate young/adult naming.
      if (!translated.label) missing.push({ kind, id: entry.id, label: entry.label });
      if (entry.category) {
        const exactEnglish = { Страх: "Fears", Подработка: "Part-Time", Фриланс: "Freelancer" }[entry.category];
        const categoryKeys = exactEnglish
          ? englishIndex.get(exactEnglish) || []
          : ref.category?.length
            ? ref.category
            : exactKeys(entry.category);
        const value = first(locale, categoryKeys);
        if (value) categories[entry.category] = value;
      }
      if (ref.tracks?.length) {
        const details = ref.tracks
          .map((track) => {
            const name = first(locale, track.name),
              levels = track.levels.map((keys) => first(locale, keys)).filter(Boolean);
            return name && levels.length ? `${name}: ${levels.join(" → ")}` : "";
          })
          .filter(Boolean)
          .join("\n\n");
        if (details) translated.careerDetails = details;
      }
      if (Object.keys(translated).length) entries[id] = translated;
    }
  for (const pack of catalog.packs) {
    const value = first(locale, exactKeys(pack.label));
    if (value) packs[pack.id] = value;
  }
  result[locale] = { entries, categories, packs };
  report[locale] = {
    missingLabels: missing,
    entries: Object.keys(entries).length,
    categories: Object.keys(categories).length,
    packs: Object.keys(packs).length,
  };
  console.log(
    locale,
    "missing names:",
    missing.length,
    "categories:",
    Object.keys(categories).length,
    "packs:",
    Object.keys(packs).length,
  );
}
fs.writeFileSync(path.join(root, "src/data/catalog-locales.json"), JSON.stringify(result));
fs.writeFileSync(path.join(work, "coverage.json"), JSON.stringify(report, null, 2));
