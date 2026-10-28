// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import wpcEmuPkg from 'wpc-emu'

/**
 * Resolve a named export from wpc-emu regardless of the ESM/CJS interop
 * shape: flat when Node loads the CJS build, nested under `.default` when a
 * bundler wraps it. A missing export resolves to undefined and fails loudly
 * at first use.
 */
export function resolveWpcEmu<T>(name: string): T {
	const pkg = wpcEmuPkg as Record<string, unknown> | undefined
	const nested = pkg?.default as Record<string, unknown> | undefined
	return (pkg?.[name] ?? nested?.[name]) as T
}
