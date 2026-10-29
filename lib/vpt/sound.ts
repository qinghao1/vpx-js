// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { decodeWavAudio } from '../audio/wav-decoder.js'
import { decodeUtf8OrCp1252, getDataView, writeFourCc } from '../io/binary-helpers.js'
import type { Storage } from '../io/ole-doc.js'

/** 1 output-target byte + 3 int32s + duplicate volume int32. @see Sound::CreateFromStream */
const NEW_SOUND_TAIL_SIZE = 17

/** @see WavFmt (`sizeof(WavFmt) == 18`) */
const WAV_FORMAT_SIZE = 18

/** Upstream SoundOutTypes. */
export enum SoundOutType {
	TABLE = 0,
	BACKGLASS = 1,
}

const BACKGLASS_NAME_MARKER = 'bgout_'
const BACKGLASS_PATH_SENTINEL = '* backglass output *'

/**
 * Table-embedded sound — a `Sound{i}` GameStg stream (raw struct, not BIFF).
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/Sound.cpp (CreateFromStream/SaveToStream)
 */
export class Sound {
	/** Script-facing sample name (`PlaySound("...")`). */
	public name!: string
	/** Original import path (extension decides the WAV branch, upstream `isWav`). */
	public path = ''
	public data!: Uint8Array
	/** Decoded mono float PCM (null for non-WAV imports and unsupported codecs). */
	public pcm: Float32Array | null = null
	public sampleRate = 0
	/** Decoded source channel count (pre-downmix; 1 when undecodable). */
	public channels = 1
	public outputTarget: SoundOutType = SoundOutType.TABLE
	// Base levels in percent; the tail overwrites when present.
	public volume = 0
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
		const need = (len: number, what: string): void => {
			if (len < 0 || pos + len > bytes.length)
				throw new Error(`Corrupt sound stream "${itemName}": ${what} of ${len} bytes overruns the stream.`)
		}
		const readBytes = (len: number, what: string): Uint8Array => {
			need(len, what)
			const slice = bytes.subarray(pos, pos + len)
			pos += len
			return slice
		}
		const readInt32 = (what: string): number => {
			need(4, what)
			const value = view.getInt32(pos, true)
			pos += 4
			return value
		}
		this.name = decodeUtf8OrCp1252(readBytes(readInt32('name length'), 'name'))
		this.path = decodeUtf8OrCp1252(readBytes(readInt32('path length'), 'path'))
		// Lowercase-name copy; content unused.
		readBytes(readInt32('name-copy length'), 'name copy')
		if (Sound.classifyStored(view, pos, bytes.length, this.path)) {
			need(WAV_FORMAT_SIZE, 'WAVEFORMATEX')
			const fmt: WavFormat = {
				tag: view.getUint16(pos, true),
				channels: view.getUint16(pos + 2, true),
				rate: view.getUint32(pos + 4, true),
				avgBytesPerSec: view.getUint32(pos + 8, true),
				blockAlign: view.getUint16(pos + 12, true),
				bits: view.getUint16(pos + 14, true),
			}
			pos += WAV_FORMAT_SIZE
			const cdata = readInt32('WAV sample length')
			const samples = readBytes(cdata, 'WAV samples')
			this.data = Sound.rebuildWav(fmt, samples)
		} else {
			this.data = readBytes(readInt32('sample length'), 'samples').slice()
		}
		this.parseTail(view, bytes.length, pos, itemName)
		const decoded = decodeWavAudio(this.data)
		if (decoded) {
			this.pcm = decoded.pcm
			this.sampleRate = decoded.sampleRate
			this.channels = decoded.channels
		}
	}

	private parseTail(view: DataView, size: number, pos: number, itemName: string): void {
		// Trailing bytes are the new-format tail (17), the pre-1031 backglass
		// flag (1), nothing (0), or corruption (anything else).
		const remaining = size - pos
		if (remaining >= NEW_SOUND_TAIL_SIZE) {
			const target = view.getUint8(pos)
			this.outputTarget = target > SoundOutType.BACKGLASS ? SoundOutType.TABLE : target
			this.volume = view.getInt32(pos + 1, true)
			this.pan = view.getInt32(pos + 5, true)
			this.frontRearFade = view.getInt32(pos + 9, true)
		} else if (remaining === 1) {
			// Pre-1031 has no levels (default 100); backglass via name/path markers.
			this.volume = 100
			this.pan = 100
			this.frontRearFade = 100
			const backglass =
				view.getUint8(pos) !== 0 ||
				this.name.toLowerCase().includes(BACKGLASS_NAME_MARKER) ||
				this.path.toLowerCase() === BACKGLASS_PATH_SENTINEL
			this.outputTarget = backglass ? SoundOutType.BACKGLASS : SoundOutType.TABLE
		} else if (remaining !== 0) {
			throw new Error(
				`Corrupt sound stream "${itemName}": ${remaining} trailing bytes match neither sound tail format.`,
			)
		}
	}

	/** Exact length fit selects the WAV branch; ties fall back to the path. */
	private static classifyStored(view: DataView, pos: number, size: number, path: string): boolean {
		const rest = size - pos
		const fits = (tail: number, offset: number): boolean => {
			if (pos + offset + 4 > size) return false
			const len = view.getInt32(pos + offset, true)
			return len >= 0 && rest - tail === offset + 4 + len
		}
		for (const tail of [NEW_SOUND_TAIL_SIZE, 1]) {
			const raw = fits(tail, 0)
			const wav = fits(tail, WAV_FORMAT_SIZE)
			if (raw !== wav) return wav
		}
		return Sound.isWavPath(path)
	}

	/** Upstream `isWav`: empty extensions count as WAV. */
	public static isWavPath(path: string): boolean {
		const base = path.split(/[\\/]/).pop() ?? path
		const dot = base.lastIndexOf('.')
		const ext = dot < 0 ? '' : base.slice(dot).toLowerCase()
		return ext === '' || ext === '.wav'
	}

	/** Rebuilds the canonical WAV file upstream synthesizes from WAVEFORMATEX + cdata. */
	private static rebuildWav(fmt: WavFormat, samples: Uint8Array): Uint8Array {
		const out = new Uint8Array(44 + samples.length)
		const view = getDataView(out)
		writeFourCc(view, 0, 'RIFF')
		view.setUint32(4, out.length - 8, true)
		writeFourCc(view, 8, 'WAVE')
		writeFourCc(view, 12, 'fmt ')
		view.setUint32(16, 16, true)
		view.setUint16(20, fmt.tag, true)
		view.setUint16(22, fmt.channels, true)
		view.setUint32(24, fmt.rate, true)
		view.setUint32(28, fmt.avgBytesPerSec, true)
		view.setUint16(32, fmt.blockAlign, true)
		view.setUint16(34, fmt.bits, true)
		writeFourCc(view, 36, 'data')
		view.setUint32(40, samples.length, true)
		out.set(samples, 44)
		return out
	}
}

interface WavFormat {
	tag: number
	channels: number
	rate: number
	avgBytesPerSec: number
	blockAlign: number
	bits: number
}
