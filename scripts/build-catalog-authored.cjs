// Explicit author translations are used only where the game has no locale/string.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "src/data/game-catalog.json"), "utf8"));
const official = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog-locales.json"), "utf8"));
const refs = JSON.parse(fs.readFileSync(path.join(root, "local-data/catalog-localization/string-refs.json"), "utf8"));
const englishStrings = JSON.parse(
  fs.readFileSync(path.join(root, "local-data/catalog-localization/strings-en.json"), "utf8"),
);
const terms = new Map();
for (const line of fs.readFileSync(path.join(__dirname, "catalog-authored-terms.tsv"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [en, sr, koi] = line.split("|");
  if (!en || !sr || !koi) throw Error("Incomplete authored term: " + line);
  terms.set(en.trim(), { sr: sr.trim(), koi: koi.trim() });
}
const authored = { sr: { labels: {}, categories: {} }, koi: { labels: {}, categories: {} } };
// The neutral preference name is its official short description. Reuse the
// authored concept rather than translating its like/dislike state twice.
const allTerms = [...terms.entries()];
for (const [en, value] of allTerms) {
  if (!terms.has(en.toLowerCase())) terms.set(en.toLowerCase(), value);
}
function term(text, locale) {
  if (!terms.has(text) && terms.has(text.toLowerCase())) return terms.get(text.toLowerCase())[locale];
  if (terms.has(text)) return terms.get(text)[locale];
  const patterns = [
    [/^Likes (.+)$/i, (x) => (locale === "sr" ? `Воли ${x}` : `${x} кажитчӧ`)],
    [/^(.+) Degree$/, (x) => (locale === "sr" ? `Диплома: ${x}` : `${x} сьӧрті диплом`)],
    [/^Fear of (.+)$/, (x) => (locale === "sr" ? `Страх: ${x}` : `${x} понда полӧм`)],
    [/^Curse of (.+)$/, (x) => (locale === "sr" ? `Проклетство: ${x}` : `${x} понда прокляттё`)],
    [/^Death by (.+)$/, (x) => (locale === "sr" ? `Смрт: ${x}` : `Кулӧм: ${x}`)],
    [/^(.+) Hair$/, (x) => (locale === "sr" ? `Коса: ${x}` : `Юрси: ${x}`)],
    [/^(.+) Clothes$/, (x) => (locale === "sr" ? `Одећа: ${x}` : `Паськӧм: ${x}`)],
  ];
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match) {
      const core = match[1].replace(/^the Color /, "").replace(/ Skill$/, "");
      const translated = term(core, locale);
      if (translated) return format(translated);
    }
  }
  return undefined;
}
const missing = [];
for (const [kind, entries] of Object.entries(data.entries))
  for (const entry of entries) {
    if (kind === "ages" || kind === "breeds") continue;
    const key = kind + ":" + entry.id,
      en = official.en.entries[key]?.label || entry.label;
    for (const locale of ["sr", "koi"]) {
      let value = term(en, locale);
      if (!value && kind === "preferences") value = term("Likes " + en, locale);
      // The English description is often the neutral name of a preference.
      if (!value && kind === "preferences") {
        const label = refs[key]?.label
          ?.map((id) => englishStrings[id])
          .find(Boolean)
          ?.replace(/\{M\d+\.([^}]*)\}/g, "$1")
          .replace(/\{F\d+\.[^}]*\}/g, "");
        if (label) value = term(label, locale);
      }
      if (value) authored[locale].labels[key] = value;
      else if (locale === "sr") missing.push(en);
    }
  }
const categoryCodes = ["en", "de", "fr", "es", "pt-BR", "zh-CN", "sr", "koi"];
for (const line of fs.readFileSync(path.join(__dirname, "catalog-authored-categories.tsv"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [ru, ...values] = line.split("|");
  categoryCodes.forEach((locale, index) => {
    authored[locale] ??= { labels: {}, categories: {} };
    authored[locale].categories[ru] = values[index];
  });
}
for (const [ru, en] of Object.entries(official.en.categories))
  for (const locale of ["sr", "koi"]) {
    const value = term(en, locale);
    if (value) authored[locale].categories[ru] = value;
  }
const extraDeaths = {
  en: ["Death by Choking on Food", "Critical Servo Breakdown"],
  de: ["Tod durch Ersticken beim Essen", "Kritischer Servo-Ausfall"],
  fr: ["Mort par étouffement en mangeant", "Panne critique de Servo"],
  es: ["Muerte por atragantamiento", "Avería crítica de Servo"],
  "pt-BR": ["Morte por engasgo", "Pane crítica de Servo"],
  "zh-CN": ["进食窒息而死", "伺服机器人严重故障"],
};
for (const [locale, values] of Object.entries(extraDeaths)) {
  authored[locale] ??= { labels: {}, categories: {} };
  ["death_choking_lovestruck", "death_servo_meltdown"].forEach((id, i) => {
    authored[locale].labels["deathCauses:" + id] = values[i];
  });
}
fs.writeFileSync(path.join(root, "src/data/catalog-authored.json"), JSON.stringify(authored));
fs.writeFileSync(
  path.join(root, "local-data/catalog-localization/authored-missing.json"),
  JSON.stringify([...new Set(missing)], null, 2),
);
console.log("Unique author terms still needed:", new Set(missing).size);
