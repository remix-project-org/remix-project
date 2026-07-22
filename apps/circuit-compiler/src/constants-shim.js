// ESM re-export shim over constants-browserify.
// Rspack enforces strict ESM linking (Node-like), so `import { O_TRUNC } from "constants"` in
// fastfile.js (a snarkjs/circom transitive dependency) fails against constants-browserify's
// CJS default-only export — webpack's looser CJS interop synthesized the named bindings at
// runtime, Rspack does not. This shim exposes the POSIX fs-flag constants as real named ESM
// exports so those imports link. Values come straight from constants-browserify.
import constants from 'constants-browserify'

export const O_RDONLY = constants.O_RDONLY
export const O_WRONLY = constants.O_WRONLY
export const O_RDWR = constants.O_RDWR
export const O_CREAT = constants.O_CREAT
export const O_EXCL = constants.O_EXCL
export const O_TRUNC = constants.O_TRUNC
export const O_APPEND = constants.O_APPEND
export const O_SYNC = constants.O_SYNC
export const O_DIRECTORY = constants.O_DIRECTORY

export default constants
