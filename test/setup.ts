import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

// Alias mocha globals to vitest
// @ts-expect-error
globalThis.before = beforeAll
// @ts-expect-error
globalThis.after = afterAll
// @ts-expect-error
globalThis.beforeEach = beforeEach
// @ts-expect-error
globalThis.afterEach = afterEach
