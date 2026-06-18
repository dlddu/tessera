# Tessera

> **Tessera** is a working codename — a macOS Electron **window multiplexer** that
> binds four developer components (terminal, web browser, text editor, Claude Code
> GUI) into one window / pane / tab surface, and runs each workspace on a **host**
> or **container** backend.
>
> This repository is currently a **bootstrap skeleton**: the app builds and runs,
> the module boundaries (backend abstraction · layout · surfaces · routing ·
> persistence) exist as **types, interfaces, IPC contracts, and throwing stubs**,
> and the UI is a **static design-system shell**. No feature behavior is wired yet.

Product specs live in [`docs/`](./docs) — values (`tessera-values.md`), PRDs
(`tessera-prd-*.md`), tests (`tessera-test-*.md`), journeys, and the design system
(`docs/design-system/`).

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
| `npm run dev`       | Launch the app with HMR (electron-vite dev). Opens the static shell.     |
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
    backend/              Backend interface + Host/Container stubs (PRD-2)
    routing/              cross-isolation browser routing stub (PRD-3)
    persistence/          host-side state store stub (PRD-4)
    ipc/                  IPC handler registration (aggregator)
  preload/              contextBridge → typed window.tessera
  renderer/             React renderer
    app/                  App shell (static 2×2 mosaic)
    components/           Window / StatusBar / Pane (design-system C-*)
    surfaces/             surface registry + non-functional placeholder
    layout/               LayoutEngine stub + static layout fixture (PRD-1)
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
- **Main** registers handlers for those channels — every one currently throws
  `NotImplementedError` (grep `not implemented` to find what needs wiring).
- **Backend / routing / persistence / layout** classes expose real signatures
  and throw the same error.

## Next steps (carried-over feature work)

The skeleton intentionally stops at contracts + a static shell. Build order from
here:

1. **Terminal first → native rebuild.** Install `node-pty` and configure Electron
   **native module rebuild** (electron-rebuild / `npmRebuild` in
   `electron-builder.yml`). This is the biggest hurdle for the first real feature;
   wire `HostBackend.spawnPty` + an xterm.js surface.
2. **Container backend.** Add `dockerode` (or chosen runtime), implement
   `ContainerBackend`, lifecycle + latency (AC2.6), and the host-only area (AC2.7/8).
3. **Real surfaces.** Replace `SurfacePlaceholder` with terminal (xterm.js),
   browser (`WebContentsView`), editor (Monaco — mind Vite worker bundling), and
   the Claude Code GUI.
4. **Layout engine.** Implement `LayoutEngine.serialize/restore` and live
   split/resize/tab-move/keyboard control (PRD-1).
5. **Browser routing.** Implement directions A/B in `BrowserRouter` (PRD-3).
6. **Persistence.** Implement debounced host-side save/load + reconnect
   conflict handling (PRD-4).
7. **Production hardening.** Add a Content-Security-Policy (via session headers),
   bundle IBM Plex fonts locally (currently `@import`-ed from Google Fonts), and
   integrate native macOS traffic lights (`titleBarStyle: 'hiddenInset'`).
8. **Identity.** Confirm the product name (codename `Tessera`), owner, app id
   (placeholder `com.example.tessera`), and signing/notarization certs — then
   rename files/headings and fill the signing placeholders in `electron-builder.yml`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on a macOS runner.

- **`build` job** — every push to `main` and every PR:
  `npm ci` → typecheck → lint → unit test → build (bundle smoke).
- **`package` job** — on PRs only (after `build` passes): packages an
  **unsigned** macOS `.dmg` (arm64 + x64) with electron-builder and uploads it as
  a workflow **artifact** named `tessera-dmg-pr<PR number>` (download it from the
  run's Artifacts section; 14-day retention).

e2e is not in CI yet (needs a display).

> Signing/notarization are still placeholders (`electron-builder.yml`,
> `CSC_IDENTITY_AUTO_DISCOVERY: false`) — fill them in once Apple Developer certs
> exist; until then the `.dmg` is unsigned and Gatekeeper will warn.
