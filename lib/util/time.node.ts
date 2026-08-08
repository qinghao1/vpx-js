// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** High-resolution time in milliseconds. */
export function now(): number {
	const hrtime = (globalThis as unknown as { process?: { hrtime?: { bigint?: () => bigint } } }).process?.hrtime?.bigint
	if (typeof hrtime === 'function') return Number(hrtime()) / 1e6
	return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}
