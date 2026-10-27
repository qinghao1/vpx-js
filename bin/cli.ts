import { existsSync, readFileSync } from 'node:fs'
import { Progress } from '../lib/index.js'
import { Logger } from '../lib/util/logger.js'

// Shared scaffold for the legacy bin/* CLIs: exit-code handling, usage errors,
// input-file loading, and log-silencing helpers.
export function run(main: () => void | Promise<void>): void {
	const fail = (error: unknown): void => {
		console.error(error)
		process.exit(1)
	}
	let result: void | Promise<void>
	try {
		result = main()
	} catch (error) {
		fail(error)
		return
	}
	if (result instanceof Promise) {
		result.then(() => process.exit(), fail)
	} else {
		process.exit()
	}
}

export function readInputFile(fileArg: string | undefined, usage: string): string {
	if (!fileArg) {
		throw new Error(usage)
	}
	if (!existsSync(fileArg)) {
		throw new Error(`Cannot find "${fileArg}".`)
	}
	return readFileSync(fileArg).toString()
}

const noop = (..._args: unknown[]): void => {}

export function silenceProgress(): void {
	Progress.setProgress({ details: noop, end: noop, show: noop, start: noop })
}

export function silenceLogger(): void {
	Logger.setLogger({ debug: noop, error: noop, info: noop, warn: noop, wtf: noop })
}
