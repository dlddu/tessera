/**
 * Central key-hint overlay (P-overlay, M-J1-S5, AC1.4). A bottom-center capsule
 * of keycaps that keeps the focus / tab-switch / tab-move shortcuts discoverable
 * while the user works the layout from the keyboard. Purely decorative: it is
 * `pointer-events:none` (see `.keymap-overlay`) so it never intercepts clicks,
 * and mirrors the M-J1-S5 mockup's overlay. The status bar carries the same
 * hints in condensed form.
 */
export function KeymapOverlay() {
  return (
    <div className="keymap-overlay" data-testid="keymap-overlay" aria-hidden="true">
      <span className="row-gap">
        <span className="muted">포커스</span>{' '}
        <span className="kcrow">
          <span className="kc">⌥⌘</span>
          <span className="plus">+</span>
          <span className="kc">←</span>
          <span className="kc">→</span>
          <span className="kc">↑</span>
          <span className="kc">↓</span>
        </span>
      </span>
      <span className="row-gap">
        <span className="muted">탭 전환</span>{' '}
        <span className="kcrow">
          <span className="kc">⇧⌘</span>
          <span className="plus">+</span>
          <span className="kc">[</span>
          <span className="kc">]</span>
        </span>
      </span>
      <span className="row-gap">
        <span className="muted">탭 이동</span>{' '}
        <span className="kcrow">
          <span className="kc">⌃⌘</span>
          <span className="plus">+</span>
          <span className="kc">←</span>
          <span className="kc">→</span>
          <span className="kc">↑</span>
          <span className="kc">↓</span>
        </span>{' '}
        <span className="faint">또는 드래그</span>
      </span>
      <span className="row-gap">
        <span className="muted">전체화면</span>{' '}
        <span className="kcrow">
          <span className="kc">⇧⌘</span>
          <span className="plus">+</span>
          <span className="kc">⏎</span>
        </span>{' '}
        <span className="faint">복귀 Esc</span>
      </span>
      <span className="row-gap">
        <span className="muted">워크스페이스 닫기</span>{' '}
        <span className="kcrow">
          <span className="kc">⇧⌘</span>
          <span className="plus">+</span>
          <span className="kc">W</span>
        </span>
      </span>
    </div>
  )
}
