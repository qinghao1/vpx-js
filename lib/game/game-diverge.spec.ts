// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/** Player behavior: clean ball destroy, deterministic collision swap, debug keys. */
import { beforeEach, describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import type { Vertex3D } from '../math/vector.js'
import { Vertex3D as V3 } from '../math/vector.js'
import type { Table } from '../vpt/table/table.js'
import { DIK_F10, DIK_F11, DIK_O } from './key-code.js'
import type { IBallCreationPosition } from './player.js'
import { Player } from './player.js'

function mockCreator(x = 1000, y = 1000, z = 100): IBallCreationPosition {
	return {
		getBallCreationPosition: (_t: Table): Vertex3D => new V3(x, y, z),
		getBallCreationVelocity: (_t: Table): Vertex3D => new V3(0, 0, 0),
		onBallCreated: (): void => {},
	}
}

function ballKeys(changed: { keys: string[] }): string[] {
	return changed.keys.filter(k => k.startsWith('Ball'))
}

describe('destroyBall', () => {
	let player: Player
	beforeEach(() => {
		player = new Player(new TableBuilder().build()).init()
	})

	it('leaves no ball residue in player or physics bookkeeping', () => {
		const created: unknown[] = []
		const destroyed: unknown[] = []
		player.on('ballCreated', ball => created.push(ball))
		player.on('ballDestroyed', ball => destroyed.push(ball))
		for (let i = 0; i < 25; i++) {
			const ball = player.createBall(mockCreator())
			player.updatePhysics(2 * i + 1)
			player.destroyBall(ball)
		}
		expect(player.balls.length).toBe(0)
		expect(player.getBalls().length).toBe(0)
		expect(player.getActiveBall()).toBeUndefined()
		expect(created.length).toBe(25)
		expect(destroyed.length).toBe(25)
		const changed = player.popStates()
		expect(ballKeys(changed)).toEqual([])
		// Physics bookkeeping is clean when a fresh ball still simulates.
		const fresh = player.createBall(mockCreator())
		player.updatePhysics(100)
		expect(player.getBalls().length).toBe(1)
		expect(Number.isFinite(fresh.getState().pos.x)).toBe(true)
	})
})

describe('swapBallCollisionHandling', () => {
	it.each([4, 5])('simulates repeat runs identically over %i cycles (no RNG in traversal)', cycles => {
		expect(simulateBallPositions(cycles)).toEqual(simulateBallPositions(cycles))
	})

	function simulateBallPositions(cycles: number): number[] {
		const player = new Player(new TableBuilder().build()).init()
		player.createBall(mockCreator())
		player.createBall(mockCreator(1200, 1000, 100))
		const physics = player.getPhysics()
		for (let i = 0; i < cycles; i++) physics.physicsSimulateCycle(1)
		return player.getBalls().flatMap(ball => {
			const pos = ball.getState().pos
			return [pos.x, pos.y, pos.z]
		})
	}
})

describe('debug keys reach script', () => {
	const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
	let player: Player
	let scope: any
	beforeEach(() => {
		scope = {}
		player = new Player(new TableBuilder().withTableScript(vbs).build('Table1')).init(scope)
	})

	it.each([
		['FrameCount (F11)', 'F11', DIK_F11],
		['Enable3D (F10)', 'F10', DIK_F10],
		['DBGBalls (O)', 'KeyO', DIK_O],
	] as const)('delivers %s to KeyDown/KeyUp', (_label, code, dik) => {
		player.onKeyDown({ code, key: code })
		player.updatePhysics(20)
		expect(scope.keyDown).toBe(dik)
		player.onKeyUp({ code, key: code })
		player.updatePhysics(40)
		expect(scope.keyUp).toBe(dik)
	})
})
