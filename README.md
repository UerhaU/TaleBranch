# TaleBranch

[Русский](#русский) · [English](#english)

## Русский

**У каждой ветви — своя история.**

TaleBranch помогает вести семейное древо ваших симов: кто чей родитель, кто с кем дружит или в ссоре, как прошла жизнь каждого. Программу делали для династий The Sims 4, но она подойдёт и для любого своего мира.

### Что умеет

- Карточки персонажей и питомцев: фото на каждом этапе жизни, черты, цели, карьеры, навыки и заметки.
- Родство и отношения на древе. Лишние линии можно скрыть.
- Списки из игры с иконками, на девяти языках.
- Кнопка «Автораскладка» расставляет запутанное древо по поколениям.
- Отмена и повтор: Ctrl+Z и Ctrl+Y.
- Шесть тем, светлых и тёмных. Можно добавить свои стили.
- Резервные копии: если что-то сломалось, можно вернуть прошлую версию.
- Сохранение древа картинкой PNG и экспорт династии в файл.

### Как начать

1. Откройте страницу [Releases](https://github.com/UerhaU/TaleBranch/releases) и скачайте файл `TaleBranch-…-portable.zip`.
2. Распакуйте его в любую папку, например `D:\TaleBranch`.
3. Запустите `.exe` двойным щелчком. Устанавливать ничего не нужно.

Если программа не запускается, установите [WebView2 от Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/). Обычно в Windows 10 и 11 он уже есть.

Как создать династию, добавить фото и связи — в [инструкции](docs/PORTABLE_RU.md).

### Где лежат ваши династии

Там, где вы их сохранили. Каждая династия — это обычная папка: внутри файл с древом, фото и резервные копии. Папку можно скопировать на флешку или в облако.

Настройки программы лежат рядом с ней, в папке `TaleBranch-data`.

Династии из прошлых версий открываются в новой без потерь.

**Осторожно:** удаление династии стирает её папку целиком, вместе с резервными копиями. Для важных династий держите отдельную копию.

### Это бета

Программа ещё в работе, поэтому возможны ошибки. Пока она есть только для Windows.

Нашли ошибку или неточный перевод? Напишите в [Issues](https://github.com/UerhaU/TaleBranch/issues): какая версия, что вы делали и что пошло не так.

[История изменений](CHANGELOG.md) · [Ваши данные](PRIVACY.md) · [Лицензия GPL-3.0](LICENSE) · [Сторонние компоненты](THIRD_PARTY_NOTICES.md)

TaleBranch — независимый фанатский проект. Он не связан с Electronic Arts и Maxis. The Sims и игровые материалы принадлежат их владельцам.

### Для разработчиков

Нужны Node.js 22.12+ и npm: `npm ci`, затем `npm run dev` и адрес `http://localhost:1420`. Для настольной версии нужны ещё Rust и Tauri 2, сборка — `npm run build:portable`. Проверки: `npm test`, `npx tsc -b`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`. Игровых иконок нет в Git. Без них собирайте с флагом `-AllowMissingIcons`.

## English

**Every branch has a story.**

TaleBranch keeps the family tree of your Sims: who is whose parent, who are friends or rivals, and how each life went. It was made for The Sims 4 dynasties, but works for any world of your own.

### Features

- Profiles for characters and pets: photos for every life stage, traits, aspirations, careers, skills and notes.
- Family and relationship lines on the tree. You can hide the ones you don't need.
- In-game lists with icons, in nine languages.
- The "Auto layout" button sorts a messy tree by generations.
- Undo and redo with Ctrl+Z and Ctrl+Y.
- Six themes, light and dark, plus your own styles.
- Backups: if something breaks, restore an earlier version.
- Save the tree as a PNG image or export the dynasty to a file.

### Getting started

1. Download `TaleBranch-…-portable.zip` from [Releases](https://github.com/UerhaU/TaleBranch/releases).
2. Unzip it into any folder.
3. Double-click the `.exe`. Nothing to install.

If it won't start, install [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). Windows 10 and 11 usually have it already.

### Your dynasties

They stay where you saved them. Each dynasty is a regular folder with the tree, photos and backups, so you can copy it anywhere. App settings live next to the program in `TaleBranch-data`. Dynasties from earlier versions open without losses.

**Careful:** deleting a dynasty erases its whole folder, backups included. Keep a separate copy of the important ones.

### Beta

TaleBranch is still in progress and Windows-only for now. Found a bug or a bad translation? Tell us in [Issues](https://github.com/UerhaU/TaleBranch/issues).

[Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md) · [GPL-3.0 license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

TaleBranch is an independent fan project, not affiliated with Electronic Arts or Maxis. The Sims and game assets belong to their owners.
