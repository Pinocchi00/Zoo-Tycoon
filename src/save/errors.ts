/** Why a save could not be read. Every case is expected (damaged file, old game, newer game). */
export type SaveError =
  | { readonly kind: 'invalidJson' }
  | { readonly kind: 'invalidEnvelope'; readonly path: string }
  | { readonly kind: 'unsupportedFormat'; readonly formatVersion: number }
  | { readonly kind: 'checksumMismatch' }
  | { readonly kind: 'invalidPayload' }
  | { readonly kind: 'versionFromFuture'; readonly version: number }
  | { readonly kind: 'missingMigration'; readonly from: number }
  | { readonly kind: 'migrationFailed'; readonly from: number; readonly reason: string }
  | { readonly kind: 'invalidState'; readonly path: string };
