/**
 * Thrown by every not-yet-built stub in the skeleton. Centralizing it lets
 * tests assert "this surface is intentionally unimplemented" and lets feature
 * work grep for the exact call sites that still need wiring.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`not implemented: ${what}`)
    this.name = 'NotImplementedError'
  }
}
