// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Minimal logger contract. */
export interface ILogger {
	wtf(format: string, ...args: unknown[]): void
	error(format: string, ...args: unknown[]): void
	warn(format: string, ...args: unknown[]): void
	info(format: string, ...args: unknown[]): void
	verbose(format: string, ...args: unknown[]): void
	debug(format: string, ...args: unknown[]): void
}

/** Progress reporter contract. */
export interface IProgress {
	start(id: string, title: string): void
	end(id: string): void
	show(action: string, details?: string): void
	details(details: string): void
}

/** Console-backed logger with replaceable singleton. */
export class Logger implements ILogger {
	private static _instance: ILogger = new Logger()

	static logger(): ILogger {
		return Logger._instance
	}
	static setLogger(l: ILogger): void {
		Logger._instance = l
	}

	debug(format: string, ...args: unknown[]): void {
		console.debug(format, ...args)
	}
	error(format: string, ...args: unknown[]): void {
		console.error(format, ...args)
	}
	info(format: string, ...args: unknown[]): void {
		console.log(format, ...args)
	}
	verbose(format: string, ...args: unknown[]): void {
		console.debug(format, ...args)
	}
	warn(format: string, ...args: unknown[]): void {
		console.warn(format, ...args)
	}
	wtf(format: string, ...args: unknown[]): void {
		console.error(format, ...args)
	}
}

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
