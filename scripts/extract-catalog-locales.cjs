// Development importer; source game packages are read-only. Dependencies are
// deliberately isolated from the app: npm install --prefix local-data/catalog-localization/deps @s4tk/models
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'local-data/catalog-localization');
const { Package } = require(path.join(work, 'deps/node_modules/@s4tk/models'));
const game = process.argv[2] || 'E:/The Sims 4';
const codes = { ru:'RUS_RU', en:'ENG_US', de:'GER_DE', fr:'FRE_FR', es:'SPA_ES', 'pt-BR':'POR_BR', 'zh-CN':'CHS_CN' };
const packDirs = fs.readdirSync(game).filter(name => /^[EGSF]P\d+$/.test(name)).sort();
for (const [locale, code] of Object.entries(codes)) {
  const filename = `Strings_${code}.package`;
  const files = [path.join(game, 'Data/Client', filename), ...packDirs.map(pack => path.join(game, pack, filename)),
    path.join(game, 'Delta/Data/Client', filename), ...packDirs.map(pack => path.join(game, 'Delta', pack, filename))];
  const strings = {}; let packages = 0;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const pkg = Package.from(fs.readFileSync(file), { resourceFilter: type => type === 0x220557da });
    for (const entry of pkg.entries) for (const text of entry.value.entries) strings[text.key] = text.value;
    packages++;
  }
  fs.writeFileSync(path.join(work, `strings-${locale}.json`), JSON.stringify(strings));
  console.log(locale, packages, 'packages;', Object.keys(strings).length, 'official strings');
}
