// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Console logger with global singleton. */
export class Logger implements ILogger {
	private static instance: ILogger = new Logger()

	static logger(): ILogger {
		return Logger.instance
	}
	static setLogger(l: ILogger): void {
		Logger.instance = l
	}

	debug(format: any, ...param: any[]): void {
		console.debug(format, ...param)
	}
	error(format: any, ...param: any[]): void {
		console.error(format, ...param)
	}
	info(format: any, ...param: any[]): void {
		console.log(format, ...param)
	}
	verbose(format: any, ...param: any[]): void {
		console.debug(format, ...param)
	}
	warn(format: any, ...param: any[]): void {
		console.warn(format, ...param)
	}
	wtf(format: any, ...param: any[]): void {
		console.error(format, ...param)
	}
}

/** Logger interface used throughout the engine. */
export interface ILogger {
	wtf(format: any, ...param: any[]): void
	error(format: any, ...param: any[]): void
	warn(format: any, ...param: any[]): void
	info(format: any, ...param: any[]): void
	verbose(format: any, ...param: any[]): void
	debug(format: any, ...param: any[]): void
}

/** Throttled console progress reporter. */
export class Progress implements IProgress {
	private currentTitle?: string
	private currentAction?: string
	private _lastPrint = 0
	private static instance: IProgress = new Progress()

	static progress(): IProgress {
		return Progress.instance
	}
	static setProgress(p: IProgress): void {
		Progress.instance = p
	}

	/** Starts a major operation. */
	start(_id: string, title: string): void {
		this.currentTitle = title
	}

	/** Ends a major operation. */
	end(_id: string): void {}

	/** Shows current action and optional details. */
	show(action: string, details?: string): void {
		this.currentAction = action
		this.print(details)
	}

	/** Updates details for the current action. */
	details(details: string): void {
		this.print(details)
	}

	private print(details?: string): void {
		const now = Date.now()
		if (now - this._lastPrint < 300) return
		this._lastPrint = now
		logger().error('%s: %s%s', this.currentTitle, this.currentAction, details ? ` (${details})` : '')
	}
}

/** Progress reporter contract. */
export interface IProgress {
	start(id: string, title: string): void
	end(id: string): void
	show(action: string, details?: string): void
	details(details: string): void
}

export const logger = Logger.logger
export const progress = Progress.progress
