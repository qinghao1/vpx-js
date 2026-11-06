// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { afterAll, beforeAll } from 'vitest'

// Alias mocha globals to vitest (beforeEach/afterEach already come from vitest globals)
declare global {
	var before: typeof beforeAll
	var after: typeof afterAll
}
globalThis.before = beforeAll
globalThis.after = afterAll
