# @tadeo/ai-starter-kit

pnpm monorepo providing a CLI and core utilities to scaffold AI rule files into a project.

## packages

- `packages/cli` — `ai-kit` CLI (`init`, `sync`, `check`)
- `packages/core` — shared filesystem and validation utilities

## install

```sh
pnpm install
pnpm build
```

## usage

```sh
npx ai-kit init    # copy template files into current project
npx ai-kit sync    # sync template files with existing project
npx ai-kit check   # validate project structure
```

## test

```sh
pnpm test
```
