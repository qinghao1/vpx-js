// Zero-dependency isomorphic assert

export function ok(value: unknown, message?: string): asserts value {
	if (!value) throw new Error(message || 'Assertion failed')
}

export function equal(actual: unknown, expected: unknown, message?: string): void {
	if (actual != expected) throw new Error(message || `${actual} != ${expected}`)
}

export function strictEqual(actual: unknown, expected: unknown, message?: string): void {
	if (actual !== expected) throw new Error(message || `${actual} !== ${expected}`)
}

export function notEqual(actual: unknown, expected: unknown, message?: string): void {
	if (actual == expected) throw new Error(message || `${actual} == ${expected}`)
}

export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void {
	if (actual === expected) throw new Error(message || `${actual} === ${expected}`)
}

export function deepEqual(actual: unknown, expected: unknown, message?: string): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message || 'deepEqual failed')
}

const assert = Object.assign(ok, {
	ok,
	equal,
	strictEqual,
	notEqual,
	notStrictEqual,
	deepEqual,
	default: ok,
})

export default assert
