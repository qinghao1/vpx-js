// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { tonePcm } from './sound-synth-pool.js'
import { WebSoundEngine } from './web-sound-engine.js'

class FakeSource {
	buffer: unknown = null
	readonly playbackRate = { value: 1 }
	loop = false
	stopped = false
	onended: (() => void) | null = null
	connect(): void {}
	start(): void {}
	stop(): void {
		this.stopped = true
	}
}

class FakeGain {
	readonly gain = {
		value: 0,
		lastSet: -1,
		setTargetAtTime(v: number): void {
			this.lastSet = v
		},
	}
	connect(): void {}
}

class FakeCtx {
	static sources: FakeSource[] = []
	static gains: FakeGain[] = []
	readonly sampleRate = 44100
	readonly state = 'running'
	readonly currentTime = 0
	readonly destination = {}
	createBuffer(): { copyToChannel(): void } {
		return { copyToChannel(): void {} }
	}
	createBufferSource(): FakeSource {
		const source = new FakeSource()
		FakeCtx.sources.push(source)
		return source
	}
	createGain(): FakeGain {
		const gain = new FakeGain()
		FakeCtx.gains.push(gain)
		return gain
	}
	createStereoPanner(): null {
		return null
	}
	resume(): Promise<void> {
		return Promise.resolve()
	}
	close(): Promise<void> {
		return Promise.resolve()
	}
}

describe('WebSoundEngine', () => {
	let engine: WebSoundEngine

	beforeEach(() => {
		FakeCtx.sources = []
		FakeCtx.gains = []
		;(globalThis as Record<string, unknown>).AudioContext = FakeCtx as unknown as typeof AudioContext
		engine = new WebSoundEngine()
		engine.registerSample('tone', tonePcm(440, 0.05, 8000), 8000)
	})

	afterEach(() => {
		engine.dispose()
		delete (globalThis as Record<string, unknown>).AudioContext
	})

	it('should split native sqrt gain across voice and master bus', () => {
		engine.setVolume(0.25)
		engine.playSound('tone', { volume: 0.25 })
		// gains[0] = master, gains[1] = music bus, gains[2] = voice.
		expect(FakeCtx.gains.length).to.equal(3)
		expect(FakeCtx.gains.at(0)?.gain.value).to.be.closeTo(0.5, 1e-9)
		expect(FakeCtx.gains.at(2)?.gain.value).to.be.closeTo(0.5, 1e-9)
	})

	it('should mute the master bus and restore the level on unmute', () => {
		engine.setVolume(0.25)
		engine.playSound('tone')
		engine.setMuted(true)
		expect(FakeCtx.gains.at(0)?.gain.lastSet).to.equal(0)
		engine.setMuted(false)
		expect(FakeCtx.gains.at(0)?.gain.lastSet).to.be.closeTo(0.5, 1e-9)
	})

	it('should replay finite loops then end the voice', () => {
		engine.playSound('tone', { loopCount: 3 })
		expect(FakeCtx.sources.length).to.equal(1)
		FakeCtx.sources.at(0)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(2)
		expect(engine.isPlaying('tone')).to.equal(true)
		FakeCtx.sources.at(1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(3)
		FakeCtx.sources.at(2)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(3)
		expect(engine.isPlaying('tone')).to.equal(false)
	})

	it('should silence reused looped voices instead of orphaning them', () => {
		// Ramp-roll idiom: per-tick re-Play with useSame, no restart.
		for (let i = 0; i < 3; i++) engine.playSound('tone', { loopCount: -1, useSame: true, restart: false })
		expect(FakeCtx.sources.length).to.equal(3)
		expect(FakeCtx.sources.map(s => s.stopped)).to.deep.equal([true, true, false])
		engine.stopSound('tone')
		expect(FakeCtx.sources.map(s => s.stopped)).to.deep.equal([true, true, true])
		expect(engine.isPlaying('tone')).to.equal(false)
	})

	it('should stop replays on stopSound', () => {
		engine.playSound('tone', { loopCount: 3 })
		const second = FakeCtx.sources.at(0)?.onended
		second?.()
		expect(FakeCtx.sources.length).to.equal(2)
		const late = FakeCtx.sources.at(1)?.onended
		engine.stopSound('tone')
		expect(engine.isPlaying('tone')).to.equal(false)
		late?.()
		expect(FakeCtx.sources.length).to.equal(2)
	})

	it('should apply music volume once across per-music gain and bus', () => {
		engine.registerSample('theme', tonePcm(220, 0.05, 8000), 8000)
		engine.setMusicVolume(0.5)
		engine.playMusic('theme', 0.6)
		expect(FakeCtx.gains.at(1)?.gain.value).to.be.closeTo(0.5, 1e-9)
		expect(FakeCtx.gains.at(-1)?.gain.value).to.be.closeTo(0.6, 1e-9)
	})

	it('should schedule knocks through the worker fallback', async () => {
		engine.fireKnocker(1)
		expect(engine.getKnockCount()).to.equal(1)
		for (let i = 0; i < 50 && FakeCtx.sources.length === 0; i++) await new Promise(r => setTimeout(r, 10))
		expect(FakeCtx.sources.length).to.equal(1)
	})
})
