/**
 * Static app shell. Renders the design-system window with a 2×2 mosaic of the
 * four surface placeholders. Nothing here is interactive — it is the skeleton
 * the real layout engine + surfaces will replace.
 */
import { Pane, Window } from '@renderer/components'
import { SURFACE_META } from '@renderer/surfaces'

export function App() {
  return (
    <Window workspace="tessera" backendBadge="host" backendLabel="host · stub">
      <div className="col">
        <div className="row">
          <Pane meta={SURFACE_META.terminal} />
        </div>
        <div className="row">
          <Pane meta={SURFACE_META.editor} />
        </div>
      </div>
      <div className="col">
        <div className="row">
          <Pane meta={SURFACE_META.browser} />
        </div>
        <div className="row">
          <Pane meta={SURFACE_META.claude} focused />
        </div>
      </div>
    </Window>
  )
}
