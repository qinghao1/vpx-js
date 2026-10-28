// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { auditTableStructure } from './audit-table.js'

function stubTable(timers: Record<string, { enabled: boolean; interval: number }>): any {
	const entries = Object.fromEntries(
		Object.entries(timers).map(([name, timer]) => [name, { data: { timer: { ...timer } } }]),
	)
	return { timers: entries }
}

function timerWarnings(table: any): string[] {
	return auditTableStructure(table).warnings.filter(w => w.startsWith('Timer '))
}

describe('auditTableStructure timer frame-pacing (native AuditTable parity)', () => {
	it('warns on enabled fixed intervals below 17ms', () => {
		const warnings = timerWarnings(stubTable({ Fast: { enabled: true, interval: 10 } }))
		expect(warnings).to.have.lengthOf(1)
		expect(warnings[0]).to.contain("Timer 'Fast' interval 10ms")
	})

	it('warns on a 0ms fixed interval like native (0 is not a sentinel)', () => {
		const warnings = timerWarnings(stubTable({ Zero: { enabled: true, interval: 0 } }))
		expect(warnings).to.have.lengthOf(1)
	})

	it('exempts Per Frame (-1) and Game Logic Sync (-2) modes', () => {
		const warnings = timerWarnings(
			stubTable({
				PerFrame: { enabled: true, interval: -1 },
				LogicSync: { enabled: true, interval: -2 },
			}),
		)
		expect(warnings).to.have.lengthOf(0)
	})

	it('stays silent for disabled timers and intervals at/above 17ms', () => {
		const warnings = timerWarnings(
			stubTable({
				Off: { enabled: false, interval: 10 },
				Boundary: { enabled: true, interval: 17 },
				Slow: { enabled: true, interval: 100 },
			}),
		)
		expect(warnings).to.have.lengthOf(0)
	})
})
