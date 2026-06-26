# Tessera

> **Tessera** is a working codename — a macOS Electron **window multiplexer** that
> binds four developer components (terminal, web browser, text editor, Claude Code
> GUI) into one window / pane / tab surface, and runs each workspace on a **host**
> or **container** backend.
>
> This repository is **past the initial skeleton**: the first journey (**J1, steps
> 1–5**) is implemented — create a host workspace, run a live shell terminal
> (xterm.js + host PTY), edit host files (CodeMirror 6), compose a 2×2 pane/tab
> mosaic, and drive the layout by keyboard or tab drag. The remaining capabilities —
> container backend, browser routing, state restoration/persistence load, pane zoom,
> and workspace switching — still exist as **types, interfaces, IPC contracts, and
> throwing stubs** (`NotImplementedError`), and the browser/Claude panes are
> **static design-system visuals** for now.

Product specs live in [`docs/`](./docs) — values (`tessera-values.md`), PRDs
(`tessera-prd-*.md`), tests (`tessera-test-*.md`), journeys, and the design system
(`docs/design-system/`).

> Note: app **auto-update** (`src/main/update/`, electron-updater — periodic check,
> background download, restart prompt) is platform infrastructure outside the four
> product values (V1–V4). It is wired and unit-tested in code, but intentionally not
> part of the `docs/` product specs.

## Requirements

- **Node.js** — version in [`.nvmrc`](./.nvmrc) (`nvm use`). Node LTS.
- **npm** (bundled with Node).
- **macOS** for packaging a `.dmg` (the build/bundle smoke runs anywhere).

## Setup

```bash
nvm use            # optional, matches .nvmrc
npm install
```

## Commands

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Launch the app with HMR (electron-vite dev). Opens the app shell.        |
| `npm run build`     | Typecheck, then bundle main/preload/renderer to `out/`.                  |
| `npm run preview`   | Preview the production bundle.                                           |
| `npm run typecheck` | `tsc -b` across the node + web project configs (strict).                 |
| `npm run lint`      | ESLint (flat config, `@typescript-eslint`, react-hooks).                 |
| `npm run format`    | Prettier write. `format:check` to verify only.                           |
| `npm test`          | Vitest unit tests (`test/unit/`).                                        |
| `npm run test:e2e`  | Playwright `_electron` e2e (`test/e2e/`). **Run `npm run build` first.** |
| `npm run dist`      | Build + electron-builder → unsigned macOS `.dmg` (macOS only).           |
| `npm run dist:dir`  | Build + electron-builder unpacked dir (no installer).                    |

First run:

```bash
npm install
npm run dev        # see the dark mosaic shell + status bar
```

## Project layout

```
src/
  main/                 Electron main process
    index.ts              app bootstrap (registers IPC, opens window)
    window/               BrowserWindow factory
    workspace/            workspace create + native dialogs (host; live)
    backend/              Backend interface + HostBackend (live) / ContainerBackend (stub) (PRD-2)
    surface/              surface (terminal PTY) lifecycle + output streaming (live)
    routing/              cross-isolation browser routing stub (PRD-3)
    persistence/          host-side state store — save live, load stub (PRD-4)
    update/               auto-update (electron-updater): periodic check + restart prompt
    ipc/                  IPC handler registration (aggregator)
  preload/              contextBridge → typed window.tessera
  renderer/             React renderer
    app/                  App shell + single-workspace view (live)
    components/           Window / StatusBar / Pane / dialogs (design-system C-*)
    surfaces/             terminal + editor live; browser/Claude static; placeholder for the rest
    layout/               LayoutEngine — live split/resize/tab-move/keyboard (PRD-1)
    styles/               tessera.css (copied) + shell.css
  shared/               code shared across processes
    types/                domain types (backend, surface, layout, persistence)
    ipc/                  channel constants + payload contracts + TesseraApi
test/
  unit/                 Vitest unit tests
  e2e/                  Playwright _electron e2e
```

Path aliases (tsconfig + build configs): `@main/*`, `@renderer/*`, `@shared/*`.

### How the pieces connect

- **Renderer** calls `window.tessera.*` (typed by `@shared/ipc`'s `TesseraApi`).
- **Preload** (`src/preload/index.ts`) maps each method to an IPC channel.
- **Main** registers handlers for those channels — the **J1 paths are live**
  (workspace create, terminal surface + PTY streaming, host file read/write), while
  the rest still throw `NotImplementedError` (grep `not implemented` to find what
  needs wiring).
- **HostBackend** (PTY + host file IO) and the **LayoutEngine** are implemented;
  **ContainerBackend**, **BrowserRouter**, and `PersistenceStore.load` still throw.

## Next steps (remaining feature work)

J1 steps 1–5 (workspace create · terminal · editor · 2×2 layout · keyboard/drag) are
done. Remaining build order:

1. **Container backend.** Add `dockerode` (or chosen runtime), implement
   `ContainerBackend`, lifecycle + latency (AC2.6), and the host-only area (AC2.7/8).
2. **Remaining surfaces.** Replace the static browser/Claude visuals with a real
   browser (`WebContentsView`) and the Claude Code GUI. (The terminal already uses
   xterm.js and the editor uses **CodeMirror 6** — both live.)
3. **Pane zoom + workspace switching.** Wire the focused-pane fullscreen toggle
   (AC1.6) and the workspace list/rail + switching (AC1.7) — both are already designed
   (mockups + design-system `C/P-workspace-rail`) but not implemented.
4. **Browser routing.** Implement directions A/B in `BrowserRouter` (PRD-3).
5. **Persistence.** `PersistenceStore.save` is live on workspace create; implement
   debounced `load` + restore-on-restart and reconnect conflict handling (PRD-4).
6. **Production hardening.** Add a Content-Security-Policy (via session headers)
   and bundle IBM Plex fonts locally (currently `@import`-ed from Google Fonts).
7. **Identity.** Confirm the product name (codename `Tessera`), owner, app id
   (placeholder `com.example.tessera`), and signing/notarization certs — then
   rename files/headings and fill the signing placeholders in `electron-builder.yml`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on a macOS runner.

- **`build` job** — every push to `main` and every PR:
  `npm ci` → typecheck → lint → unit test → build (bundle smoke).
- **`package` job** — on PRs only (after `build` passes): packages an
  **unsigned** macOS `.dmg` (arm64) with electron-builder and uploads it as
  a workflow **artifact** named `tessera-dmg-pr<PR number>` (download it from the
  run's Artifacts section; 14-day retention).

e2e is not in CI yet (needs a display).

> Signing/notarization are still placeholders (`electron-builder.yml`,
> `CSC_IDENTITY_AUTO_DISCOVERY: false`) — fill them in once Apple Developer certs
> exist; until then the `.dmg` is unsigned and Gatekeeper will warn.
