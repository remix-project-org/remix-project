export * from './lib/remix-ui-editor'
// monaco.ts is a pure ambient type-definitions file ending in `export default monaco`; the
// `declare namespace monaco` has no runtime value, so this MUST be a type-only re-export.
// Emitting it as a value edge pulls monaco.ts into the runtime graph, where the stripped
// namespace leaves `export default monaco` referencing an undefined `monaco` (production
// tree-shaking hid this by dropping the dead module; a non-DCE dev build throws at eval).
export type { default as monacoTypes } from './types/monaco'