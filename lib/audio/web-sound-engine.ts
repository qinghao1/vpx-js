// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Knock synthesis runs inline (~8k frames, sub-millisecond) while the audio
// render thread owns mixing — callers never wait on audio. Without an
// AudioContext every call degrades to state tracking.

import { warnOnce } from '../emu/warn-once.js'
import {
	BaseSoundEngine,
	clamp11,
	effectiveGain,
	type SoundSample,
	type SoundVoice,
	sqrt01,
	uncurvePanFade,
} from './sound-engine.js'
import { knockPcm } from './sound-synth-core.js'

interface VoiceNodes {
	source: AudioBufferSourceNode
	gain: GainNode
	pan: StereoPannerNode | null
}

interface VoiceReplay {
	voice: SoundVoice
	buffer: AudioBuffer
	rate: number
	gainValue: number
	pan: number
	remaining: number
}

// Mixer rate tagged on emu buffers; the browser resamples to the device rate.
const EMU_SAMPLE_RATE = 44100
// Backlog cap, seconds: chunks scheduled further out than this are dropped
// instead of banking permanent lag after bursts.
const MAX_EMU_SCHEDULE_AHEAD = 0.25

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
	// Uploaded buffers by registered sample: sources are one-shot but buffers
	// are immutable, so replays share one upload until re-registration swaps
	// the sample object (which the map then forgets on its own).
	private readonly buffers = new WeakMap<SoundSample, AudioBuffer>()
	// Next emu-chunk start, in audio-clock seconds; chunks are sequenced
	// back-to-back so the stream plays gapless instead of overlapping.
	private emuNextTime = 0

	/** Create/resume the context (call from a user gesture to satisfy autoplay policy). */
	public unlock(): void {
		const ctx = this.ensureContext()
		if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
	}

	protected emitVoice(voice: SoundVoice, sample: SoundSample, rate: number): void {
		const ctx = this.ensureContext()
		if (!ctx || !this.master) return
		const buffer = this.uploadPcm(sample.pcm, sample.sampleRate, sample)
		if (!buffer) return
		// Voice carries sqrt(script volume)/sqrt(2), master carries sqrt(level); the /sqrt(2)
		// reconciles our equal-power panner with native's linear diffusion. Fade is stereo-ignored.
		const gainValue = effectiveGain(voice.volume, 1, sample.channels) / Math.SQRT2
		const pan = uncurvePanFade(voice.pan)
		if (voice.loopCount > 0) {
			this.repeats.set(voice.id, { voice, buffer, rate, gainValue, pan, remaining: voice.loopCount })
		} else {
			// A one-shot or infinite re-Play must not inherit replays scheduled
			// by an earlier finite-loop play of this voice.
			this.repeats.delete(voice.id)
		}
		// useSame + restart=false on a playing voice: native applies the new
		// settings to the live voice (AudioPlayer selection keeps it), so retune
		// instead of restarting.
		const live = this.nodes.get(voice.id)
		if (live) {
			live.gain.gain.value = gainValue
			if (live.pan) live.pan.pan.value = pan
			live.source.playbackRate.value = rate
			live.source.loop = voice.loopCount === -1
			return
		}
		this.startVoiceSource(ctx, voice, buffer, rate, gainValue, pan, voice.loopCount === -1)
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
		this.nodes.set(voice.id, { source, gain, pan: panNode })
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
		if (!ctx || !this.master) return
		// The master bus carries the level; the knock itself plays at unity.
		const pcm = knockPcm(ctx.sampleRate)
		if (pcm.length) this.playBuffer(pcm, ctx.sampleRate)
	}

	protected emitEmuPcm(pcm: Float32Array): void {
		const ctx = this.ensureContext()
		if (!ctx || !this.master) return
		// Re-anchor when the clock has run past the schedule
		// (pause/tab-hide): otherwise the chunk starts in the past.
		const now = ctx.currentTime
		const startAt = Math.max(now, this.emuNextTime)
		if (startAt - now > MAX_EMU_SCHEDULE_AHEAD) return
		const buffer = this.uploadPcm(pcm, EMU_SAMPLE_RATE)
		if (!buffer) return
		const source = ctx.createBufferSource()
		source.buffer = buffer
		source.connect(this.master)
		source.start(startAt)
		this.emuNextTime = startAt + pcm.length / EMU_SAMPLE_RATE
	}

	private playBuffer(pcm: Float32Array, sampleRate: number): void {
		const ctx = this.ctx
		if (!ctx || !this.master) return
		const buffer = this.uploadPcm(pcm, sampleRate)
		if (!buffer) return
		const source = ctx.createBufferSource()
		source.buffer = buffer
		source.connect(this.master)
		source.start()
	}

	/** Decoded PCM upload, shared per registered sample (pass it for reuse). */
	private uploadPcm(pcm: Float32Array, sampleRate: number, sample?: SoundSample): AudioBuffer | null {
		const ctx = this.ctx
		if (!ctx) return null
		if (sample) {
			const hit = this.buffers.get(sample)
			if (hit) return hit
		}
		try {
			const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
			buffer.getChannelData(0).set(pcm)
			if (sample) this.buffers.set(sample, buffer)
			return buffer
		} catch {
			return null
		}
	}

	protected override onMusic(): void {
		this.stopMusicNodes()
		const music = this.getMusic()
		const ctx = this.ensureContext()
		const sample = music ? this.getSample(music.name) : undefined
		if (!music || !ctx || !this.musicBus || !sample) {
			// Music resolves through registered samples here (no Music-dir file streaming).
			if (music && !sample)
				warnOnce(
					`music:${music.name.toLowerCase()}`,
					'Request to play music "%s", but it was not found.',
					music.name,
				)
			return
		}
		const buffer = this.uploadPcm(sample.pcm, sample.sampleRate, sample)
		if (!buffer) return
		const source = ctx.createBufferSource()
		source.buffer = buffer
		// Native streams the file once per PlayMusic and fires MusicDone at
		// the end (SoundPlayer::OnSoundEnd); a forced stop nulls musicNodes
		// first, so only a natural end reports.
		const gain = ctx.createGain()
		// Unlike SFX, music plays uncompensated: it streams from file natively, not from a Sound object.
		gain.gain.value = effectiveGain(music.volume, 1)
		source.connect(gain)
		gain.connect(this.musicBus)
		const nodes: VoiceNodes = { source, gain, pan: null }
		this.musicNodes = nodes
		source.onended = () => {
			if (this.musicNodes !== nodes) return
			this.endMusic()
			this.onMusicEnded?.()
		}
		source.start()
	}

	protected override onMusicEnd(): void {
		this.stopMusicNodes()
	}

	protected override onOutputChanged(): void {
		if (!this.ctx) return
		const t = this.ctx.currentTime
		// 10 ms smoothing: de-clicks slider/mute moves without audible lag.
		this.master?.gain.setTargetAtTime(this.unmutedMaster(), t, 0.01)
		this.musicBus?.gain.setTargetAtTime(sqrt01(this.getMusicVolume()), t, 0.01)
	}

	private unmutedMaster(): number {
		return this.isMuted() ? 0 : sqrt01(this.getLevel())
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
		let ctx: AudioContext
		try {
			ctx = new Ctor()
		} catch {
			return null
		}
		// Limiter between master and destination: stacked voices and the unity
		// ROM stream sum past 0 dBFS without it. Created outside the guard so
		// a missing node type throws instead of running unprotected.
		const limiter = ctx.createDynamicsCompressor()
		limiter.threshold.value = -1
		limiter.knee.value = 0
		limiter.ratio.value = 20
		limiter.attack.value = 0.001
		limiter.release.value = 0.1
		try {
			const master = ctx.createGain()
			master.gain.value = this.unmutedMaster()
			master.connect(limiter)
			limiter.connect(ctx.destination)
			const musicBus = ctx.createGain()
			musicBus.gain.value = sqrt01(this.getMusicVolume())
			musicBus.connect(master)
			this.master = master
			this.musicBus = musicBus
			this.ctx = ctx
			this.hookGesture()
			return ctx
		} catch {
			void ctx.close().catch(() => {})
			return null
		}
	}

	private panNode(pan: number): StereoPannerNode | null {
		if (!this.ctx || typeof this.ctx.createStereoPanner !== 'function') return null
		try {
			const node = this.ctx.createStereoPanner()
			node.pan.value = clamp11(pan)
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

	private stopNodes(nodes: VoiceNodes | null): void {
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
