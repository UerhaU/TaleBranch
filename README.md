# TaleBranch

Русский · English · Deutsch · Français · Español · Português (Brasil) · 简体中文 · Српски · Коми-пермяцкӧй

[Русский](#русский) · [English](#english)

## Русский

**У каждой ветви — своя история.**

TaleBranch — локальное приложение для семейных древ, связей и историй персонажей. Оно создано прежде всего для династий The Sims 4 и подходит для собственных вымышленных миров.

### Возможности

- Карточки персонажей и питомцев, биографии, заметки и фотографии по этапам жизни.
- Родство и личные отношения с подписями на древе; отдельные фильтры для каждого вида связей.
- Поиск персонажей при создании связи и обмен местами родителя и ребёнка.
- Игровые справочники с поиском и иконками: черты, жизненные цели, навыки, предпочтения, карьеры, породы, оккультные типы и причины смерти.
- Выбор хозяев питомца: для создания нужен хотя бы один хозяин.
- Корзина с восстановлением и безвозвратным удалением карточек.
- Экспорт династии в `.dynasty-tree` и изображения древа в PNG.

### Запуск для Windows

1. На странице [Releases](https://github.com/UerhaU/TaleBranch/releases) выберите выпуск с архивом `TaleBranch-<версия>-portable.zip`. Архивы **Source code** содержат исходники.
2. Распакуйте portable в папку, доступную для записи, например `D:\TaleBranch`.
3. Запустите `TaleBranch-<версия>-portable.exe` двойным щелчком.

Нужен Microsoft Edge WebView2 Runtime: [загрузка с сайта Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

Подробная [инструкция пользователя](docs/PORTABLE_RU.md) объясняет создание династии, загрузку фотографий, связи, сохранение и перенос данных.

### Где хранятся данные

Вы выбираете место сохранения, а TaleBranch создаёт внутри папку с названием династии и файлом `dynasty.json`. В нём хранятся карточки, фотографии, связи и корзина. Существующие династии открываются в своих папках; программа записывает изменения прямо туда.

Настройки, список недавних и ссылка на последнюю открытую династию находятся в `TaleBranch-data` рядом с `.exe`. При следующем запуске последняя династия открывается автоматически. Если династия не выбрана, появляется начальный экран с кнопками создания, открытия и импорта.

**Подтверждённое удаление династии удаляет её папку целиком, со всеми вложенными файлами.** Для важных династий храните отдельные копии: автоматических резервных копий пока нет.

### Ограничения

Приложение находится в бета-разработке. Данные и фотографии хранятся вместе в JSON; SQLite и отдельные медиафайлы пока не используются. Автоматическое резервное копирование и обновление не реализованы. Страница DonationAlerts пока является заглушкой. Portable предназначен для Windows x64; установщика и цифровой подписи нет.

### Разработка

Для браузерного режима нужны Node.js 22.12+ и npm:

```sh
npm ci
npm run dev
```

Откройте `http://localhost:1420`. Для настольной разработки дополнительно нужны Rust и зависимости Tauri 2. Проверки: `npm test`, `npx tsc -b`; нативное хранение: `cargo test --manifest-path src-tauri/Cargo.toml --lib`.

Команда сборки portable — `npm run build:portable`. Игровые иконки из локального набора не включены в Git. Для сборки чистого клона с заменяющими значками используйте `powershell -File scripts/build-portable.ps1 -AllowMissingIcons`. Текстовые справочники входят в исходники; Access для запуска не требуется. Минимальный размер окна — 640 × 480.

### Обратная связь и документы

Сообщайте об ошибках и неточных переводах через [GitHub Issues](https://github.com/UerhaU/TaleBranch/issues). Укажите версию, шаги воспроизведения и ожидаемый результат; не прикладывайте частные династии без необходимости.

- [История изменений](CHANGELOG.md)
- [Обработка пользовательских данных](PRIVACY.md)
- [Источники локализации справочников](docs/CATALOG_LOCALIZATION_RU.md)
- [Лицензия GPL-3.0-or-later](LICENSE) и [сторонние компоненты](THIRD_PARTY_NOTICES.md)

TaleBranch — независимый неофициальный проект, не связанный с Electronic Arts или Maxis. The Sims и игровые материалы принадлежат их правообладателям.

## English

**Every branch has a story.**

TaleBranch is a local app for character family trees, relationships and life stories, designed for The Sims 4 dynasties and other fictional worlds.

### Features

- Character and pet profiles, biographies, notes and life-stage photos.
- Parent–child and labelled personal connections, with independent tree filters.
- Searchable character selectors and a parent–child swap button when creating connections.
- Searchable game catalogs with icons, including traits, aspirations, skills, preferences, careers, breeds, occult types and death causes.
- Pets require at least one owner; trash supports restoration and permanent deletion.
- Dynasty export to `.dynasty-tree` and tree image export to PNG.

### Run on Windows

1. Find a release containing `TaleBranch-<version>-portable.zip` under [Releases](https://github.com/UerhaU/TaleBranch/releases). **Source code** archives are for development.
2. Extract the portable archive into a writable folder and double-click its `.exe`.

[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) is required.

[User guide (Russian)](docs/PORTABLE_RU.md)

### Storage

Choose a save location: the app creates a named dynasty folder containing `dynasty.json`, including profiles, photos, connections and trash. Existing folders are opened in place. Settings, recent folders and the last opened dynasty reference live in `TaleBranch-data` beside the executable. The last dynasty reopens on startup; otherwise the welcome screen offers creation, opening and import.

**Confirming dynasty deletion removes its entire folder and all nested files.** Keep separate copies of important data; automatic backups are not implemented.

### Limitations and development

TaleBranch is in beta development for Windows x64. Data and photos are stored together in JSON. SQLite, separate media files, automatic backups and updates, an installer and a digital signature are not available. DonationAlerts support is a placeholder.

For browser development, install Node.js 22.12+ and run `npm ci` followed by `npm run dev`; open `http://localhost:1420`. Desktop development also requires Rust and Tauri 2 prerequisites. Checks: `npm test`, `npx tsc -b`, and `cargo test --manifest-path src-tauri/Cargo.toml --lib`. To build from a clean clone without local game icons, use `powershell -File scripts/build-portable.ps1 -AllowMissingIcons`; missing icons use placeholders.

Report bugs or translation corrections through [GitHub Issues](https://github.com/UerhaU/TaleBranch/issues), including the version and reproduction steps. See [CHANGELOG](CHANGELOG.md), [privacy](PRIVACY.md), [GPL-3.0-or-later license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

TaleBranch is an independent unofficial project, not affiliated with Electronic Arts or Maxis. The Sims and game assets belong to their respective owners.
