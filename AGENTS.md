# Repository Guidelines

## Project Structure & Module Organization

This repository is a Node.js ES module collection of standalone ZJU utility scripts. Service-specific scripts live in `courses.zju/`, `classroom.zju/`, `lib.zju/`, and `webplus.zju/`. Shared reusable code belongs in `shared/`; individual scripts should depend on `shared/`, not on each other. Runtime output such as `downloads/`, `logs/`, and local `.env` files is ignored.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies using the package manager declared in `package.json`.
- `npm install`: acceptable when following the README or maintaining `package-lock.json`.
- `node courses.zju/todolist.js`: run one script directly from the repository root; replace the path with the script you are testing.
- `node shared/cli-entry.js help`: inspect the unified CLI without global linking.
- `node shared/cli-entry.js start|stop|status|logs`: manage the background daemon.
- `node shared/cli-entry.js actions`: list registered actions and bot-ready status.
- `npm link` then `zlb` or `zbl`: expose the unified CLI globally.

There is no build step; scripts run directly in Node.

## Coding Style & Naming Conventions

Use modern JavaScript ES modules (`import`/`export`) and keep new code Prettier-compatible. Newer files generally use two-space indentation, semicolons, single quotes, and descriptive camelCase identifiers. Preserve the style of older scripts when making local fixes; avoid PRs dominated by formatting churn. Name service scripts by task, for example `materialDown.js`, `quizanswer.js`, or `generateCourseMd.js`.

## Testing Guidelines

No automated test suite is currently configured. Validate changes by running the affected script from the repository root and, when relevant, the CLI selector. For shared helper changes, smoke-test every script path that imports the helper. Do not commit generated files or credentials.

## Commit & Pull Request Guidelines

Follow Conventional Commits, as reflected in history: `feat: ...`, `fix(doc): ...`, `feat(quizanswer): ...`, or `add: courses.zju/scores`. Keep commits focused on one script or shared behavior. For feature work, open an issue first to discuss the design. PRs should state the affected service/script, summarize behavior changes, list manual verification commands, link related issues, and include terminal output or screenshots when the user-facing CLI output changes.

## Security & Configuration Tips

Store credentials only in `.env`, typically `ZJU_USERNAME`, `ZJU_PASSWORD`, and optional service-specific values such as `PINTIA_COOKIE`. Prefer convention over broad configuration; if a setting is not generally useful, document it in a short comment near the script entry point instead of expanding global docs or config.
