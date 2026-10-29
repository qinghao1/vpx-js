// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { warnOnce } from '../emu/warn-once.js'

/** PlaySound call options. Native defaults: loop 1, volume 1, restart true. @see AudioPlayer::PlaySound */
export interface PlaySoundOptions {
	loopCount?: number
	volume?: number
	pan?: number
	randomPitch?: number
	pitch?: number
	useSame?: boolean
	restart?: boolean
	frontRearFade?: number
}

/** Resolved per-voice playback state (one entry per concurrent play of a name). */
export interface SoundVoice {
	id: number
	name: string
	loopCount: number
	volume: number
	pan: number
	frontRearFade: number
	pitch: number
	playing: boolean
}

/** Per-sound editor base levels (dequantized percent offsets, upstream Sound volume/pan/fade). */
export interface SoundBaseLevels {
	volume: number
	pan: number
	frontRearFade: number
}

/** Stored sample bytes (raw PCM awaiting output). */
export interface SoundSample {
	pcm: Float32Array
	sampleRate: number
	/** Decoded source channel count (native mono-compensation input; 1 when unknown). */
	channels: number
	base: SoundBaseLevels
}

/** Optional sample metadata for registerSample (all native-faithful defaults). */
export interface SampleMeta {
	channels?: number
	volume?: number
	pan?: number
	frontRearFade?: number
}

/** Script-visible sound sink. Implemented by the null (Node/tests) and WebAudio (browser) engines. */
export interface ISoundEngine {
	playSound(name: string, opts?: PlaySoundOptions): number
	stopSound(name: string): void
	playMusic(name: string, volume?: number): void
	endMusic(): void
	getMusic(): { name: string; volume: number } | null
	fireKnocker(count?: number): void
	/** Fired when music ends on its own; the host routes it to the script MusicDone event. */
	onMusicEnded: (() => void) | null
	setMuted(muted: boolean): void
	isMuted(): boolean
	setVolume(volume: number): void
	getVolume(): number
	getLevel(): number
	setMusicVolume(volume: number): void
	getMusicVolume(): number
	registerSample(name: string, pcm: Float32Array, sampleRate: number, meta?: SampleMeta): void
	hasSample(name: string): boolean
	isPlaying(name?: string): boolean
	getKnockCount(): number
	pushEmuPcm(data: unknown): void
	getEmuFrames(): number
	dispose(): void
}

export function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v))
}

/** Native loop mapping: <=1 plays once, >1 repeats n-1, <0 loops forever. @see SoundPlayer::Play */
export function mapLoopCount(loopCount = 1): number {
	if (loopCount < 0) return -1
	if (loopCount <= 1) return 0
	return Math.floor(loopCount) - 1
}

/** Undo the x^10 pre-emphasis tables apply to pan/fade. @see SoundPlayer::Play */
export function uncurvePanFade(v: number): number {
	const c = Math.max(-1, Math.min(1, v))
	return c < 0 ? -((-c) ** 0.1) : c ** 0.1
}

/** Native voice gain: mono-compensated sqrt of the clamped product. @see SoundPlayer::ApplyVolume
 * monoCompensation is the decoded channel count (native `converter.channelsIn`):
 * single-channel table sounds played through wider buses need the energy lift. */
export function effectiveGain(soundVolume: number, mainVolume: number, monoCompensation = 1): number {
	return monoCompensation * Math.sqrt(clamp01(soundVolume * mainVolume))
}

/** Native playback rate: Hz pitch offset plus native's asymmetric random detune. @see SoundPlayer::Play */
export function pitchFactor(sampleRate: number, pitch = 0, randomPitch = 0, rand = Math.random): number {
	if (!(sampleRate > 0)) return 1
	let rate = (sampleRate + pitch) / sampleRate
	if (randomPitch > 0) {
		const high = rand()
		const low = rand()
		rate *= 1 + randomPitch * high * high - randomPitch * low * low * 0.5
	}
	return rate
}

/** Case-insensitive sample/voice key (upstream resolves names through a case-insensitive map). */
function soundKey(name: string): string {
	return name.toLowerCase()
}

/** Shared voice bookkeeping; subclasses add the audible output behind `emitVoice`/`emitKnock`. */
export abstract class BaseSoundEngine implements ISoundEngine {
	private readonly voices = new Map<string, SoundVoice[]>()
	private readonly samples = new Map<string, SoundSample>()
	private muted = false
	private volume = 1
	private musicVolume = 1
	private music: { name: string; volume: number } | null = null
	public onMusicEnded: (() => void) | null = null
	private knockCount = 0
	private emuFrames = 0
	private seq = 0
	private disposed = false

	protected abstract emitVoice(voice: SoundVoice, sample: SoundSample, rate: number): void
	protected abstract emitKnock(): void
	protected abstract emitEmuPcm(_pcm: Float32Array): void
	protected stopVoice?(_voice: SoundVoice): void

