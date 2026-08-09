// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Minimal logger. */
export interface ILogger {
	wtf(f: string, ...a: unknown[]): void
	error(f: string, ...a: unknown[]): void
	warn(f: string, ...a: unknown[]): void
	info(f: string, ...a: unknown[]): void
	verbose(f: string, ...a: unknown[]): void
	debug(f: string, ...a: unknown[]): void
}
/** Progress reporter. */
export interface IProgress {
	start(id: string, title: string): void
	end(id: string): void
	show(action: string, details?: string): void
	details(details: string): void
}

/** Console logger with replaceable singleton. */
export class Logger implements ILogger {
	private static _instance: ILogger = new Logger()
	private static _forcedDebug: boolean | null = null
	static logger(): ILogger {
		return Logger._instance
	}
	static setLogger(l: ILogger): void {
		Logger._instance = l
	}
	static setDebugEnabled(v: boolean): void {
		Logger._forcedDebug = v
	}
	static get isDebugEnabled(): boolean {
		if (Logger._forcedDebug !== null) return Logger._forcedDebug
		try {
			if (typeof location !== 'undefined' && location.search.includes('debug')) return true
		} catch {}
		try {
			if (typeof localStorage !== 'undefined' && localStorage.getItem('vpx:debug') === '1') return true
		} catch {}
		return false
	}
	debug(f: string, ...a: unknown[]): void {
		if (!Logger.isDebugEnabled) return
		console.debug(f, ...a)
	}
	error(f: string, ...a: unknown[]): void {
		console.error(f, ...a)
	}
	info(f: string, ...a: unknown[]): void {
		console.log(f, ...a)
	}
	verbose(f: string, ...a: unknown[]): void {
		if (!Logger.isDebugEnabled) return
		console.debug(f, ...a)
	}
	warn(f: string, ...a: unknown[]): void {
		console.warn(f, ...a)
	}
	wtf(f: string, ...a: unknown[]): void {
		console.error(f, ...a)
	}
}

try {
	const _origDebug = console.debug.bind(console)
	console.debug = (...a: unknown[]) => {
		if (!Logger.isDebugEnabled) return
		_origDebug(...a)
	}
} catch {}

/** Throttled console progress. */
export class Progress implements IProgress {
	private static _instance: IProgress = new Progress()
	private title?: string
	private action?: string
	private lastPrint = 0
	static progress(): IProgress {
		return Progress._instance
	}
	static setProgress(p: IProgress): void {
		Progress._instance = p
	}
	start(_id: string, title: string): void {
		this.title = title
	}
	end(_id: string): void {}
	show(action: string, details?: string): void {
		this.action = action
		this.print(details)
	}
	details(details: string): void {
		this.print(details)
	}
	private print(details?: string): void {
		const now = Date.now()
		if (now - this.lastPrint < 300) return
		this.lastPrint = now
		logger().error('%s: %s%s', this.title, this.action, details ? ` (${details})` : '')
	}
}

export const logger = Logger.logger
export const progress = Progress.progress
