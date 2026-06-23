/**
 * C-editor (live): a CodeMirror 6 editor bound to a host file (M-J1-S3, AC2.2).
 *
 * Flow: an editor tab with no path opens the host file picker
 * (`workspace.pickFile`); once a path is set it reads the file
 * (`backend.readFile`, base64) into the document. The buffer is editable and
 * ⌘S writes it back (`backend.writeFile`). Line-number gutter + minimal syntax
 * colors follow the editor identity hue via a theme mapped to the design tokens.
 *
 * Like {@link TerminalSurface}, the view mounts into a ref'd div on `useEffect`
 * and is disposed on unmount. CodeMirror is pure JS, so no native rebuild.
 */
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { tags as t } from '@lezer/highlight'
import type { TabNode } from '@shared/types'

interface EditorSurfaceProps {
  tab: TabNode
  workspaceId: string
  onSetTabPath: (tabId: string, path: string) => void
}

/* UTF-8-safe base64 transcoding for the IPC `dataBase64` payloads. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function decodeBase64(dataBase64: string): string {
  const binary = atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace'

/** Minimal syntax colors mapped from the design-system C-editor tokens. */
const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#636C80', fontStyle: 'italic' },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword], color: '#c792ea' },
  { tag: [t.string, t.special(t.string)], color: '#56D3A6' },
  { tag: [t.number, t.bool, t.null], color: '#E2A75A' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7CA2F8' },
  { tag: [t.typeName, t.className, t.namespace], color: '#7fd3c1' },
  { tag: t.propertyName, color: '#c7cedd' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#E7EBF2' }
])

/** Editor chrome theme — dark grout, edit-hue caret/active line, mono gutter. */
const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#10131A', color: '#c7cedd', fontSize: '12.5px' },
    '.cm-scroller': { fontFamily: MONO, lineHeight: '1.65' },
    '.cm-content': { caretColor: '#7CA2F8', padding: '10px 0' },
    '.cm-gutters': { backgroundColor: '#0e1118', color: '#636C80', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#c7cedd' },
    '.cm-activeLine': { backgroundColor: 'rgba(124,162,248,0.06)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#7CA2F8' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#7CA2F8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#2A3140'
    }
  },
  { dark: true }
)

export function EditorSurface({ tab, workspaceId, onSetTabPath }: EditorSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Latest path/area for the save keymap, which is bound once at mount.
  const pathRef = useRef<string | undefined>(tab.path)
  const areaRef = useRef(tab.areaId)
  // Guards the one-shot file picker against React StrictMode double-invocation.
  const pickedRef = useRef(false)

  pathRef.current = tab.path
  areaRef.current = tab.areaId

  // Mount the editor view once; ⌘S persists the current buffer.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    function save(view: EditorView): boolean {
      const path = pathRef.current
      if (!path) return false
      void window.tessera.backend.writeFile({
        workspaceId,
        areaId: areaRef.current,
        path,
        dataBase64: encodeBase64(view.state.doc.toString())
      })
      return true
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          syntaxHighlighting(highlightStyle),
          javascript({ typescript: true }),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: save },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap
          ]),
          editorTheme
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [workspaceId])

  // No path yet → open the host file picker once and record the choice.
  useEffect(() => {
    if (tab.path !== undefined || pickedRef.current) return
    pickedRef.current = true
    window.tessera.workspace
      .pickFile()
      .then(({ path }) => {
        if (path) onSetTabPath(tab.id, path)
      })
      .catch(() => {
        // Picker failed/cancelled — leave the editor empty.
      })
  }, [tab.path, tab.id, onSetTabPath])

  // Path set → read the host file and load it into the document.
  useEffect(() => {
    const path = tab.path
    if (path === undefined) return
    let cancelled = false
    window.tessera.backend
      .readFile({ workspaceId, areaId: tab.areaId, path })
      .then(({ dataBase64 }) => {
        const view = viewRef.current
        if (cancelled || !view) return
        const text = decodeBase64(dataBase64)
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      })
      .catch((err: unknown) => {
        const view = viewRef.current
        if (cancelled || !view) return
        const message = err instanceof Error ? err.message : String(err)
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: `// 파일을 열지 못했습니다: ${message}\n`
          }
        })
      })
    return () => {
      cancelled = true
    }
  }, [tab.path, tab.areaId, workspaceId])

  return <div className="editor-surface" ref={hostRef} data-testid="editor-surface" />
}