	public playSound(name: string, opts: PlaySoundOptions = {}): number {
		if (this.disposed || !name) return 0
		const key = soundKey(name)
		// Native fires the hardware knocker for these names *in addition* to the normal voice path.
		if (key === 'knock' || key === 'knocker') this.fireKnocker(1)
		const {
			loopCount = 1,
			volume = 1,
			pan = 0,
			randomPitch = 0,
			pitch = 0,
			useSame = false,
			restart = true,
			frontRearFade = 0,
		} = opts
		const sample = this.samples.get(key)
		if (!sample) {
			// Native warns once per missing name and plays nothing.
			warnOnce(`sound:${key}`, 'Request to play "%s", but sound was not found.', name)
			return 0
		}
		let list = this.voices.get(key)
		if (!list) this.voices.set(key, (list = []))
		if (restart) for (const voice of list) this.halt(voice)
		// Allocation: restart halts all voices then reuses the first, useSame
		// steals a playing voice for live updates, otherwise a new overlapping
		// voice is created when every existing one is still playing.
		let voice = list.find(v => useSame || restart || !v.playing)
		if (!voice) {
			voice = {
				id: ++this.seq,
				name,
				loopCount: 0,
				volume: 1,
				pan: 0,
				frontRearFade: 0,
				pitch: 0,
				playing: false,
			}
			list.push(voice)
		}
		voice.loopCount = mapLoopCount(loopCount)
		// Native adds the sound's editor base levels to the script offsets.
		voice.volume = sample.base.volume + volume
		voice.pan = Math.max(-1, Math.min(1, sample.base.pan + pan))
		voice.frontRearFade = sample.base.frontRearFade + frontRearFade
		voice.pitch = pitch
		voice.playing = true
		this.emitVoice(voice, sample, pitchFactor(sample.sampleRate, pitch, randomPitch))
		return voice.id
	}

	public stopSound(name: string): void {
		if (!name) return
		const key = soundKey(name)
		// Native warns on a failed sound lookup, not on an empty voice list.
		if (!this.samples.has(key)) {
			warnOnce(`sound:${key}`, 'Request to stop "%s", but sound was not found.', name)
			return
		}
		for (const voice of this.voices.get(key) ?? []) this.halt(voice)
	}

	public playMusic(name: string, volume = 1): void {
		if (this.disposed) return
		// Native ends the current music first, so an empty name stops playback.
		if (!name) {
			this.endMusic()
			return
		}
		// Stored raw; the audible level is volume × musicVolume, applied at the music bus.
		this.music = { name, volume }
		this.onMusic()
	}

	// Native EndMusic takes no name and clears whatever is playing.
	public endMusic(): void {
		this.music = null
		this.onMusicEnd()
	}

	public getMusic(): { name: string; volume: number } | null {
		return this.music ? { ...this.music } : null
	}

	protected onMusic(): void {}
	protected onMusicEnd(): void {}

	public fireKnocker(count = 1): void {
		if (this.disposed) return
		const knocks = Math.floor(count)
		if (!Number.isFinite(knocks) || knocks <= 0) return
		this.knockCount += knocks
		// One audible knock regardless of count (the synthesis is an
		// approximation; native drives N hardware knocks).
		this.emitKnock()
	}

	public getKnockCount(): number {
		return this.knockCount
	}

	public setMuted(muted: boolean): void {
		this.muted = !!muted
		this.onOutputChanged()
	}

	public isMuted(): boolean {
		return this.muted
	}

	public setVolume(volume: number): void {
		if (!Number.isFinite(volume)) return
		this.volume = clamp01(volume)
		this.onOutputChanged()
	}

	public getVolume(): number {
		return this.muted ? 0 : this.volume
	}

	/** Unmuted level (mute keeps the level so unmute restores it). */
	public getLevel(): number {
		return this.volume
	}

	public setMusicVolume(volume: number): void {
		if (!Number.isFinite(volume)) return
		this.musicVolume = Math.max(0, volume)
		this.onOutputChanged()
	}

	public getMusicVolume(): number {
		return this.musicVolume
	}

	protected onOutputChanged(): void {}

	public registerSample(name: string, pcm: Float32Array, sampleRate: number, meta: SampleMeta = {}): void {
		if (!name || !pcm?.length || !(sampleRate > 0)) return
		this.samples.set(soundKey(name), {
			pcm,
			sampleRate,
			channels: meta.channels !== undefined && meta.channels >= 1 ? Math.floor(meta.channels) : 1,
			base: {
				volume: meta.volume ?? 0,
				pan: meta.pan ?? 0,
				frontRearFade: meta.frontRearFade ?? 0,
			},
		})
	}

	public hasSample(name: string): boolean {
		return this.samples.has(soundKey(name))
	}

	protected getSample(name: string): SoundSample | undefined {
		return this.samples.get(soundKey(name))
	}

	public isPlaying(name?: string): boolean {
		if (name !== undefined) return (this.voices.get(soundKey(name)) ?? []).some(v => v.playing)
		for (const list of this.voices.values()) if (list.some(v => v.playing)) return true
		return false
	}

	public pushEmuPcm(data: unknown): void {
		const pcm = extractPcm(data)
		if (!pcm) return
		this.emuFrames += pcm.length
		if (!this.disposed) this.emitEmuPcm(pcm)
	}

	public getEmuFrames(): number {
		return this.emuFrames
	}

	/** Mark one voice ended (audible output finished without a stop call). */
	protected endVoice(id: number): void {
		for (const list of this.voices.values()) {
			const voice = list.find(v => v.id === id)
			if (voice) {
				voice.playing = false
				return
			}
		}
	}

	public dispose(): void {
		if (this.disposed) return
		this.disposed = true
		for (const list of this.voices.values()) for (const voice of list) voice.playing = false
		this.voices.clear()
		this.samples.clear()
		this.music = null
	}

	private halt(voice: SoundVoice): void {
		voice.playing = false
		try {
			this.stopVoice?.(voice)
		} catch {}
	}
}

/** Best-effort Float32 PCM out of the wpc-emu/PinMAME audio message shapes (null when unrecognised). */
export function extractPcm(data: unknown): Float32Array | null {
	if (!data) return null
	if (data instanceof Float32Array) return data.length ? data : null
	const shaped = data as { samples?: unknown; pcm?: unknown; data?: unknown }
	for (const field of [shaped.samples, shaped.pcm, shaped.data]) {
		if (field instanceof Float32Array) return field.length ? field : null
		if (Array.isArray(field) && field.length && field.every(v => typeof v === 'number'))
			return Float32Array.from(field as number[])
	}
	return null
}
