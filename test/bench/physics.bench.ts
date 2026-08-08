import { bench, describe } from 'vitest'
import { Player } from '../../lib/game/player.js'
import { createBall } from '../physics.helper.js'
import { TableBuilder } from '../table-builder.js'

function makePlayer(nBumpers: number, nBalls: number) {
	const b = new TableBuilder()
	for (let i = 0; i < nBumpers; i++) b.addBumper(`b${i}`)
	const table = b.build()
	const player = new Player(table).init()
	for (let i = 0; i < nBalls; i++) {
		createBall(player, 500 + Math.random() * 10, 500 + Math.random() * 10, 30, 100, 100, 0)
	}
	return player
}

describe('physics', () => {
	bench('1 ball no bumpers', () => {
		const p = makePlayer(0, 1)
		const phys = p.getPhysics()
		for (let i = 0; i < 100; i++) phys.physicsSimulateCycle(0.016)
	})

	bench('10 balls no bumpers', () => {
		const p = makePlayer(0, 10)
		const phys = p.getPhysics()
		for (let i = 0; i < 100; i++) phys.physicsSimulateCycle(0.016)
	})

	bench('10 balls 5 bumpers', () => {
		const p = makePlayer(5, 10)
		const phys = p.getPhysics()
		for (let i = 0; i < 100; i++) phys.physicsSimulateCycle(0.016)
	})
})
