// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Browser sink: WebAudio output for the script sound engine. Decode/synthesis
// runs in a plain Worker (sound-synth-pool.ts) while the browser's audio
// render thread owns mixing — script and physics threads never block on audio.
// Without an AudioContext (Node/tests) every call degrades to state tracking.

import {
	BaseSoundEngine,
	clamp01,
	effectiveGain,
	type SoundSample,
	type SoundVoice,
	uncurvePanFade,
} from './sound-engine.js'
import { synthKnock } from './sound-synth-pool.js'

interface VoiceNodes {
	source: AudioBufferSourceNode
	gain: GainNode
}

interface VoiceReplay {
	voice: SoundVoice
	buffer: AudioBuffer
	rate: number
	gainValue: number
	pan: number
	remaining: number
}

export class WebSoundEngine extends BaseSoundEngine {
	private ctx: AudioContext | null = null
	private master: GainNode | null = null
	private musicBus: GainNode | null = null
	private readonly nodes = new Map<number, VoiceNodes>()
	// Pending finite-loop replays. AudioBufferSourceNode.loop is boolean-only,
	// so loopCount > 1 re-triggers one replay per onended (unlike loop = -1,
	// which uses native looping); a re-Play with no loops left must clear it.
	private readonly repeats = new Map<number, VoiceReplay>()
	private musicNodes: VoiceNodes | null = null
	private gestureHooked = false

	/** Create/resume the context (call from a user gesture to satisfy autoplay policy). */
	public unlock(): void {
		const ctx = this.ensureContext()
		if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
	}

	protected emitVoice(voice: SoundVoice, sample: SoundSample, rate: number): void {
		const ctx = this.ensureContext()
		if (!ctx || !this.master) return
		try {
			const buffer = this.uploadPcm(sample.pcm, sample.sampleRate)
			if (!buffer) return
			// Per-voice gain carries sqrt(script volume); the master bus carries
			// sqrt(master level), so the product matches native sqrt(sound*main).
			// monoCompensation is the decoded source channel count, compensating
			// the averaging loss of the mono downmix (native converter.channelsIn).
			// frontRearFade has no stereo equivalent and is ignored.
			const gainValue = effectiveGain(voice.volume, 1, sample.channels)
			const pan = uncurvePanFade(voice.pan)
			if (voice.loopCount > 0) {
				this.repeats.set(voice.id, { voice, buffer, rate, gainValue, pan, remaining: voice.loopCount })
			} else {
				// A one-shot or infinite re-Play must not inherit replays scheduled
				// by an earlier finite-loop play of this voice.
				this.repeats.delete(voice.id)
			}
			this.startVoiceSource(ctx, voice, buffer, rate, gainValue, pan, voice.loopCount === -1)
		} catch {}
	}

	private startVoiceSource(
		ctx: AudioContext,
		voice: SoundVoice,
		buffer: AudioBuffer,
		rate: number,
		gainValue: number,
		pan: number,
		loop: boolean,
	): void {
		// A reused voice (useSame, no restart) may still hold a live source:
		// drop it first or every re-Play leaks an unstoppable orphan.
		const prev = this.nodes.get(voice.id)
		if (prev) {
			this.nodes.delete(voice.id)
			this.stopNodes(prev)
		}
		const source = ctx.createBufferSource()
		source.buffer = buffer
		source.playbackRate.value = rate
		source.loop = loop
		const gain = ctx.createGain()
		gain.gain.value = gainValue
		const panNode = this.panNode(pan)
		source.connect(gain)
		if (panNode && this.master) {
			gain.connect(panNode)
			panNode.connect(this.master)
		} else if (this.master) {
			gain.connect(this.master)
		}
		this.nodes.set(voice.id, { source, gain })
		source.onended = () => this.onVoiceEnded(voice.id)
		source.start()
	}

	private onVoiceEnded(id: number): void {
		const replay = this.repeats.get(id)
		const ctx = this.ctx
		if (replay && replay.remaining > 0 && replay.voice.playing && ctx && this.master) {
			replay.remaining--
			try {
				this.startVoiceSource(
					ctx,
					replay.voice,
					replay.buffer,
					replay.rate,
					replay.gainValue,
					replay.pan,
					false,
				)
				return
			} catch {}
		}
		this.repeats.delete(id)
		this.nodes.delete(id)
		this.endVoice(id)
	}

	protected override stopVoice(voice: SoundVoice): void {
		this.repeats.delete(voice.id)
		const nodes = this.nodes.get(voice.id)
		if (!nodes) return
		this.nodes.delete(voice.id)
		this.stopNodes(nodes)
	}

	protected emitKnock(): void {
		const ctx = this.ensureContext()
		if (!ctx) return
		// The master bus carries the level; the knock itself plays at unity.
		void synthKnock(ctx.sampleRate)
			.then(pcm => {
				if (pcm.length) this.playBuffer(pcm, ctx.sampleRate)
			})
			.catch(() => {})
	}

