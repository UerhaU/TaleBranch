# TaleBranch

**v0.1.0-beta.1 · First beta candidate / Кандидат в первую бету**

[Русский](#русский) · [English](#english)

## Русский

**У каждой ветви — своя история.**

TaleBranch — разрабатываемое локальное приложение для семейных древ, связей и историй персонажей. Проект задуман прежде всего для династий The Sims 4, но подходит и для персонажей собственных вымышленных миров.

### Запуск portable для Windows

Первая бета подготовлена к проверке, но ещё не опубликована. Публичная альфа остаётся доступна в [Releases](https://github.com/UerhaU/TaleBranch/releases). После проверки кандидат будет выпущен отдельно как **pre-release `v0.1.0-beta.1`**.

1. Скачайте архив `TaleBranch-0.1.0-beta.1-portable.zip` из приложенных файлов бета-релиза, когда он будет опубликован. Автоматический архив **Source code** содержит исходники и не заменяет portable.
2. Распакуйте архив в доступную для записи папку, например `D:\TaleBranch`.
3. Запустите `TaleBranch-0.1.0-beta.1-portable.exe` двойным щелчком.

**Браузер, Node.js и сервер, включая локальный, для работы portable не нужны.** Интерфейс включён в `.exe`. Нужен системный Microsoft Edge WebView2 Runtime; если его нет, установите с [официального сайта Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

Настройки и список недавних папок находятся в `TaleBranch-data` рядом с программой. Династии остаются в выбранных пользователем местах. Подробная инструкция: [portable для Windows](docs/PORTABLE_RU.md).

### Состояние проекта

**Кандидат в первую бету для тестирования.** Основные возможности реализованы, но обычный сценарий в настольном окне ещё должен пройти ручную проверку перед публикацией. Автотесты и проверка готового исполняемого файла не заменяют эту проверку. Ограничения перечислены ниже; стабильный выпуск пока не объявлен.

В прототипе есть поле древа, карточки персонажей и питомцев, родственные и личные связи, биографии, фотографии этапов жизни, локальное сохранение и экспорт. В карточках доступны игровые справочники с поиском и иконками, породы питомцев, уровни навыков, предпочтения и история работы. Наличие функции в интерфейсе не означает, что она полностью готова и проверена во всех сценариях.

Пока не завершены хранение в SQLite и отдельных файлах медиа, автоматические резервные копии, редактируемые справочники этапов жизни и пользовательские поля. Проверка обновлений и поддержка через DonationAlerts пока представлены заглушками. Новые династии создаются в выбранных пользователем папках: карточки, связи и фотографии хранятся в `dynasty.json`, изменения записываются прямо в этот файл. Для записи в папки в веб-версии нужен браузер с File System Access API, например Chrome или Edge. Прежние династии из localStorage остаются доступны для переноса. Подробнее: [папки династий](docs/DYNASTY_FOLDERS_RU.md).

На поле древа отображается родство «родитель → ребёнок» и полупрозрачные линии личных отношений с текстовыми метками. В фильтрах их можно скрывать независимо друг от друга. Личные отношения редактируются в профилях персонажей. В карьере доступны профессия, уровень и заметки.

Прежние записи браузера сжимаются без потерь, включая оригиналы фотографий; старые записи JSON по-прежнему открываются. Файл в выбранной папке и экспорт `.dynasty-tree` используют обычный JSON с проверкой целостности. При ошибке сохранения показывается причина и технические подробности. Последняя ошибка текущей вкладки также доступна в «О приложении».

Чтобы создать питомца, нужно выбрать хотя бы одного хозяина из персонажей династии. Если персонажей ещё нет, сначала добавьте хозяина.

При создании династии выберите место сохранения: программа сама создаст внутри папку с названием династии и файл `dynasty.json`. Выбранное место может содержать другие файлы. Если имя занято, новая папка получит номер, например «Дом Вороновых (2)». Импорт и перенос прежних браузерных династий работают так же.

Фото можно добавить при создании карточки: на вкладке «Основное» выберите этап жизни, нажмите «Загрузить фото», настройте кадр и сохраните карточку. Для людей доступны варианты пола «Женский», «Мужской», «Другое», для питомцев — «Женский» и «Мужской».

Отдельные истории в интерфейсе называются династиями, например «Дом Вороновых». Кнопка удаления всей династии доступна в меню её названия и в настройках. В корзине можно восстановить карточку, удалить её безвозвратно или очистить всю корзину. Безвозвратное удаление требует подтверждения и очищает историю отмены и повтора действий. После удаления последней династии предлагается создать и назвать новую. При отмене остаётся экран создания или импорта; новая запись появляется только после нажатия «Создать».

Локальная portable-сборка: `release/portable/TaleBranch-0.1.0-beta.1-portable.exe`. Файлы записывает нативная часть Tauri, без браузерных запросов доступа. Установщик и цифровая подпись в этот кандидат не входят.

### Переход с альфы

Если династия осталась в браузере, сначала откройте прежнюю веб-версию и сохраните династию в папку либо экспортируйте `.dynasty-tree`. В portable откройте папку с `dynasty.json` или импортируйте экспортный файл. Приложение не читает хранилище другого браузера автоматически. Исходные браузерные данные и экспортные копии не удаляются.

Перед первыми проверками сделайте отдельную копию нужной династии. Текущий формат хранит оригиналы фотографий и данные вместе в JSON; автоматические резервные копии ещё не реализованы.

### Запуск из исходников

Требуется Node.js 22.12+ или более новая поддерживаемая версия и npm.

```bash
npm ci
npm run dev
```

Откройте `http://localhost:1420`. Это режим разработки интерфейса в браузере. Для настольного режима дополнительно нужны Rust и зависимости Tauri 2 для вашей ОС.

Справочники хранятся в `src/data/game-catalog.json`, локальные игровые иконки — в `public/game-icons/` (не включены в Git). Для повторного переноса из подготовленного каталога Access выполните `node scripts/import-game-catalog.mjs` или передайте путь к его `schema.json` вторым аргументом. Скрипт проверяет контрольные суммы иконок и не обращается к пользовательским проектам. Для обычного запуска Access не требуется.

Проверки:

```bash
npm test
npx tsc -b
```

Сборка portable по отдельному разрешению владельца: `npm run build:portable`. Эта команда проверяет интерфейс и нативное хранение, собирает `.exe` без установщика и запускает проверку готового файла без интерфейса. Для сборки требуются Rust/MSVC и окружение `scripts/dev-env.ps1`; пользователю готового `.exe` они не нужны.

Игровые иконки владельца не включены в Git. Для сборки из чистого клона без этого локального набора используйте `powershell -File scripts/build-portable.ps1 -AllowMissingIcons`: на месте отсутствующих изображений показываются стандартные значки. Текстовые справочники включены в исходники. Полная локальная сборка содержит подготовленные игровые иконки; приложение не требует установленную The Sims 4 для работы с включёнными справочниками.

Описание кандидата и проверки перед публикацией: [первая бета](docs/BETA_RELEASE_RU.md), [изменения](CHANGELOG.md).

Основная целевая платформа — Windows x64. Поддержка других настольных ОС пока не подтверждена. Минимальный размер окна — 1024 × 720.

Состояние иностранных переводов и оставшиеся ограничения описаны в [отчёте о локализации](docs/TRANSLATION_REVIEW_RU.md). Игровые справочники пока используют русские названия из исходной базы. Коми-пермяцкий перевод остаётся частичным с русским резервом для неподготовленных строк.

### Обратная связь

Откройте вкладку **Issues → New issue** в этом репозитории. Для перевода выберите **Translation correction / Исправление перевода**, для других ошибок — **Bug report / Сообщить об ошибке**.

Укажите версию приложения, что произошло и как повторить проблему. Не прикрепляйте личные данные и частные проекты без необходимости.

### Данные и лицензия

Приложение задумано для локальной работы без регистрации и облачного сервера. Подробности: [PRIVACY.md](./PRIVACY.md).

Лицензия исходного кода — GPL-3.0-or-later, см. [LICENSE](./LICENSE). Сторонние компоненты перечислены в [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

TaleBranch — независимый неофициальный проект, не связанный с Electronic Arts или Maxis. The Sims и другие упомянутые названия принадлежат их правообладателям.

---

## English

**Every branch has a story.**

TaleBranch is a local application in development for character family trees, relationships, and life stories. It is designed primarily for The Sims 4 dynasties, while also supporting characters from other fictional worlds.

### Project status

**First beta candidate for testing.** Automated checks and a packaged executable self-test are available; the normal desktop workflow still needs manual verification before publication. This is not a stable release.

### Run the Windows portable app

The beta candidate is being checked and has not been published yet. The public alpha remains available under [Releases](https://github.com/UerhaU/TaleBranch/releases). The intended new release is the **`v0.1.0-beta.1` pre-release**.

1. When published, download the attached `TaleBranch-0.1.0-beta.1-portable.zip`. The automatic **Source code** archive is for development.
2. Extract it into a writable folder and double-click `TaleBranch-0.1.0-beta.1-portable.exe`.

**No external browser, Node.js or server is required.** The interface is embedded. Windows needs Microsoft Edge WebView2 Runtime, available from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

Settings live in `TaleBranch-data` beside the executable. Dynasty files remain in folders chosen by the user.

The prototype includes a tree canvas, character and pet profiles, family and personal relationships, biographies, life-stage photos, local saving, and export. Profiles include searchable game catalogs with icons, pet breeds, skill levels, preferences, and career periods. A feature appearing in the interface does not mean it is complete or tested in every scenario.

SQLite storage, separate media files, automatic backups, editable life-stage definitions, and custom fields are not complete. Update checking and DonationAlerts support are currently placeholders. New dynasties use user-selected folders: characters, connections and photos are saved directly in `dynasty.json`. The web app requires a browser supporting the File System Access API, such as Chrome or Edge, for folder writes. Existing localStorage dynasties remain accessible and can be saved into a chosen folder.

The tree canvas displays parent–child connections and translucent personal connections with relationship labels. Filters toggle them independently. Personal relationships are edited in character profiles. Careers contain a profession, level and notes.

Legacy browser records use lossless compression, including original photos, and older JSON records remain readable. Folder files and exported `.dynasty-tree` files use plain JSON with integrity verification. Save failures show their reason and technical details. The latest error in the current tab is also available under About.

Creating a pet requires selecting at least one owner from the dynasty’s characters. If no characters exist yet, add an owner first.

When creating a dynasty, choose a save location. The app creates a folder named after the dynasty inside it, containing `dynasty.json`. Existing files are allowed at the chosen location. If the name is taken, a number is added to the new folder name. Imports and transfers of older browser dynasties follow the same process.

Add a photo while creating a profile: select a life stage in the Main tab, choose Upload photo, adjust the crop, and save the profile. Human profiles offer Female, Male and Other gender choices; pets offer Female and Male.

Separate stories are called dynasties in the interface, such as “House Voronov”. Delete a dynasty from its name menu or settings. Trash supports restoration, permanent deletion of individual profiles, and emptying the entire trash. Permanent deletion requires confirmation and clears undo and redo history. Deleting the last dynasty invites you to create and name a new one. Cancel to stay on the creation/import screen; no new dynasty is stored until you choose Create.

A Windows portable candidate is available locally at `release/portable/TaleBranch-0.1.0-beta.1-portable.exe`. It uses native Tauri file operations without browser permission prompts. An installer and digital signature are not included.

### Moving from the alpha

For dynasties stored only in a browser, first save them into a folder or export `.dynasty-tree` from the old web version. Then open the folder containing `dynasty.json` or import the export in the portable app. Browser records and exported source files remain intact. Make a separate copy of important dynasties for testing; automatic backups are not implemented yet.

### Run from source

Requires Node.js 22.12+ or a newer supported version, and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:1420`. This runs the interface in a browser for development. Desktop development also requires Rust and the Tauri 2 prerequisites for your operating system.

Checks:

```bash
npm test
npx tsc -b
```

The primary target is Windows x64. Support for other desktop operating systems has not been verified. Minimum window size: 1024 × 720.

Locally extracted game icons are not tracked in Git. To build from a clean clone without them, use `powershell -File scripts/build-portable.ps1 -AllowMissingIcons`; unavailable images use a standard placeholder. Text catalogs are included. See [CHANGELOG](CHANGELOG.md) for changes since the alpha.

### Feedback

Open this repository's **Issues → New issue** tab. Choose **Translation correction / Исправление перевода** for wording corrections, or **Bug report / Сообщить об ошибке** for other problems.

Include the application version, what happened, and how to reproduce the problem. Avoid attaching personal information or private projects unless necessary.

### Data and license

The application is designed for local use without registration or a cloud server. See [PRIVACY.md](./PRIVACY.md).

Source code is licensed under GPL-3.0-or-later; see [LICENSE](./LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

TaleBranch is an independent, unofficial project and is not affiliated with Electronic Arts or Maxis. The Sims and other mentioned names belong to their respective owners.

---

### Переводы / Translations

**Коми-пермяцкӧй:** Переводын ошибка адззин кӧ, гиж GitHub Issues-ӧ. Инды, кытӧн ошибкаыс да кыдз колӧ гижны.

**Српски:** Ако приметите нетачан превод, пријавите га у одељку GitHub Issues. Наведите где се грешка налази, тренутни текст и предложени исправан превод.
