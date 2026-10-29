// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { decodeWavAudio } from '../audio/wav-decoder.js'
import { decodeUtf8OrCp1252, getDataView } from '../io/binary-helpers.js'
import type { Storage } from '../io/ole-doc.js'

/** Upstream sound-format tail size (outputTarget byte + volume/pan/fade/volume int32s). @see Sound::CreateFromStream */
const NEW_SOUND_TAIL_SIZE = 17

/** File format version that introduced the surround tail. @see NEW_SOUND_FORMAT_VERSION */
export const NEW_SOUND_FORMAT_VERSION = 1031

/** Upstream `SoundOutTypes` (parts/Sound.h): table vs backglass output. */
export enum SoundOutType {
	TABLE = 0,
	BACKGLASS = 1,
}

/**
 * Table-embedded sound — a `Sound{i}` GameStg stream (raw struct, not BIFF).
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/Sound.cpp (CreateFromStream/SaveToStream)
 *
 * Layout: int32 nameLen + name, int32 pathLen + path, int32 dummyLen + dummy,
 * then for `.wav` paths an 18-byte WAVEFORMATEX + int32 cdata + cdata raw PCM
 * bytes (rebuilt here into a playable WAV file in `data`, as upstream does),
 * else int32 cdata + cdata raw imported-file bytes. Followed by the settings
 * tail: 17 bytes (new format) or 1 bool byte (pre-1031).
 */
export class Sound {
	/** Script-facing sample name (`PlaySound("...")`). */
	public name!: string
	/** Original import path (extension decides the WAV branch, upstream `isWav`). */
	public path = ''
	/** Complete playable file bytes (WAV with header, or the raw imported file). */
	public data!: Uint8Array
	/** Decoded mono float PCM (null for non-WAV imports and unsupported codecs). */
	public pcm: Float32Array | null = null
	public sampleRate = 0
	public outputTarget: SoundOutType = SoundOutType.TABLE
	public volume = 100
	public pan = 0
	public frontRearFade = 0

	private constructor() {}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Sound> {
		const sound = new Sound()
		sound.parse(await storage.read(itemName), itemName)
		return sound
	}

	public getName(): string {
		return this.name
	}

	/** True when the sample decoded to playable PCM and can be registered. */
	public isPlayable(): boolean {
		return !!this.pcm?.length && this.sampleRate > 0
	}

	private parse(bytes: Uint8Array, itemName: string): void {
		const view = getDataView(bytes)
		let pos = 0
		const readBytes = (len: number, what: string): Uint8Array => {
			if (len < 0 || pos + len > bytes.length)
				throw new Error(`Corrupt sound stream "${itemName}": ${what} of ${len} bytes overruns the stream.`)
			const slice = bytes.subarray(pos, pos + len)
			pos += len
			return slice
		}
		const readInt32 = (what: string): number => {
			if (pos + 4 > bytes.length)
				throw new Error(`Corrupt sound stream "${itemName}": ${what} overruns the stream.`)
			const value = view.getInt32(pos, true)
			pos += 4
			return value
		}
		this.name = decodeUtf8OrCp1252(readBytes(readInt32('name length'), 'name'))
		this.path = decodeUtf8OrCp1252(readBytes(readInt32('path length'), 'path'))
		// Legacy lowercase-name copy (modern saves store a single NUL); content unused.
		readBytes(readInt32('name-copy length'), 'name copy')
		if (Sound.isWavPath(this.path)) {
			if (pos + 18 > bytes.length)
				throw new Error(`Corrupt sound stream "${itemName}": WAVEFORMATEX overruns the stream.`)
			const wFormatTag = view.getUint16(pos, true)
			const nChannels = view.getUint16(pos + 2, true)
			const nSamplesPerSec = view.getUint32(pos + 4, true)
			const nAvgBytesPerSec = view.getUint32(pos + 8, true)
			const nBlockAlign = view.getUint16(pos + 12, true)
			const wBitsPerSample = view.getUint16(pos + 14, true)
			pos += 18
			const cdata = readInt32('WAV sample length')
			const samples = readBytes(cdata, 'WAV samples')
			this.data = Sound.rebuildWav(
				wFormatTag,
				nChannels,
				nSamplesPerSec,
				nAvgBytesPerSec,
				nBlockAlign,
				wBitsPerSample,
				samples,
			)
		} else {
			this.data = readBytes(readInt32('sample length'), 'samples').slice()
		}
		this.parseTail(view, bytes.length, pos, itemName)
		const decoded = decodeWavAudio(this.data)
		if (decoded) {
			this.pcm = decoded.pcm
			this.sampleRate = decoded.sampleRate
		}
	}

	private parseTail(view: DataView, size: number, pos: number, itemName: string): void {
		const remaining = size - pos
		if (remaining >= NEW_SOUND_TAIL_SIZE) {
			const target = view.getUint8(pos)
			this.outputTarget = target > SoundOutType.BACKGLASS ? SoundOutType.TABLE : target
			this.volume = view.getInt32(pos + 1, true)
			this.pan = view.getInt32(pos + 5, true)
			this.frontRearFade = view.getInt32(pos + 9, true)
		} else if (remaining === 1) {
			// Pre-1031: toBackglassOutput bool (also implied by a bgout_ name prefix upstream).
			const backglass =
				view.getUint8(pos) !== 0 ||
				this.name.toLowerCase().startsWith('bgout_') ||
				this.path === '* Backglass Output *'
			this.outputTarget = backglass ? SoundOutType.BACKGLASS : SoundOutType.TABLE
		} else if (remaining !== 0) {
			throw new Error(
				`Corrupt sound stream "${itemName}": ${remaining} trailing bytes match neither sound tail format.`,
			)
		}
	}

	/** Upstream `isWav`: the stored extension decides the WAVEFORMATEX branch. */
	public static isWavPath(path: string): boolean {
		return /\.wav$/i.test(path)
	}

	/** Rebuilds the canonical WAV file upstream synthesizes from WAVEFORMATEX + cdata. */
	private static rebuildWav(
		wFormatTag: number,
		nChannels: number,
		nSamplesPerSec: number,
		nAvgBytesPerSec: number,
		nBlockAlign: number,
		wBitsPerSample: number,
		samples: Uint8Array,
	): Uint8Array {
		const out = new Uint8Array(44 + samples.length)
		const view = getDataView(out)
		writeTag(view, 0, 'RIFF')
		view.setUint32(4, out.length - 8, true)
		writeTag(view, 8, 'WAVE')
		writeTag(view, 12, 'fmt ')
		view.setUint32(16, 16, true)
		view.setUint16(20, wFormatTag, true)
		view.setUint16(22, nChannels, true)
		view.setUint32(24, nSamplesPerSec, true)
		view.setUint32(28, nAvgBytesPerSec, true)
		view.setUint16(32, nBlockAlign, true)
		view.setUint16(34, wBitsPerSample, true)
		writeTag(view, 36, 'data')
		view.setUint32(40, samples.length, true)
		out.set(samples, 44)
		return out
	}
}

function writeTag(view: DataView, pos: number, tag: string): void {
	for (let i = 0; i < 4; i++) view.setUint8(pos + i, tag.charCodeAt(i))
}