	// Fire-and-forget one-shot per push: no queue or backpressure, so a dense
	// continuous emu chunk stream can gap. A persistent AudioWorklet ring buffer
	// is the fix if that path ever goes dense.
	protected emitEmuPcm(pcm: Float32Array): void {
		const ctx = this.ensureContext()
		if (!ctx) return
		this.playBuffer(pcm, ctx.sampleRate)
	}

	private playBuffer(pcm: Float32Array, sampleRate: number): void {
		const ctx = this.ctx
		if (!ctx || !this.master) return
		const buffer = this.uploadPcm(pcm, sampleRate)
		if (!buffer) return
		try {
			const source = ctx.createBufferSource()
			source.buffer = buffer
			source.connect(this.master)
			source.start()
		} catch {}
	}

	/** Decoded PCM upload (fresh AudioBuffer per call: sources are one-shot). */
	private uploadPcm(pcm: Float32Array, sampleRate: number): AudioBuffer | null {
		const ctx = this.ctx
		if (!ctx) return null
		try {
			const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
			buffer.copyToChannel(Float32Array.from(pcm), 0)
			return buffer
		} catch {
			return null
		}
	}

	protected override onMusic(): void {
		this.stopMusicNodes()
		const music = this.getMusic()
		const ctx = this.ensureContext()
		// Records state even without a sample (plays nothing); unlike
		// playSound there is no warnOnce because music names are file paths.
		const sample = music ? this.getSample(music.name) : undefined
		if (!music || !ctx || !this.musicBus || !sample) return
		try {
			const buffer = this.uploadPcm(sample.pcm, sample.sampleRate)
			if (!buffer) return
			const source = ctx.createBufferSource()
			source.buffer = buffer
			// Simplification: music always loops (native streams the file once per PlayMusic).
			source.loop = true
			const gain = ctx.createGain()
			// Native music staging is sqrt-curved (ApplyVolume); the music bus
			// below carries sqrt(musicVolume) and the master its own level.
			gain.gain.value = effectiveGain(music.volume, 1)
			source.connect(gain)
			gain.connect(this.musicBus)
			const nodes = { source, gain }
			this.musicNodes = nodes
			source.onended = () => {
				if (this.musicNodes === nodes) this.musicNodes = null
			}
			source.start()
		} catch {}
	}

	protected override onMusicEnd(): void {
		this.stopMusicNodes()
	}

	protected override onOutputChanged(): void {
		if (!this.ctx) return
		const t = this.ctx.currentTime
		try {
			// 10 ms smoothing: de-clicks slider/mute moves without audible lag.
			this.master?.gain.setTargetAtTime(this.unmutedMaster(), t, 0.01)
			this.musicBus?.gain.setTargetAtTime(Math.sqrt(clamp01(this.getMusicVolume())), t, 0.01)
		} catch {}
	}

	/** Master-bus gain: sqrt(level) with mute forced to silence (restores on unmute). */
	private unmutedMaster(): number {
		return this.isMuted() ? 0 : Math.sqrt(clamp01(this.getLevel()))
	}

	public override dispose(): void {
		for (const [, nodes] of this.nodes) this.stopNodes(nodes)
		this.nodes.clear()
		this.repeats.clear()
		this.stopMusicNodes()
		const ctx = this.ctx
		this.ctx = null
		this.master = null
		this.musicBus = null
		if (ctx) void ctx.close().catch(() => {})
		super.dispose()
	}

	private ensureContext(): AudioContext | null {
		if (this.ctx) return this.ctx
		const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
		const Ctor = g.AudioContext ?? g.webkitAudioContext
		if (!Ctor) return null
		try {
			const ctx = new Ctor()
			this.master = ctx.createGain()
			this.master.gain.value = this.unmutedMaster()
			this.master.connect(ctx.destination)
			this.musicBus = ctx.createGain()
			this.musicBus.gain.value = Math.sqrt(clamp01(this.getMusicVolume()))
			this.musicBus.connect(this.master)
			this.ctx = ctx
			this.hookGesture()
			return ctx
		} catch {
			return null
		}
	}

	private panNode(pan: number): StereoPannerNode | null {
		if (!this.ctx || typeof this.ctx.createStereoPanner !== 'function') return null
		try {
			const node = this.ctx.createStereoPanner()
			node.pan.value = Math.max(-1, Math.min(1, pan))
			return node
		} catch {
			return null
		}
	}

	private hookGesture(): void {
		if (this.gestureHooked || typeof window === 'undefined') return
		this.gestureHooked = true
		const unlock = () => this.unlock()
		window.addEventListener('pointerdown', unlock, { passive: true })
		window.addEventListener('keydown', unlock)
	}

	private stopNodes(nodes: VoiceNodes | null | undefined): void {
		if (!nodes) return
		try {
			nodes.source.onended = null
			nodes.source.stop()
		} catch {}
	}

	private stopMusicNodes(): void {
		if (!this.musicNodes) return
		const nodes = this.musicNodes
		this.musicNodes = null
		this.stopNodes(nodes)
	}
}
