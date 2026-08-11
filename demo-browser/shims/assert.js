function assertFn(condition, message) {
	if (!condition) throw new Error(message || 'Assertion failed')
}
assertFn.ok = function ok(value, message) {
	if (!value) throw new Error(message || 'Assertion failed')
}
// ESM
export default assertFn
export const ok = assertFn.ok
// CJS compatibility for dash-ast's require('assert')
if (typeof module !== 'undefined' && module.exports) {
	module.exports = assertFn
	module.exports.default = assertFn
	module.exports.ok = assertFn.ok
}
// Also support vite's CJS interop
if (typeof globalThis !== 'undefined') {
	globalThis.assert = assertFn
}
