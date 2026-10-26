// Single TAP helper for test/harness/* — one output dialect, real 1..N plans.
export function tapHeader(label: string): void {
	console.log(`TAP version 13\n# ${label} — ${new Date().toISOString()}`)
}

export function tapPlan(count: number): void {
	console.log(`1..${count}`)
}

export function tapOk(num: number, name: string, directive?: string): void {
	console.log(directive ? `ok ${num} - ${name} # ${directive}` : `ok ${num} - ${name}`)
}

export function tapSkip(num: number, name: string, reason: string): void {
	tapOk(num, name, `SKIP ${reason}`)
}

export function tapNotOk(num: number, name: string, suffix?: string): void {
	console.log(suffix ? `not ok ${num} - ${name} ${suffix}` : `not ok ${num} - ${name}`)
}

export function tapComment(message: string): void {
	console.log(`# ${message}`)
}

// Streaming TAP with auto-numbering; the plan prints last (valid TAP 13),
// so callers need no upfront assert count.
export class Tap {
	private total = 0
	private failed = 0

	constructor(label?: string) {
		if (label) tapHeader(label)
	}

	assert(cond: boolean, name: string): void {
		this.total++
		if (cond) tapOk(this.total, name)
		else {
			this.failed++
			tapNotOk(this.total, name)
		}
	}

	done(): boolean {
		tapPlan(this.total)
		return this.failed === 0
	}
}
