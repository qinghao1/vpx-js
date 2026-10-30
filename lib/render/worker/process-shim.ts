// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/**
 * Minimal `process`/`global`/`Buffer` shape for worker scopes. The demo page
 * provides this inline, but workers get no page script — and the bundler only
 * injects a bare `{env, browser, platform}` fallback without `.on`, which is
 * what Node-oriented deps (wpc-emu via the scripting chain) call at module
 * scope. Only the keys the worker actually needs are filled in; existing
 * values are never overwritten.
 */

const PROCESS_SHAPE: Record<string, unknown> = {
	env: {},
	browser: true,
	platform: 'browser',
	on: () => {},
}

/** Fill missing `process` keys on `host` (defaults to globalThis); never overwrites. */
export function ensureProcessShim(host: Record<string, unknown> = globalThis as Record<string, unknown>): void {
	let current = host.process as Record<string, unknown> | undefined
	if (!current || typeof current !== 'object') {
		current = {}
		host.process = current
	}
	for (const key of Object.keys(PROCESS_SHAPE)) {
		if (current[key] === undefined) current[key] = PROCESS_SHAPE[key]
	}
	if (host.global === undefined) host.global = host
	if (host.Buffer === undefined) host.Buffer = { isBuffer: () => false }
}
