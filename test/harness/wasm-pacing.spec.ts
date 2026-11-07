// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { describe, it } from 'vitest'
import { WasmEngine } from '../../demo-browser/src/wasm-engine.js'

const QUANTUM = 1000 / 60

interface StepCall {
	gameMs: number
}

function makeEngine(changedLightParts: readonly number[] = []) {
	const steps: StepCall[] = []
	const keys: { scancode: number; down: boolean }[] = []
	const nudges: { angle: number; force: number }[] = []
	// The adapter advances its pacing clock, then steps the engine (which runs on its own game clock).
	const fakeEngine = {
		stepFrame: (): void => {
			steps.push({ gameMs: engine.gameMs })
		},
		getBuffer: (): undefined => undefined,
		pushKey: (scancode: number, down: boolean): void => {
			keys.push({ scancode, down })
		},
		nudge: (angle: number, force: number): void => {
			nudges.push({ angle, force })
		},
	}
	const fakeSync = {
		syncAll: (): {
			changedLightParts: readonly number[]
			ballsSpawned: number
			ballsMoved: number
			ballsRemoved: number
			movers: number
			lights: number
			prims: number
			flashers: number
		} => ({
			changedLightParts,
			ballsSpawned: 0,
			ballsMoved: 0,
			ballsRemoved: 0,
			movers: 0,
			lights: 0,
			prims: 0,
			flashers: 0,
		}),
		syncReels: (): number => 0,
	}
	const host = {
		renderApi: {},
		table: {},
		ballsGroup: { visible: true },
		lookupPart: (): undefined => undefined,
		lookupPlunger: (): undefined => undefined,
	}
	const engine = new WasmEngine(host as never)
	;(engine as unknown as { engine: unknown }).engine = fakeEngine
	;(engine as unknown as { sync: unknown }).sync = fakeSync
	return { engine, steps, keys, nudges }
}

describe('wasm host-owned pacing', () => {
	it('steps nothing on the first tick (no wall debt yet)', () => {
		const { engine, steps } = makeEngine()
		const out = engine.step(1000)
		expect(steps).to.have.length(0)
		expect(out.changedLights).to.deep.equal([])
	})

	it('advances game time by wall delta, one step per tick', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(1000 + 16.7)
		engine.step(1000 + 2 * 16.7)
		expect(steps).to.have.length(2)
		expect(steps[0]!.gameMs).to.be.closeTo(16.7, 1e-9)
		expect(steps[1]!.gameMs).to.be.closeTo(33.4, 1e-9)
		// Sustained: every tick steps exactly once, so game time tracks the wall.
		for (let i = 3; i <= 120; i++) engine.step(1000 + i * 16.7)
		expect(steps).to.have.length(120)
		expect(steps[steps.length - 1]!.gameMs).to.be.closeTo(120 * 16.7, 1e-6)
	})

	it('tracks wall time smoothly at 144Hz cadence (no 60Hz stair-step)', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		const tick = 1000 / 144
		for (let i = 1; i <= 144; i++) engine.step(1000 + i * tick)
		// Every tick steps exactly once, each by ~one wall delta — never
		// 0 (starved) and never a whole 60Hz quantum (judder).
		expect(steps).to.have.length(144)
		for (let i = 1; i < steps.length; i++) {
			const d = steps[i]!.gameMs - steps[i - 1]!.gameMs
			expect(d).to.be.greaterThan(6)
			expect(d).to.be.lessThan(8)
		}
	})

	it('caps the per-tick advance so a stall cannot spiral', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(1000 + 200)
		// One stepFrame carrying at most 8 quanta worth of game time.
		expect(steps).to.have.length(1)
		expect(steps[0]!.gameMs).to.be.closeTo(8 * QUANTUM, 1e-6)
	})

	it('clamps debt so game time lags the wall instead of wedging', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(1000 + 2000)
		expect(steps).to.have.length(1)
		// 2000ms of wall debt clamps to 500ms; one step carries ~133ms.
		// Later ticks keep draining at most the same: bounded catch-up.
		engine.step(1000 + 2000 + QUANTUM)
		expect(steps).to.have.length(2)
		const last = steps[steps.length - 1]!.gameMs
		expect(last).to.be.lessThan(2000)
	})

	it('ignores a non-finite timestamp without stepping', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(Number.NaN)
		expect(steps).to.have.length(0)
	})

	it('leaves banked debt untouched on a non-finite timestamp', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(1000 + 200)
		// 200ms of wall debt: one capped advance, ~66.7ms still banked.
		expect(steps).to.have.length(1)
		engine.step(Number.NaN)
		// No wall information means no advance and no debt change.
		expect(steps).to.have.length(1)
		expect(steps[0]!.gameMs).to.be.closeTo(8 * QUANTUM, 1e-6)
		// The banked remainder is still there for the next real tick.
		engine.step(1000 + 200 + QUANTUM)
		expect(steps).to.have.length(2)
	})

	it('maps changed light part indices to names, skipping unknowns', () => {
		const { engine } = makeEngine([7, 9])
		;(engine as unknown as { partNames: Map<number, string> }).partNames.set(7, 'Lamp7')
		engine.step(1000)
		const out = engine.step(1000 + 16.7)
		expect(out.changedLights).to.deep.equal(['Lamp7'])
	})

	it('rebases the wall baseline on pause so resume adds no catch-up debt', () => {
		const { engine, steps } = makeEngine()
		engine.step(1000)
		engine.step(1016.7)
		const before = steps.length
		engine.resetStepClock(5000)
		engine.step(5016.7)
		expect(steps.length - before).to.equal(1)
	})

	it('passes input straight through with zero steps (never stalls input)', () => {
		const { engine, steps, keys, nudges } = makeEngine()
		engine.pushKey(30, true)
		engine.nudge(90, 2)
		expect(steps).to.have.length(0)
		expect(keys).to.deep.equal([{ scancode: 30, down: true }])
		expect(nudges).to.deep.equal([{ angle: 90, force: 2 }])
	})

	it('returns empty before load without throwing', () => {
		const host = {
			renderApi: {},
			table: {},
			ballsGroup: { visible: true },
			lookupPart: (): undefined => undefined,
			lookupPlunger: (): undefined => undefined,
		}
		const engine = new WasmEngine(host as never)
		expect(engine.step(1000)).to.deep.equal({ changedLights: [] })
	})
})
