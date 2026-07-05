/**
 * C-keycap — a shortcut hint chip rendered from a registry {@link KeyCap}: a
 * modifier cluster, a `+`, then the key glyph(s). Both the key-hint overlay and
 * the status bar render through this from the shared command registry, so a
 * rebinding updates every on-screen hint at once (no hand-typed glyphs to drift
 * out of sync with what the keys actually do — the point of J2-S5's single
 * source).
 */
import type { KeyCap } from '@renderer/commands'

export function Keycap({ keycap }: { keycap: KeyCap }) {
  return (
    <span className="kcrow">
      <span className="kc">{keycap.mods}</span>
      <span className="plus">+</span>
      {keycap.keys.map((key) => (
        <span className="kc" key={key}>
          {key}
        </span>
      ))}
    </span>
  )
}
