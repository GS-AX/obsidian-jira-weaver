# Contributing to Jira Weaver

Thank you for your interest in contributing! This document covers how to get the project running locally, the conventions used throughout the codebase, and how to submit a pull request.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An Obsidian vault for manual testing

### Install dependencies

```bash
npm install
```

### Build

| Command | Purpose |
|---|---|
| `npm run dev` | Watch mode — rebuilds on every file change |
| `npm run build` | Production build + TypeScript type check |
| `npm run typecheck` | Type check only (no output files) |
| `npm run check-i18n` | Verify i18n key coverage across all locale files |

### Load the plugin in Obsidian

1. Build the project (`npm run build`).
2. Copy `main.js` and `manifest.json` into your test vault at `.obsidian/plugins/jira-weaver/`.
3. Enable **Jira Weaver** under **Settings → Community plugins**.
4. Re-run step 1–2 and reload Obsidian after each code change.

> **Tip:** Symlink `.obsidian/plugins/jira-weaver/` to the repo root so you only need to rebuild.

---

## Project Structure

```
jira-weaver/
├── locales/            # i18n translation files (en, ko, ja, zh)
├── scripts/
│   └── check-i18n.ts  # Translation key coverage checker
├── src/
│   ├── main.ts             # Plugin entry point; lifecycle, sync orchestration
│   ├── types.ts            # Shared TypeScript types and DEFAULT_SETTINGS
│   ├── i18n.ts             # Tiny i18n engine (load, registerDefaults, t())
│   ├── jiraClient.ts       # Jira REST API client
│   ├── fileManager.ts      # Vault file read/write, memo protection
│   ├── markdownBuilder.ts  # Markdown + Frontmatter generation
│   ├── fieldResolver.ts    # Builds the Jira `fields` request list
│   ├── settings.ts         # Settings tab UI
│   ├── fieldMappingTab.ts  # Field mapping tab UI
│   ├── fieldMappingModal.ts# Per-field edit modal
│   ├── syncLogView.ts      # Sync log panel (ItemView)
│   ├── syncScheduler.ts    # Manual / startup / interval trigger logic
│   └── wikiLinkResolver.ts # [[wiki link]] wrapping logic
├── manifest.json
├── package.json
└── tsconfig.json
```

---

## Coding Conventions

### TypeScript

- **Strict mode** (`strictNullChecks`, `noImplicitAny`) is enabled — keep it that way.
- All public API surfaces must be typed explicitly; avoid `any`.
- Prefer `type` aliases over `interface` for plain data shapes; use `interface` for objects that may be extended.

### Comments

- Default to **no comments**. Add one only when the *why* is non-obvious.
- Never describe what the code does — use descriptive identifier names instead.
- No multi-line block comments or JSDoc unless the function is part of a public SDK surface.

### i18n

- Every user-facing string must go through `t("key")` or `i18n.registerDefaults({"key": "fallback"})`.
- Add the key and its English value to `locales/en.json`, then add the translated string to all other locale files (`ko`, `ja`, `zh`).
- Run `npm run check-i18n` before opening a PR to catch missing or stale keys.

### File generation

- Never hardcode English labels in generated Markdown. Use `t("file.label.*")` keys so the output respects the user's language setting.

---

## i18n Workflow

1. Add the new key to `locales/en.json`.
2. Add translations in `locales/ko.json`, `locales/ja.json`, `locales/zh.json`.
3. Register a fallback in the relevant source file via `i18n.registerDefaults({...})` **or** call `t("key")` directly (both are detected by the checker).
4. Run `npm run check-i18n` — it exits non-zero if any key is missing from a locale file.

---

## Pull Request Guidelines

1. **Branch** off `main` with a descriptive name: `feat/multiple-jql-profiles`, `fix/marker-detection`.
2. **Scope** each PR to one logical change. Refactors and feature additions should be in separate PRs.
3. **Test** manually in Obsidian against a real (or sandbox) Jira instance.
4. **Run** `npm run build` and `npm run check-i18n` — both must pass before requesting review.
5. **Describe** *why* the change is needed in the PR body, not just what changed.
6. **Translations**: if you add new user-facing text but cannot translate all four languages, open the PR and note which locales need help — a maintainer or community member can fill them in.

---

## Reporting Issues

Please open a GitHub issue with:

- Obsidian version
- Plugin version
- Steps to reproduce
- Expected vs. actual behaviour
- Any relevant console errors (open **Developer Tools** via `Ctrl/Cmd+Shift+I`)

---

## License

By contributing you agree that your changes will be released under the [MIT License](LICENSE).
