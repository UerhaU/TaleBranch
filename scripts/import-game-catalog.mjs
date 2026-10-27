import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, process.argv[2] ?? "local-data/access-catalogs/schema.json");
const schema = JSON.parse(fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""));
const rows = schema.rows;
const lookup = (table) => new Map(rows[table].map((row) => [row.ID, row]));
const icons = lookup("Иконки"),
  packs = lookup("НаборыИгры"),
  species = lookup("ВидыСуществ"),
  ages = lookup("ЭтапыЖизни");
const speciesCode = (id) => species.get(id)?.Код;
const ageCode = (id) => ages.get(id)?.Код;
const iconPath = (id) => icons.get(id)?.ФайлPNG;
const groups = Object.fromEntries(
  ["ВидыЧерт", "ГруппыЖизненныхЦелей", "КатегорииПредпочтений"].map((name) => [name, lookup(name)]),
);
const availability = (table, key, id) => {
  const result = {};
  for (const row of rows[table].filter((row) => row[key] === id)) {
    const sp = speciesCode(row.ВидID),
      age = ageCode(row.ЭтапID);
    if (sp && age) (result[sp] ??= []).push(age);
  }
  return result;
};
const entry = (row) => ({
  id: row.Код,
  label: row.Название,
  description: row.Описание ?? "",
  icon: iconPath(row.ИконкаID),
  pack: packs.get(row.НаборID)?.Код ?? "BG",
  category: "",
  species: ["human"],
  availability: {},
  maxLevel: row.МаксимальныйУровень,
  ageNames: row.ДопустимыеВозрасты?.split(", ").filter(Boolean) ?? [],
  wiki: row.СтраницаВики,
});
const traitIds = new Map(rows.ЧертыХарактера.map((row) => [row.ID, row.Код]));
const conflicts = {};
for (const pair of rows.НесовместимыеЧерты) {
  const a = traitIds.get(pair.Черта1ID),
    b = traitIds.get(pair.Черта2ID);
  if (a && b) {
    (conflicts[a] ??= []).push(b);
    (conflicts[b] ??= []).push(a);
  }
}
const data = {
  version: schema.version,
  packs: rows.НаборыИгры.map((row) => ({ id: row.Код, label: row.Название })),
  species: rows.ВидыСуществ.map((row) => ({
    id: row.Код,
    label: row.Название,
    type: row.ТипКарточкиID === 2 ? "pet" : "sim",
  })),
  entries: {
    traits: rows.ЧертыХарактера.map((row) => {
      const allowed = availability("ДоступностьЧерт", "ЧертаID", row.ID);
      const fallback = /_Cat$/.test(row.Код)
        ? "cat"
        : /_Dog$/.test(row.Код)
          ? "dog"
          : /Horse/.test(row.Код)
            ? "horse"
            : "human";
      return {
        ...entry(row),
        category: groups.ВидыЧерт.get(row.ВидЧертыID)?.Название ?? "",
        traitKind: groups.ВидыЧерт.get(row.ВидЧертыID)?.Код,
        species: Object.keys(allowed).length ? Object.keys(allowed) : [fallback],
        availability: allowed,
        conflicts: conflicts[row.Код] ?? [],
      };
    }),
    aspirations: rows.ЖизненныеЦели.map((row) => ({
      ...entry(row),
      category: groups.ГруппыЖизненныхЦелей.get(row.ГруппаID)?.Название ?? "",
      availability: availability("ДоступностьЦелей", "ЦельID", row.ID),
    })),
    breeds: rows.ПородыПитомцев.map((row) => ({
      ...entry(row),
      species: [speciesCode(row.ВидID)],
      category: row.РазмерСобаки ?? "",
      description: row.СмешаннаяПорода ? "Смешанная порода" : "",
    })),
    skills: rows.Навыки.map((row) => ({
      ...entry(row),
      species: rows.ВидыДляНавыков.filter((item) => item.НавыкID === row.ID).map((item) => speciesCode(item.ВидID)),
    })),
    preferences: rows.Предпочтения.map((row) => ({
      ...entry(row),
      category: groups.КатегорииПредпочтений.get(row.КатегорияID)?.Название ?? "",
      preferenceKind: row.ВидПредпочтения?.startsWith("Привлекает") ? "attraction" : "like",
    })),
    careers: rows.Профессии.map((row) => ({
      ...entry(row),
      category: row.ТипПрофессии,
      careerDetails: row.ВеткиИУровни ?? "",
    })),
    occults: rows.ОккультныеТипы.map((row) => ({
      ...entry(row),
      species: row.Код === "ghost" ? ["human", "cat", "dog", "horse"] : ["human"],
    })),
    deathCauses: rows.ПричиныСмерти.map((row) => ({
      ...entry(row),
      species: row.Код === "trait_ghost_OldAge" ? ["human", "cat", "dog", "horse"] : ["human"],
    })),
    ages: rows.ВозрастПоВиду.map((row) => ({
      ...entry(row),
      id: `${speciesCode(row.ВидID)}:${ageCode(row.ЭтапID)}`,
      species: [speciesCode(row.ВидID)],
      pack: packs.get(species.get(row.ВидID)?.НаборID)?.Код ?? "BG",
      stageCode: ageCode(row.ЭтапID),
      order: row.Порядок,
      icon: iconPath(row.ВыбраннаяИконкаID) ?? iconPath(row.ИконкаID),
    })),
  },
};
const publicRoot = path.join(root, "public/game-icons");
fs.mkdirSync(publicRoot, { recursive: true });
for (const icon of rows.Иконки) {
  const file = path.join(path.dirname(source), "icons", icon.ФайлPNG);
  const bytes = fs.readFileSync(file);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== icon.SHA256)
    throw new Error(`Icon checksum mismatch: ${icon.ФайлPNG}`);
  fs.copyFileSync(file, path.join(publicRoot, icon.ФайлPNG));
}
for (const [kind, entries] of Object.entries(data.entries)) {
  if (new Set(entries.map((item) => item.id)).size !== entries.length) throw new Error(`Duplicate ${kind} ID`);
  for (const item of entries)
    if (item.icon && !fs.existsSync(path.join(publicRoot, item.icon))) throw new Error(`Missing ${item.icon}`);
}
fs.mkdirSync(path.join(root, "src/data"), { recursive: true });
fs.writeFileSync(path.join(root, "src/data/game-catalog.json"), JSON.stringify(data));
console.log(Object.fromEntries(Object.entries(data.entries).map(([kind, entries]) => [kind, entries.length])));
