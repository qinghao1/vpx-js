// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { tonePcm } from './sound-synth-core.js'
import { WebSoundEngine } from './web-sound-engine.js'

class FakeSource {
	buffer: unknown = null
	readonly playbackRate = { value: 1 }
	loop = false
	stopped = false
	startedAt: number | null = null
	onended: (() => void) | null = null
	connect(): void {}
	start(when = 0): void {
		this.startedAt = when
	}
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
	readonly targets: unknown[] = []
	connect(target?: unknown): void {
		this.targets.push(target)
	}
}

class FakeCompressor {
	readonly threshold = { value: 0 }
	readonly knee = { value: 0 }
	readonly ratio = { value: 0 }
	readonly attack = { value: 0 }
	readonly release = { value: 0 }
	readonly targets: unknown[] = []
	connect(target?: unknown): void {
		this.targets.push(target)
	}
}

class FakeCtx {
	static sources: FakeSource[] = []
	static gains: FakeGain[] = []
	static compressors: FakeCompressor[] = []
	static buffers: Array<{ channels: number; length: number; sampleRate: number }> = []
	static instances: FakeCtx[] = []
	sampleRate = 44100
	readonly state = 'running'
	currentTime = 0
	readonly destination = {}
	constructor() {
		FakeCtx.instances.push(this)
	}
	createBuffer(channels: number, length: number, sampleRate: number): { copyToChannel(): void } {
		FakeCtx.buffers.push({ channels, length, sampleRate })
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
	createDynamicsCompressor(): FakeCompressor {
		const compressor = new FakeCompressor()
		FakeCtx.compressors.push(compressor)
		return compressor
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
		FakeCtx.compressors = []
		FakeCtx.buffers = []
		FakeCtx.instances = []
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
		// not creation order: master sqrt(0.25), music sqrt(1), voice
		// sqrt(0.36)/sqrt(2) for native center diffusion.
		const values = FakeCtx.gains.map(g => g.gain.value).sort((a, b) => a - b)
		expect(values).to.have.length(3)
		expect(values[0]).to.be.closeTo(0.6 / Math.SQRT2, 1e-9)
		expect(values[1]).to.be.closeTo(0.5, 1e-9)
		expect(values[2]).to.be.closeTo(1, 1e-9)
	})

	it('should cap the master bus through one limiter', () => {
		engine.setVolume(0.25)
		engine.playSound('tone')
		// One choke point for the whole bus, not per-voice: stacked voices
		// and the unity ROM stream sum past 0 dBFS without it.
		expect(FakeCtx.compressors).to.have.length(1)
		const limiter = FakeCtx.compressors[0]
		if (!limiter) throw new Error('limiter not found')
		expect(limiter.threshold.value).to.equal(-3)
		expect(limiter.knee.value).to.equal(0)
		expect(limiter.ratio.value).to.equal(20)
		expect(limiter.attack.value).to.equal(0.001)
		expect(limiter.release.value).to.equal(0.1)
		const master = FakeCtx.gains.find(g => Math.abs(g.gain.value - 0.5) < 1e-9)
		if (!master) throw new Error('master bus gain not found')
		expect(master.targets).to.include(limiter)
		expect(limiter.targets).to.include(FakeCtx.instances[0]?.destination)
	})

	it('should throw instead of running unprotected without a limiter node', () => {
		const proto = FakeCtx.prototype as unknown as Record<string, unknown>
		const orig = proto.createDynamicsCompressor
		try {
			proto.createDynamicsCompressor = undefined
			expect(() => engine.unlock()).to.throw()
		} finally {
			proto.createDynamicsCompressor = orig
		}
	})

