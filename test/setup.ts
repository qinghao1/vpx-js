import { afterAll, beforeAll } from 'vitest'

// Alias mocha globals to vitest (beforeEach/afterEach already come from vitest globals)
declare global {
	var before: typeof beforeAll
	var after: typeof afterAll
}
globalThis.before = beforeAll
globalThis.after = afterAll
