// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { logger } from '../util/logger.js'

// One process-wide "warned" flag per key, so unsupported-input no-ops stay
// audible without spamming once per frame.
const warned = new Set<string>()

export function warnOnce(key: string, message: string, ...args: unknown[]): void {
	if (warned.has(key)) return
	warned.add(key)
	logger().warn(message, ...args)
}

/** Reset warn-once flags (specs only — keeps per-test warnings observable). */
export function resetWarnOnce(): void {
	warned.clear()
}
