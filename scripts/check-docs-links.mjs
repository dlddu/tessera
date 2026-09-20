#!/usr/bin/env node
/**
 * check-docs-links.mjs — docs/ 안의 모든 내부 링크가 실존 파일로 해석되는지 확인한다.
 *
 * 왜 필요한가: docs/ 는 GitHub Pages 로 그대로 서빙되고, 허브(docs/index.html)는 문서를
 * `reader.html?doc=<docs 기준 경로>` 로 연다. 문서를 옮기면 세 종류의 참조가 한꺼번에 상한다 —
 * 마크다운 상대 링크, HTML href/src, 그리고 허브의 doc= 쿼리. 셋 다 검사해야 "옮겼는데
 * 링크만 안 고쳤다" 를 커밋 전에 잡는다.
 *
 * 검사 대상 (모두 docs/ 안)
 *   1. *.md  의 마크다운 링크·이미지  [x](target) / ![x](target)
 *   2. *.html 의 href="…" / src="…"
 *   3. *.html 의 reader.html?doc=<path>  — path 는 docs/ 기준으로 해석한다
 *
 * 검사 제외: 절대 URL(scheme:// · //host · mailto:) · 순수 프래그먼트(#x) · 빈 타깃.
 * 프래그먼트·쿼리는 잘라내고 파일 존재만 본다(앵커 유효성은 이 스크립트의 범위 밖).
 *
 * 인라인 <script>·<style> 블록은 읽지 않는다 — reader.html 의 마크다운 렌더러처럼 링크를
 * *문자열로 조립하는* 코드가 들어 있어(`'<a href="$2">'`) 정적 타깃으로 볼 수 없다. 그래서 이
 * 검사는 정적 링크만 본다: 런타임에 만들어지는 링크는 범위 밖이다.
 *
 * 종료 코드: 깨진 참조 0건이면 0, 1건 이상이면 1.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')

/** docs/ 아래 모든 파일 경로(재귀). */
function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** 외부/비파일 타깃인가 — 검사하지 않는다. */
function isExternal(t) {
  return (
    t === '' || t.startsWith('#') || t.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(t) // http:, https:, mailto:, data: …
  )
}

/** 프래그먼트·쿼리를 떼고 퍼센트 인코딩을 푼다. */
function toPath(t) {
  const bare = t.split('#')[0].split('?')[0]
  try {
    return decodeURIComponent(bare)
  } catch {
    return bare
  }
}

const files = walk(DOCS)
const broken = []
let checked = 0

/** @param {string} from 참조가 실린 파일 @param {string} base 해석 기준 디렉터리 */
function check(from, base, raw, kind) {
  if (isExternal(raw)) return
  const p = toPath(raw)
  if (p === '') return // '#frag' 만 있던 경우
  checked++
  const target = resolve(base, p)
  // docs/ 밖으로 나가는 참조도 레포 안이면 유효하다(예: ../README.md 는 없지만 ../../ 등).
  const ok = existsSync(target) && (statSync(target).isFile() || statSync(target).isDirectory())
  if (!ok) {
    broken.push({ from: relative(ROOT, from), raw, kind, resolved: relative(ROOT, target) })
  }
}

for (const f of files) {
  const rel = relative(ROOT, f)
  const dir = dirname(f)

  if (f.endsWith('.md')) {
    const src = readFileSync(f, 'utf8')
    // 코드펜스 안은 예시일 수 있으므로 제외한다.
    const body = src.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '')
    for (const m of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) check(f, dir, m[1], 'md-link')
    continue
  }

  if (f.endsWith('.html')) {
    const src = readFileSync(f, 'utf8')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    for (const m of src.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/g)) {
      const raw = m[1]
      // reader.html?doc=<path> — doc 값은 docs/ 기준 경로다.
      const q = raw.match(/^reader\.html\?doc=([^"&]+)$/)
      if (q) {
        check(f, DOCS, q[1], 'hub-doc')
        // reader.html 자체도 실존해야 한다.
        check(f, dir, 'reader.html', 'html-ref')
        continue
      }
      check(f, dir, raw, 'html-ref')
    }
    continue
  }

  void rel
}

if (broken.length === 0) {
  console.log(`docs 링크 ${checked}건 검사 — 깨진 참조 0건`)
  process.exit(0)
}

console.error(`docs 링크 ${checked}건 검사 — 깨진 참조 ${broken.length}건:`)
for (const b of broken) {
  console.error(`  ${b.from}  [${b.kind}]  ${b.raw}  →  ${b.resolved.split(sep).join('/')} (없음)`)
}
process.exit(1)
