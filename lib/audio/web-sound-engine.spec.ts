// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { tonePcm } from './sound-synth-core.js'
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
		engine.playSound('tone', { volume: 0.36 })
		// One node per bus plus the voice; identify each by its audible level,
		// not creation order: master sqrt(0.25), music sqrt(1), voice sqrt(0.36).
		const values = FakeCtx.gains.map(g => g.gain.value).sort((a, b) => a - b)
		expect(values).to.have.length(3)
		expect(values[0]).to.be.closeTo(0.5, 1e-9)
		expect(values[1]).to.be.closeTo(0.6, 1e-9)
		expect(values[2]).to.be.closeTo(1, 1e-9)
	})

	it('should mute the master bus and restore the level on unmute', () => {
		engine.setVolume(0.25)
		engine.playSound('tone')
		// The master bus is the node carrying sqrt(0.25); voice and music sit at unity.
		const master = FakeCtx.gains.find(g => Math.abs(g.gain.value - 0.5) < 1e-9)
		if (!master) throw new Error('master bus gain not found')
		engine.setMuted(true)
		expect(master.gain.lastSet).to.equal(0)
		engine.setMuted(false)
		expect(master.gain.lastSet).to.be.closeTo(0.5, 1e-9)
	})

	it('should replay finite loops then end the voice', () => {
		engine.playSound('tone', { loopCount: 3 })
		expect(FakeCtx.sources.length).to.equal(1)
		// Each `ended` re-triggers exactly one replay; the live source is the latest.
		FakeCtx.sources.at(-1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(2)
		expect(engine.isPlaying('tone')).to.equal(true)
		FakeCtx.sources.at(-1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(3)
		FakeCtx.sources.at(-1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(3)
		expect(engine.isPlaying('tone')).to.equal(false)
	})

	it('should retune a reused playing voice without restarting it', () => {
		// Ramp-roll idiom: per-tick re-Play with useSame, no restart. Native
		// applies the new settings to the live voice, so there is still exactly
		// one source (no restart, no orphan) carrying the latest settings.
		engine.setVolume(0.25)
		engine.playSound('tone', { loopCount: -1, volume: 0.36, useSame: true, restart: false })
		engine.playSound('tone', { loopCount: -1, volume: 0.81, pitch: 800, useSame: true, restart: false })
		engine.playSound('tone', { loopCount: -1, volume: 0.81, pitch: 800, useSame: true, restart: false })
		expect(FakeCtx.sources.length).to.equal(1)
		const live = FakeCtx.sources[0]
		if (!live) throw new Error('live voice source not found')
		expect(live.stopped).to.equal(false)
		expect(live.playbackRate.value).to.be.closeTo(1.1, 1e-9)
		const voice = FakeCtx.gains.find(g => Math.abs(g.gain.value - 0.9) < 1e-9)
		if (!voice) throw new Error('retuned voice gain not found')
		engine.stopSound('tone')
		expect(live.stopped).to.equal(true)
		expect(engine.isPlaying('tone')).to.equal(false)
	})

	it('should not resurrect replays on a one-shot re-play', () => {
		engine.playSound('tone', { loopCount: 3, useSame: true, restart: false })
		expect(FakeCtx.sources.length).to.equal(1)
		engine.playSound('tone', { useSame: true, restart: false })
		expect(FakeCtx.sources.length).to.equal(1)
		FakeCtx.sources.at(-1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(1)
		expect(engine.isPlaying('tone')).to.equal(false)
	})

	it('should stop replays on stopSound', () => {
		engine.playSound('tone', { loopCount: 3 })
		FakeCtx.sources.at(-1)?.onended?.()
		expect(FakeCtx.sources.length).to.equal(2)
		const late = FakeCtx.sources.at(-1)?.onended
		engine.stopSound('tone')
		expect(engine.isPlaying('tone')).to.equal(false)
		late?.()
		expect(FakeCtx.sources.length).to.equal(2)
	})

	it('should stage music on the native sqrt curve', () => {
		engine.registerSample('theme', tonePcm(220, 0.05, 8000), 8000)
		engine.setMusicVolume(0.5)
		engine.playMusic('theme', 0.6)
		// Bus levels identified by value, not creation order:
		// music sqrt(0.5), music voice sqrt(0.6), master sqrt(1).
		const values = FakeCtx.gains.map(g => g.gain.value).sort((a, b) => a - b)
		expect(values).to.have.length(3)
		expect(values[0]).to.be.closeTo(Math.sqrt(0.5), 1e-9)
		expect(values[1]).to.be.closeTo(Math.sqrt(0.6), 1e-9)
		expect(values[2]).to.be.closeTo(1, 1e-9)
	})

	it('should play music once and report the natural end', () => {
		engine.registerSample('theme', tonePcm(220, 0.05, 8000), 8000)
		let ended = 0
		engine.onMusicEnded = () => ended++
		engine.playMusic('theme', 0.6)
		const live = FakeCtx.sources.at(-1)
		if (!live) throw new Error('music source not found')
		// Native streams the file once per PlayMusic (no loop).
		expect(live.loop).to.equal(false)
		live.onended?.()
		expect(ended).to.equal(1)
		expect(engine.getMusic()).to.equal(null)
		// A forced stop is not a natural end: nothing reports afterwards.
		engine.playMusic('theme', 0.6)
		engine.endMusic()
		FakeCtx.sources.at(-1)?.onended?.()
		expect(ended).to.equal(1)
	})

	it('should apply editor base levels and mono compensation', () => {
		engine.setVolume(1)
		engine.registerSample('stereo', tonePcm(440, 0.05, 8000), 8000, {
			channels: 2,
			volume: -0.5,
		})
		engine.playSound('stereo', { volume: 1 })
		// 2 channels × sqrt(clamp01(0.5 × 1)); the voice is the only node above unity.
		const expected = 2 * Math.sqrt(0.5)
		const voice = FakeCtx.gains.find(g => Math.abs(g.gain.value - expected) < 1e-9)
		if (!voice) throw new Error('voice gain not found')
		expect(voice.gain.value).to.be.closeTo(expected, 1e-9)
	})

	it('should schedule knocks through the worker fallback', async () => {
		engine.fireKnocker(1)
		expect(engine.getKnockCount()).to.equal(1)
		// The inline fallback resolves on microtasks: flush those, never the wall clock.
		for (let i = 0; i < 10 && FakeCtx.sources.length === 0; i++) await Promise.resolve()
		expect(FakeCtx.sources.length).to.equal(1)
	})
})
