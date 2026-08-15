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
> throwing stubs** (`NotImplementedError`). The browser pane is **live** — a host
> `WebContentsView` with cross-isolation routing (PRD-3 direction A, AC3.2) — while
> the Claude pane is a **static design-system visual** for now.

Product specs live in [`docs/`](./docs), one directory per document kind —
`docs/values/`, `docs/prd/` (PRDs + acceptance criteria), `docs/tests/`,
`docs/journeys/`, `docs/mockups/`, and `docs/design-system/`.
[`docs/README.md`](./docs/README.md) is the map: it holds the placement rules,
the full document index, and the link policy.

The 27-screen mockup gallery is published at
**[dlddu.github.io/tessera](https://dlddu.github.io/tessera/)**. GitHub Pages
serves the static files in `docs/` from the `main` branch, so merged mockup
changes are reflected without a separate application build.

> Note: app **auto-update** (`src/main/update/`, electron-updater — periodic check,
> background download, restart prompt) and **diagnostics**
> (`src/main/diagnostics/`, see [Debugging a packaged build](#debugging-a-packaged-build))
> are platform infrastructure outside the four product values (V1–V4). They carry
> no acceptance criteria, journeys, or mockups; their user-facing surfaces are
> registered in
> [`docs/platform/tessera-platform-infrastructure.md`](./docs/platform/tessera-platform-infrastructure.md).

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
    routing/              cross-isolation browser routing — direction A live, direction B stub (PRD-3)
    persistence/          host-side state store — save live, load stub (PRD-4)
    update/               auto-update (electron-updater): periodic check + restart prompt
    diagnostics/          production logging: file log, crash handlers, DevTools escape hatch
    ipc/                  IPC handler registration (aggregator)
  preload/              contextBridge → typed window.tessera
  renderer/             React renderer
    app/                  App shell + single-workspace view (live)
    components/           Window / StatusBar / Pane / dialogs (design-system C-*)
    surfaces/             terminal + editor + browser (WebContentsView) live; Claude static
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
- **HostBackend** (PTY + host file IO) and the **LayoutEngine** are implemented.
  **BrowserRouter** routes direction A (container→host URL opens, AC3.2 — guest
  shim + `$BROWSER` over a per-workspace channel, and terminal web-links, into a
  live browser `WebContentsView`); `BrowserRouter.forwardCallback` (direction B,
  AC3.3) and `PersistenceStore.load` still throw.

## Debugging a packaged build

A `.dmg` launched from Finder discards stdout/stderr, keeps DevTools closed, and
gives the renderer console nowhere to go — so a shipped build needs its own way to
talk. `src/main/diagnostics/` is that channel.

**Log file.** `~/Library/Logs/Tessera/main.log`, rotated at 2 MB (`main.1.log` …
`main.3.log`). Writes are synchronous so the last line before a crash survives. The
folder is named from `productName`, now set in **both** `package.json` and
`electron-builder.yml` so `app.getName()` agrees between a dev run and a packaged one
— they disagreed before, and a case-insensitive APFS volume was all that hid it.

```bash
npm run logs                       # tail -f the active log
TESSERA_LOG_LEVEL=debug npm run dev # or on a packaged launch, to lower the floor
```

Default level is `info` when packaged, `debug` when not. Unpackaged runs also mirror
each line to stdout, so `npm run dev` stays readable.

**What lands there without any extra code.** The renderer's `console.*` is relayed
into the file via `console-message`, so `console.warn` in a component leaves a
durable trace — no import, no new IPC contract. On top of that, each launch logs its
version/Electron/platform and the **resolved PATH** (the `env/fixPath.ts` fix is
invisible when it misses, and the symptom is an unrelated-looking `ENOENT` from the
`container` CLI), plus `uncaughtException`, `unhandledRejection`,
`render-process-gone`, `child-process-gone`, `preload-error`, `did-fail-load`, and
window unresponsiveness. Native `node-pty` crashes leave a minidump under
`app.getPath('crashDumps')` — `crashReporter` runs with `uploadToServer: false`, so
nothing leaves the machine.

**Escape hatch.** In a packaged build:

| Chord       | Effect                                             |
| ----------- | -------------------------------------------------- |
| `Cmd+Alt+I` | Toggle DevTools — Electron's default **View** menu |
| `Cmd+Alt+L` | Reveal the log folder — **Debug** menu             |

`TESSERA_DEBUG=1` opens DevTools automatically on launch. The Debug menu also copies
the log file path to the clipboard.

The log shortcut is a menu accelerator, not `globalShortcut` (which would steal the
chord from every other app) and not `before-input-event` alone. Two reasons, both
learned the hard way: on macOS the Option key _composes_, so `KeyboardEvent.key` for
Option+L is `¬` and never `l`; and `before-input-event` only reaches the focused
webContents, so a chord pressed while a browser surface's `WebContentsView` has focus
never arrives. `isRevealLogsChord` in `logFormat.ts` matches on `code` for that
reason, and is unit-tested against the regression.

**Adding a log line.** Scope it to the module and let the transport handle the rest:

```ts
import { log } from '@main/diagnostics'

const backendLog = log.scope('backend')
backendLog.warn('pty spawn failed', { workspaceId, error: serializeError(error) })
```

Decisions (levels, line layout, error serialization, rotation threshold) live in
`diagnostics/logFormat.ts`, which is Electron-free and unit-tested; `logger.ts` is
the IO around it. Same split as `env/fixPath.ts` and `update/periodicCheck.ts`.

## Next steps (remaining feature work)

J1 steps 1–5 (workspace create · terminal · editor · 2×2 layout · keyboard/drag) are
done. Remaining build order:

1. **Container backend.** Add `dockerode` (or chosen runtime), implement
   `ContainerBackend`, lifecycle + latency (AC2.6), and the host-only area (AC2.7/8).
2. **Remaining surfaces.** Replace the static Claude visual with the Claude Code
   GUI. (Terminal = xterm.js, editor = **CodeMirror 6**, browser = a live host
   **`WebContentsView`** with address bar + navigation — all live.)
3. **Pane zoom + workspace switching.** Wire the focused-pane fullscreen toggle
   (AC1.6) and the workspace list/rail + switching (AC1.7) — both are already designed
   (mockups + design-system `C/P-workspace-rail`) but not implemented.
4. **Browser routing.** Direction A (container→host URL opens, AC3.2) is live;
   implement direction B — OAuth localhost callback host→container forwarding
   (`BrowserRouter.forwardCallback`, AC3.3) — to close the auth loop (PRD-3).
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
