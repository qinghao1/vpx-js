// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { describe, it } from 'vitest'
import { effectiveGain, WasmEngine } from '../../demo-browser/src/wasm-engine.js'

function makeEngine(): WasmEngine {
	const host = {
		renderApi: {},
		table: {},
		ballsGroup: { visible: true },
		lookupPart: (): undefined => undefined,
		lookupPlunger: (): undefined => undefined,
	}
	return new WasmEngine(host as never)
}

describe('wasm audio controls', () => {
	it('maps mute and 0..1 level to gain, silencing on garbage', () => {
		expect(effectiveGain(1, false)).to.equal(1)
		expect(effectiveGain(0.5, false)).to.equal(0.5)
		expect(effectiveGain(0, false)).to.equal(0)
		expect(effectiveGain(2, false)).to.equal(1)
		expect(effectiveGain(-1, false)).to.equal(0)
		expect(effectiveGain(Number.NaN, false)).to.equal(0)
		expect(effectiveGain(Number.POSITIVE_INFINITY, false)).to.equal(0)
		expect(effectiveGain(0.5, true)).to.equal(0)
		expect(effectiveGain(Number.NaN, true)).to.equal(0)
	})

	it('starts unmuted at full level', () => {
		const engine = makeEngine()
		expect(engine.muted).to.equal(false)
		expect(engine.volume).to.equal(1)
	})

	it('toggles and sets mute, returning the new state', () => {
		const engine = makeEngine()
		expect(engine.toggleMuted()).to.equal(true)
		expect(engine.muted).to.equal(true)
		expect(engine.toggleMuted()).to.equal(false)
		engine.setMuted(false)
		expect(engine.muted).to.equal(false)
	})

	it('clamps the level and unmutes on nonzero input', () => {
		const engine = makeEngine()
		engine.setMuted(true)
		engine.setVolume(0.5)
		expect(engine.volume).to.equal(0.5)
		expect(engine.muted).to.equal(false)
		engine.setVolume(2)
		expect(engine.volume).to.equal(1)
		engine.setVolume(-1)
		expect(engine.volume).to.equal(0)
	})

	it('keeps mute across a zero level and never throws without a context', () => {
		const engine = makeEngine()
		engine.setMuted(true)
		expect(() => engine.setVolume(0)).not.to.throw()
		expect(engine.muted).to.equal(true)
		expect(engine.volume).to.equal(0)
		expect(() => engine.setVolume(Number.NaN)).not.to.throw()
		expect(engine.volume).to.equal(0)
		expect(engine.muted).to.equal(true)
	})

	it('leaves table-seeded engine volumes alone until the user touches a control', () => {
		const engine = makeEngine()
		const calls: [number, boolean][] = []
		;(engine as unknown as { engine: unknown }).engine = {
			setAudioLevel: (volume: number, muted: boolean) => calls.push([volume, muted]),
		}
		;(engine as unknown as { applyAudioLevel: () => void }).applyAudioLevel()
		expect(calls).to.deep.equal([])
	})

	it('pushes mute and level to the engine', () => {
		const engine = makeEngine()
		const calls: [number, boolean][] = []
		;(engine as unknown as { engine: unknown }).engine = {
			setAudioLevel: (volume: number, muted: boolean) => calls.push([volume, muted]),
		}
		engine.setVolume(0.5)
		engine.toggleMuted()
		engine.setVolume(2)
		expect(calls).to.deep.equal([
			[0.5, false],
			[0.5, true],
			[1, false],
		])
	})
})
