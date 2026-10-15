# Участие в разработке / Contributing

## Русский

TaleBranch находится на ранней стадии разработки. Ошибки и предложения можно оставлять в GitHub Issues. Для исправлений перевода используйте шаблон **Translation correction / Исправление перевода**: язык, где ошибка, текущий текст и правильный вариант.

Для изменения кода создайте отдельную ветку. Сохраняйте интерфейс доступным с клавиатуры и проверяйте окно 1024 × 720. Перед pull request выполните:

```bash
npm ci
npm test
npx tsc -b
```

Не добавляйте личные проекты, фотографии пользователей, секреты, готовые сборки и чужие игровые ассеты. Используйте вымышленные тестовые данные. Сохраняйте совместимость существующих экспортов и ключей локального хранилища. Для новых зависимостей обновляйте THIRD_PARTY_NOTICES.md.

Windows-сборки запускаются отдельно, вручную, при подготовке выпуска. Скрипт `npm run build:windows` требует Rust и зависимостей Tauri 2 для Windows. Нестандартные локальные пути можно настроить в игнорируемом файле `scripts/dev-env.local.ps1`.

## English

TaleBranch is in early development. Please use GitHub Issues for bugs and suggestions. For translation corrections, choose **Translation correction / Исправление перевода** and provide the language, location, current wording, and corrected text.

Create a separate branch for code changes. Keep the interface keyboard accessible and check the 1024 × 720 window size. Before opening a pull request, run:

```bash
npm ci
npm test
npx tsc -b
```

Do not include private projects, users' photos, secrets, packaged applications, or third-party game assets. Use fictional test data. Preserve compatibility with existing exports and local storage keys. Update THIRD_PARTY_NOTICES.md when adding dependencies.

Windows builds run separately and manually when preparing a release. `npm run build:windows` requires Rust and the Tauri 2 prerequisites for Windows. Machine-specific paths may be configured in the ignored `scripts/dev-env.local.ps1` file.