	it('should mute the master bus and restore the level on unmute', () => {
		engine.setVolume(0.25)
		engine.playSound('tone')
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
		// Ramp-roll idiom: per-tick re-Play with useSame, no restart.
		engine.setVolume(0.25)
		engine.playSound('tone', { loopCount: -1, volume: 0.36, useSame: true, restart: false })
		engine.playSound('tone', { loopCount: -1, volume: 0.81, pitch: 800, useSame: true, restart: false })
		engine.playSound('tone', { loopCount: -1, volume: 0.81, pitch: 800, useSame: true, restart: false })
		expect(FakeCtx.sources.length).to.equal(1)
		const live = FakeCtx.sources[0]
		if (!live) throw new Error('live voice source not found')
		expect(live.stopped).to.equal(false)
		expect(live.playbackRate.value).to.be.closeTo(1.1, 1e-9)
		const voice = FakeCtx.gains.find(g => Math.abs(g.gain.value - 0.9 / Math.SQRT2) < 1e-9)
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
		// Native diffusion plays 0.5x per channel at center; the panner's
		// 0.7071x completes it, so the voice gain lands exactly on 1.0.
		const voice = FakeCtx.gains.find(g => Math.abs(g.gain.value - 1) < 1e-9)
		if (!voice) throw new Error('voice gain not found')
		expect(voice.gain.value).to.be.closeTo(1, 1e-9)
	})

	it('should match native center diffusion on voice gain', () => {
		engine.setVolume(1)
		engine.playSound('tone')
		// Native linear diffusion plays 0.5x per channel at center; our
		// equal-power panner plays 0.7071x, so the voice carries 1/sqrt(2)
		// and the product lands on native's 0.5 instead of +3 dB hot.
		const voice = FakeCtx.gains.find(g => Math.abs(g.gain.value - 1 / Math.SQRT2) < 1e-9)
		if (!voice) throw new Error('voice gain not found')
		expect(voice.gain.value).to.be.closeTo(1 / Math.SQRT2, 1e-9)
	})

	it('should schedule knocks through the worker fallback', async () => {
		engine.fireKnocker(1)
		expect(engine.getKnockCount()).to.equal(1)
		// The inline fallback resolves on microtasks: flush those, never the wall clock.
		for (let i = 0; i < 10 && FakeCtx.sources.length === 0; i++) await Promise.resolve()
		expect(FakeCtx.sources.length).to.equal(1)
	})

	it('should upload emu PCM at the 44100 Hz mixer rate for browser resample', () => {
		// A 48 kHz device must still get a 44100 Hz buffer: uploading at the
		// device rate would play the stream sharp.
		engine.pushEmuPcm(new Float32Array(441))
		const ctx = FakeCtx.instances.at(-1)
		if (!ctx) throw new Error('audio context not created')
		ctx.sampleRate = 48000
		engine.pushEmuPcm(new Float32Array(441))
		const emu = FakeCtx.buffers.at(-1)
		if (!emu) throw new Error('emu buffer not uploaded')
		expect(emu.channels).to.equal(1)
		expect(emu.length).to.equal(441)
		expect(emu.sampleRate).to.equal(44100)
		expect(engine.getEmuFrames()).to.equal(882)
	})

	it('should schedule emu chunks back-to-back without gaps', () => {
		engine.pushEmuPcm(new Float32Array(441))
		engine.pushEmuPcm(new Float32Array(441))
		expect(FakeCtx.sources.length).to.equal(2)
		const [first, second] = FakeCtx.sources
		expect(first?.startedAt).to.equal(0)
		expect(second?.startedAt).to.be.closeTo(0.01, 1e-9)
	})

	it('should re-anchor the emu schedule when the clock runs past it', () => {
		engine.pushEmuPcm(new Float32Array(441))
		const ctx = FakeCtx.instances.at(-1)
		if (!ctx) throw new Error('audio context not created')
		ctx.currentTime = 5
		engine.pushEmuPcm(new Float32Array(441))
		expect(FakeCtx.sources.at(-1)?.startedAt).to.equal(5)
	})

	it('should drop emu chunks scheduled too far ahead instead of banking lag', () => {
		// 11025 frames = exactly 0.25 s: at exactly the cap a chunk still plays
		// (strict >), the next one drops; advancing the clock resumes scheduling.
		for (let i = 0; i < 4; i++) engine.pushEmuPcm(new Float32Array(11025))
		expect(FakeCtx.sources.length).to.equal(2)
		const ctx = FakeCtx.instances.at(-1)
		if (!ctx) throw new Error('audio context not created')
		ctx.currentTime = 0.4
		engine.pushEmuPcm(new Float32Array(11025))
		expect(FakeCtx.sources.length).to.equal(3)
	})
})
