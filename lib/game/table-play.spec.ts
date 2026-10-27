// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * End-to-end play gate: a real table script must execute — init, physics
 * stepping, timer dispatch, direct timer-handler calls — without an
 * uncaught VbsError. Unit specs pin helper semantics; this pins the
 * integrated path that loads a page in the browser (LampTimer_Timer →
 * RollingUpdate, PulseTimer → core.vbs update). The walking_dead leg is
 * skipped when the 200MB table is absent; the inline-script leg always runs.
 */
import * as fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { VbsError } from '../scripting/stdlib/err.js'
import { Table } from '../vpt/table/table.js'
import type { IBallCreationPosition } from './player.js'
import { Player } from './player.js'

const WALKING_DEAD = '/home/qinghao1/Downloads/walking_dead.vpx'

describe('table play executes without uncaught script errors', () => {
	it('plays an inline script with Null comparisons and guarded Null access', () => {
		// Mirrors the two fixed classes through the Player path (not just the
		// helpers): a Null-vs-string ordering (was error 13) and a member
		// access on a value that starts Null but is assigned before use.
		const vbs = [
			'Dim n',
			'n = Null',
			'Dim result',
			'If n > "" Then result = 1 Else result = 2',
			'Dim CBBall',
			'Sub LampTimer_Timer()',
			'  If Not IsEmpty(CBBall) Then result = CBBall.ID',
			'End Sub',
		].join('\n')
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		const scope: Record<string, unknown> = {}
		expect(() => new Player(table).init(scope)).not.toThrow()
		expect(scope.result).to.equal(2)
		expect(() => (scope.LampTimer_Timer as () => void)()).not.toThrow()
	})

	it('a genuine Null dereference with On Error Resume Next off stays loud', () => {
		// Fail-fast contract: with no OERN in effect, member access on Null
		// raises 94 instead of silently continuing. (With OERN on, the same
		// access records Err.Number and resumes — pinned in vbs-helper.spec.)
		const vbs = 'Dim o\n o = Null\nDim x\nx = o.foo\n'
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		expect(() => new Player(table).init({})).toThrow(VbsError)
	})

	it.skipIf(!fs.existsSync(WALKING_DEAD))(
		'plays walking_dead: init, timers, ball cycle',
		async () => {
			const table = await Table.load(new NodeBinaryReader(WALKING_DEAD), { loadTableScript: true })
			const player = new Player(table)
			const scope: Record<string, unknown> = {}
			await player.initAsync(scope)
			// Straight-line stepping dispatches due timers (LampTimer, PulseTimer)
			// through the real physics loop.
			for (let t = 1; t <= 600; t++) {
				player.updatePhysics(t * 100)
			}
			// Direct handler calls exercise the exact reported stacks
			// (LampTimer_Timer → RollingUpdate, timer-queue update).
			for (const name of ['LampTimer_Timer', 'RollingUpdate']) {
				const fn = scope[name]
				if (typeof fn === 'function') (fn as () => void)()
			}
			// Ball create/destroy cycle through a real kicker.
			const kickers = Object.values((table as unknown as { kickers: Record<string, unknown> }).kickers ?? {})
			if (kickers.length > 0) {
				const ball = player.createBall(kickers[0] as IBallCreationPosition)
				expect(player.getBalls().length).toBeGreaterThan(0)
				player.destroyBall(ball)
			}
			for (let t = 601; t <= 660; t++) {
				player.updatePhysics(t * 100)
			}
		},
		240000,
	)
})
