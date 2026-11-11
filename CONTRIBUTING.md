# Contributing

Use Node.js 22.18+, 24, or 26 and the pnpm version in `package.json`.

```sh
pnpm install
pnpm build-watch
```

The implementation lives in `src/config.ts`, `src/export.ts`, `src/blocks`, `src/io`, and `src/cli`. Tests use small local feeds and run without network access.

Before submitting changes:

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:release
```

Use `pnpm format` to format files. Always use braces for control flow. Bug reports should include the command, config with credentials removed, expected output, and a public link to the static GTFS feed when possible.

## Releases

Release-it checks formatting, lint, types, tests, and the packed artifact before publication. From a clean, up-to-date `main` branch, use `pnpm exec release-it major` for the next major release. Use `--dry-run` to review the release first. It manages the version, changelog, tag, npm publication, and GitHub release. A prerelease can use `--preRelease=beta --npm.tag=beta`.
