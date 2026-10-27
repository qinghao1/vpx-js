// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Player must surface table-script errors instead of swallowing them.
 * Behavioral replacement for the `runScript(scope, false)` source-grep in the
 * deleted `transpiler-worker-browser-regression.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'

describe('player surfaces table-script errors', () => {
	const throwingScript = 'Err.Raise 513, "test", "boom"\n'

	it('Player.init throws when the table script raises', () => {
		const table = new TableBuilder().withTableScript(throwingScript).build('Table1')
		expect(() => new Player(table).init({})).toThrow('Error 513: boom')
	})

	it('Player.initAsync rejects when the table script raises', async () => {
		const table = new TableBuilder().withTableScript(throwingScript).build('Table1')
		await expect(new Player(table).initAsync({})).rejects.toThrow('Error 513: boom')
	})

	it('Player.init succeeds when the table script does not raise (control)', () => {
		const table = new TableBuilder().withTableScript('Dim x\nx = 1\n').build('Table1')
		expect(() => new Player(table).init({})).not.toThrow()
	})

	it('Player.initAsync succeeds when the table script redims a Null-valued variable', async () => {
		// Regression: walking_dead.vpx failed to load with
		// 'Error: Invalid use of Null' at VBSHelper.redim via
		// Transpiler.evalAndPlay -> Table.runTableScriptAsync ->
		// Player.initAsync. ReDim reallocates the variable anew, so a
		// prior Null must not raise 94.
		const table = new TableBuilder().withTableScript('Dim x\nx = Null\nReDim x(2)\nx(0) = "ok"\n').build('Table1')
		await expect(new Player(table).initAsync({})).resolves.toBeInstanceOf(Player)
	})
})
