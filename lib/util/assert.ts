// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Minimal browser-safe `assert` for Node core imports (only caller is `escope`). */
export default function assert(value: unknown, message?: string): asserts value {
	if (!value) throw new Error(message ?? 'Assertion failed')
}
