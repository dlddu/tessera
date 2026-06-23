/**
 * C-browser (static visual): the renderer-side surface for a browser tab
 * (M-J1-S4). This is a presentational stand-in — it mirrors the `.browser` DOM
 * from the M-J1-S4 mockup (tab strip + address bar + a skeleton page) using the
 * existing design-system classes, with no live BrowserView/webContents behind
 * it. The real embedded web view is later feature work (PRD-3 / J3); until then
 * this gives the 2×2 layout a faithful browser pane to compose with.
 */
export function BrowserSurface() {
  return (
    <div className="browser" data-testid="browser-surface">
      <div className="bchrome">
        <div className="btabs">
          <div className="btab active">
            <span className="fav" />
            Vite App
          </div>
        </div>
        <div className="baddr">
          <span className="nav">‹ › ⟳</span>
          <div className="url">
            <span className="lock">🔒</span>
            <span className="host">localhost:5173</span>
            <span className="rest">/</span>
          </div>
        </div>
      </div>
      <div className="bview">
        <div className="page-bar">
          <div className="b-logo" style={{ background: 'var(--id-web)' }} />
          <div className="skline" style={{ width: '130px', background: '#222a37' }} />
        </div>
        <div className="skline" style={{ width: '64%', height: '13px', marginBottom: '12px' }} />
        <div className="skline" style={{ width: '84%', marginBottom: '9px' }} />
        <div className="skline" style={{ width: '74%', marginBottom: '9px' }} />
        <div className="skline" style={{ width: '48%' }} />
      </div>
    </div>
  )
}
