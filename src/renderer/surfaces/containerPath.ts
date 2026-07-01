/**
 * POSIX path math for container guest paths (M-J2-S3). The renderer must never
 * use the host's path module for these — guest paths are always POSIX, whatever
 * the host platform. Kept component-free so the file browser stays fast-refresh
 * friendly and the helpers stay directly unit-testable.
 */

/** Append one entry name to a POSIX directory path. */
export function joinContainerPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

/** The parent of a POSIX path; the root is its own parent. */
export function parentContainerPath(path: string): string {
  if (path === '/') {
    return '/'
  }
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}
