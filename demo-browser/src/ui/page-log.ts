// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export interface PageLog {
	(msg: string, level?: 'info' | 'debug' | 'warn' | 'error'): void
	/** The retained entries, one per line (debug panel "Copy log", e2e `vpx.log()`). */
	text(): string
}

/** The page log: the last `limit` entries in memory, each mirrored to the console. */
export function createLog(limit = 600): PageLog {
	const entries: string[] = []
	const log: PageLog = (msg, level = 'info') => {
		entries.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
		if (entries.length > limit) entries.shift()
		if (level === 'error') console.error('[vpx:err]', msg)
		else if (level === 'warn') console.warn('[vpx]', msg)
		else console.log('[vpx]', msg)
	}
	log.text = () => entries.join('\n')
	return log
}
