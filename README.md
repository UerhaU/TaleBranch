# TaleBranch

**v0.1.0-alpha.1 · Early alpha / Ранняя альфа**

[Русский](#русский) · [English](#english)

## Русский

**У каждой ветви — своя история.**

TaleBranch — разрабатываемое локальное приложение для семейных древ, связей и историй персонажей. Проект задуман прежде всего для династий The Sims 4, но подходит и для персонажей собственных вымышленных миров.

### Состояние проекта

**Ранняя альфа: рабочий прототип, который ещё активно меняется.** Это первая публичная демонстрация основы приложения, а не завершённый продукт. Часть возможностей реализована, другие пока представлены заготовками. Возможны ошибки и изменения интерфейса, формата проектов и поведения функций.

В прототипе есть поле древа, карточки персонажей и питомцев, родственные и личные связи, биографии, фотографии этапов жизни, локальное сохранение и экспорт. Наличие функции в интерфейсе не означает, что она полностью готова и проверена во всех сценариях.

Пока не завершены хранение в SQLite и отдельных файлах медиа, автоматические резервные копии, история профессий, редактируемые справочники этапов жизни и пользовательские поля. Проверка обновлений и поддержка через DonationAlerts пока представлены заглушками. В текущей реализации данные и фотографии хранятся в localStorage, объём которого ограничен. Для экспериментов используйте тестовые проекты; нужные данные сохраняйте отдельным экспортом.

На поле древа отображается родство «родитель → ребёнок». Личные отношения хранятся и редактируются в профилях персонажей.

Это выпуск исходного кода. Готовые установщики TaleBranch пока не публикуются.

### Запуск из исходников

Требуется Node.js 22.12+ или более новая поддерживаемая версия и npm.

```bash
npm ci
npm run dev
```

Откройте `http://localhost:1420`. Это режим разработки интерфейса в браузере. Для настольного режима дополнительно нужны Rust и зависимости Tauri 2 для вашей ОС.

Проверки:

```bash
npm test
npx tsc -b
```

Основная целевая платформа — Windows x64. Поддержка других настольных ОС пока не подтверждена. Минимальный размер окна — 1024 × 720.

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

**Early alpha: a working prototype under active development.** This is the first public demonstration of the application's foundation, rather than a finished product. Some features are implemented; others are placeholders. Expect bugs and changes to the interface, project format, and feature behavior.

The prototype includes a tree canvas, character and pet profiles, family and personal relationships, biographies, life-stage photos, local saving, and export. A feature appearing in the interface does not mean it is complete or tested in every scenario.

SQLite storage, separate media files, automatic backups, career history, editable life-stage definitions, and custom fields are not complete. Update checking and DonationAlerts support are currently placeholders. Data and photos are currently stored in localStorage, which has limited capacity. Use test projects while exploring, and export separate copies of any data you want to keep.

The tree canvas displays parent–child connections. Personal relationships are stored and edited in character profiles.

This is a source-code release. TaleBranch installers are not published yet.

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
