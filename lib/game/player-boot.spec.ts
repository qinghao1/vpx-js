// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Mount-path player boot: a throwing table script must resolve null (logged
 * once, with the cause) instead of rejecting, so the viewer keeps presenting
 * the successfully built scene viewer-only. Strict Player init keeps throwing
 * (see player-script-error.spec.ts); only this mount helper absorbs it.
 */
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player, tryBootPlayer } from './player.js'

describe('tryBootPlayer', () => {
	it('resolves the booted player when the table script runs clean', async () => {
		const table = new TableBuilder().withTableScript('Dim x\nx = 1\n').build('Table1')
		const calls: Array<[string, string | undefined]> = []
		const player = await tryBootPlayer(table, undefined, (message, level) => {
			calls.push([message, level])
		})
		expect(player).toBeInstanceOf(Player)
		expect(calls).toEqual([])
	})

	it('resolves null and logs the cause once when the table script raises', async () => {
		const table = new TableBuilder().withTableScript('Err.Raise 513, "test", "boom"\n').build('Table1')
		const calls: Array<[string, string | undefined]> = []
		const player = await tryBootPlayer(table, undefined, (message, level) => {
			calls.push([message, level])
		})
		expect(player).toBeNull()
		expect(calls).toHaveLength(1)
		expect(calls[0][1]).toEqual('error')
		expect(calls[0][0]).toContain('Error 513: boom')
	})
})
