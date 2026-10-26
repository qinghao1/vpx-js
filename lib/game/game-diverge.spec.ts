// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/** Behavior specs for lib/game diverge fixes: clean destroy (a), deterministic
 * swap flag (b), debug-key parity with upstream (c). */
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

function ballKeys(record: Record<string, unknown>): string[] {
	return Object.keys(record).filter(k => k.startsWith('Ball'))
}

describe('destroyBall (a)', () => {
	let player: Player
	beforeEach(() => {
		player = new Player(new TableBuilder().build()).init()
	})

	it('leaves no ball residue in player or physics bookkeeping', () => {
		const p = player as any
		const physics = player.getPhysics() as any
		const moversBefore = physics.movers.length
		const dynBefore = physics.hitObjectsDynamic.length
		for (let i = 0; i < 25; i++) {
			const ball = player.createBall(mockCreator())
			player.updatePhysics(2 * i + 1)
			player.destroyBall(ball)
		}
		expect(player.balls.length).toBe(0)
		expect(player.getBalls().length).toBe(0)
		expect(player.getActiveBall()).toBeUndefined()
		expect(ballKeys(p.currentStates)).toEqual([])
		expect(ballKeys(p.previousStates)).toEqual([])
		expect(p.allStateNames.filter((k: string) => k.startsWith('Ball'))).toEqual([])
		expect([...p.dirtySet].filter((k: string) => k.startsWith('Ball'))).toEqual([])
		expect(physics.movers.length).toBe(moversBefore)
		expect(physics.hitObjectsDynamic.length).toBe(dynBefore)
		const changed = player.popStates()
		expect(ballKeys(changed.changedStates)).toEqual([])
	})
})

describe('swapBallCollisionHandling (b)', () => {
	it('toggles exactly once per simulate cycle (deterministic, no RNG)', () => {
		const player = new Player(new TableBuilder().build()).init()
		const physics = player.getPhysics()
		physics.swapBallCollisionHandling = false
		physics.physicsSimulateCycle(1)
		expect(physics.swapBallCollisionHandling).toBe(true)
		physics.physicsSimulateCycle(1)
		expect(physics.swapBallCollisionHandling).toBe(false)
	})

	it('drives hit-test order deterministically: static-first when false', () => {
		expect(hitTestOrder(false).slice(0, 2)).toEqual(['static', 'dynamic'])
	})

	it('drives hit-test order deterministically: dynamic-first when true', () => {
		expect(hitTestOrder(true).slice(0, 2)).toEqual(['dynamic', 'static'])
	})

	function hitTestOrder(flag: boolean): string[] {
		const player = new Player(new TableBuilder().build()).init()
		const physics = player.getPhysics() as any
		player.createBall(mockCreator())
		const order: string[] = []
		const statik = physics.hitOcTree
		const dynamic = physics.hitOcTreeDynamic
		const origStatic = statik.hitTestBall.bind(statik)
		const origDynamic = dynamic.hitTestBall.bind(dynamic)
		statik.hitTestBall = (...args: unknown[]): unknown => {
			order.push('static')
			return (origStatic as (...a: unknown[]) => unknown)(...args)
		}
		dynamic.hitTestBall = (...args: unknown[]): unknown => {
			order.push('dynamic')
			return (origDynamic as (...a: unknown[]) => unknown)(...args)
		}
		try {
			physics.swapBallCollisionHandling = flag
			physics.physicsSimulateCycle(1)
		} finally {
			statik.hitTestBall = origStatic
			dynamic.hitTestBall = origDynamic
		}
		expect(order.length).toBeGreaterThanOrEqual(2)
		return order
	}
})

describe('debug keys reach script like upstream (c)', () => {
	const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
	let player: Player
	let scope: any
	beforeEach(() => {
		scope = {}
		player = new Player(new TableBuilder().withTableScript(vbs).build('Table1')).init(scope)
	})

	it('delivers FrameCount (F11) to KeyDown/KeyUp', () => {
		player.onKeyDown({ code: 'F11', key: 'F11' })
		player.updatePhysics(20)
		expect(scope.keyDown).toBe(DIK_F11)
		player.onKeyUp({ code: 'F11', key: 'F11' })
		player.updatePhysics(40)
		expect(scope.keyUp).toBe(DIK_F11)
	})

	it('delivers Enable3D (F10) to KeyDown', () => {
		player.onKeyDown({ code: 'F10', key: 'F10' })
		player.updatePhysics(20)
		expect(scope.keyDown).toBe(DIK_F10)
	})

	it('delivers DBGBalls (O) to KeyDown', () => {
		player.onKeyDown({ code: 'KeyO', key: 'o' })
		player.updatePhysics(20)
		expect(scope.keyDown).toBe(DIK_O)
	})
})
