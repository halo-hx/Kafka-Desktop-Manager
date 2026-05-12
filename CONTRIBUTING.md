# Contributing to Kafka Desktop Manager

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to Kafka Desktop Manager. These are mostly guidelines, not rules — use your best judgment and feel free to propose changes to this document in a pull request.

## Code of Conduct

This project is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## How can I contribute?

### 🐛 Reporting bugs

- Search [existing issues](https://github.com/halo-hx/Kafka-Desktop-Manager/issues) before opening a new one.
- Use the **Bug Report** issue template and fill in every section.
- Include your OS, Kafka version, app version and reproduction steps.
- If possible, attach logs (`~/Library/Logs/io.github.halo-hx.kafka-desktop-manager` on macOS) and screenshots.

### 💡 Suggesting features

- Open a **Feature Request** issue describing the problem, not just the solution.
- Explain the use-case and any alternatives you considered.

### 🔧 Pull Requests

1. Fork the repo and create your branch from `main` (`git checkout -b feat/my-feature`).
2. Keep PRs focused — one feature / fix per PR.
3. Follow the coding style (see below) — CI will reject otherwise.
4. Add / update tests when appropriate.
5. Update documentation (`README.md`, `docs/`, JSDoc / rustdoc).
6. Ensure `pnpm build`, `cargo check`, `cargo test`, `cargo clippy` and `pnpm lint` all pass.
7. Write a descriptive commit message following [Conventional Commits](https://www.conventionalcommits.org/).
8. Open the PR and link any related issues.

## Development setup

```bash
# Prerequisites: Node.js ≥ 18, pnpm ≥ 8, Rust stable
pnpm install
pnpm tauri dev
```

### Useful commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Vite dev server only (no Tauri shell) |
| `pnpm tauri dev` | Full desktop app in dev mode |
| `pnpm build` | Type-check and build frontend |
| `pnpm lint` | Lint TypeScript / React code |
| `pnpm format` | Format frontend with Prettier |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `cargo fmt --all` | Format Rust code |
| `cargo clippy --all-targets -- -D warnings` | Lint Rust code |
| `cargo test` | Run Rust unit + integration tests |

## Coding style

### TypeScript / React

- Strict mode is enabled — no `any`, no implicit `any`.
- Prefer function components + hooks.
- Use Zustand for global state (see [src/stores](src/stores)).
- Keep components small and composable.
- Run `pnpm lint` + `pnpm format` before committing.

### Rust

- Edition 2021, stable toolchain.
- `rustfmt` + `clippy` are enforced in CI (`-D warnings`).
- Prefer `thiserror` for error types.
- Use `#[tauri::command]` for IPC handlers in `src-tauri/src/commands/`.
- Avoid `unwrap()` / `expect()` in command handlers — return typed errors.

## Commit message format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]
[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:

```
feat(topic): support per-partition offset reset
fix(connect): handle 404 when listing connectors
docs(readme): add Linux build instructions
```

## Release process

Maintainers only:

1. Bump version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Update `CHANGELOG.md`.
3. Tag the release: `git tag vX.Y.Z && git push --tags`.
4. GitHub Actions will build and publish artifacts automatically.

## Questions?

Feel free to open a [Discussion](https://github.com/halo-hx/Kafka-Desktop-Manager/discussions) — we're happy to help.
