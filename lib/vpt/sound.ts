// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { decodeWavAudio } from '../audio/wav-decoder.js'
import { decodeUtf8OrCp1252, getDataView } from '../io/binary-helpers.js'
import type { Storage } from '../io/ole-doc.js'

/** Upstream sound-format tail size: outputTarget byte + volume/pan/fade int32s + a
 * duplicate volume int32 (written twice by SaveToStream). @see Sound::CreateFromStream */
const NEW_SOUND_TAIL_SIZE = 17

/** WAVEFORMATEX blob size inside the stream (@see WavFmt, `static_assert(sizeof(WavFmt) == 18)`). */
const WAV_FORMAT_SIZE = 18

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
 * then an exact length fit at the WAVEFORMATEX offset selects the 18-byte
 * WAVEFORMATEX + int32 cdata + cdata raw PCM bytes branch (rebuilt here into a
 * playable WAV file in `data`, as upstream does), an exact fit at offset 0 the
 * int32 cdata + cdata raw imported-file bytes branch, and ties fall back to the
 * path (empty extensions count as WAV). Followed by the settings tail:
 * 17 bytes (new format) or 1 bool byte (pre-1031).
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
	/** Decoded source channel count (pre-downmix; 1 when undecodable). */
	public channels = 1
	public outputTarget: SoundOutType = SoundOutType.TABLE
	// Editor base levels in percent (upstream Sound defaults, overwritten by the tail when present).
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
		if (Sound.classifyStored(view, pos, bytes.length, this.path)) {
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
			this.channels = decoded.channels
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
			// Pre-1031: base levels default to 100 upstream (Sound.cpp locals), and
			// backglass falls back to a case-insensitive bgout_ substring or path match.
			this.volume = 100
			this.pan = 100
			this.frontRearFade = 100
			const backglass =
				view.getUint8(pos) !== 0 ||
				this.name.toLowerCase().includes('bgout_') ||
				this.path.toLowerCase() === '* backglass output *'
			this.outputTarget = backglass ? SoundOutType.BACKGLASS : SoundOutType.TABLE
		} else if (remaining !== 0) {
			throw new Error(
				`Corrupt sound stream "${itemName}": ${remaining} trailing bytes match neither sound tail format.`,
			)
		}
	}

	/**
	 * Upstream storage sniffing (`Sound::CreateFromStream`): an exact length fit
	 * at the WAVEFORMATEX offset means WAV, at offset 0 means raw; ties (and
	 * legacy 1-byte tails) fall back to the path. Both tail sizes are tried,
	 * modern first, since the version is not plumbed this far.
	 */
	private static classifyStored(view: DataView, pos: number, size: number, path: string): boolean {
		for (const tailSize of [NEW_SOUND_TAIL_SIZE, 1]) {
			const available = size - pos - tailSize
			if (available < 0) continue
			const rawFits = Sound.lengthFits(view, pos, size, 0, available)
			const wavFits = Sound.lengthFits(view, pos, size, WAV_FORMAT_SIZE, available)
			if (rawFits !== wavFits) return wavFits
		}
		return Sound.isWavPath(path)
	}

	private static lengthFits(view: DataView, pos: number, size: number, offset: number, available: number): boolean {
		if (pos + offset + 4 > size) return false
		const len = view.getInt32(pos + offset, true)
		return len >= 0 && offset + 4 + len === available
	}

	/** Upstream `isWav`: empty extensions count as WAV, otherwise the stored extension decides. */
	public static isWavPath(path: string): boolean {
		const base = path.split(/[\\/]/).pop() ?? path
		const dot = base.lastIndexOf('.')
		const ext = dot < 0 ? '' : base.slice(dot).toLowerCase()
		return ext === '' || ext === '.wav'
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
