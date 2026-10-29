// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { decodeWavAudio } from '../audio/wav-decoder.js'
import { decodeUtf8OrCp1252, getDataView, writeFourCc } from '../io/binary-helpers.js'
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

/** Legacy backglass markers (case-insensitive): name substring and full import path. */
const BACKGLASS_NAME_MARKER = 'bgout_'
const BACKGLASS_PATH_SENTINEL = '* backglass output *'

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
		const fail = (what: string): never => {
			throw new Error(`Corrupt sound stream "${itemName}": ${what} overruns the stream.`)
		}
		const need = (len: number, what: string): void => {
			if (len < 0 || pos + len > bytes.length) fail(`${what} of ${len} bytes`)
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
		// Legacy lowercase-name copy (modern saves store a single NUL); content unused.
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
			// Pre-1031: base levels default to 100 upstream (Sound.cpp locals), and
			// backglass falls back to a case-insensitive bgout_ substring or path match.
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

	/**
	 * Upstream storage sniffing (`Sound::CreateFromStream`): an exact length fit
	 * at the WAVEFORMATEX offset means WAV, at offset 0 means raw; ties (and
	 * legacy 1-byte tails) fall back to the path. Both tail sizes are tried,
	 * modern first, since the version is not plumbed this far.
	 */
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

	/** Upstream `isWav`: empty extensions count as WAV, otherwise the stored extension decides. */
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

/** WAVEFORMATEX blob carried inside the sound stream. */
interface WavFormat {
	tag: number
	channels: number
	rate: number
	avgBytesPerSec: number
	blockAlign: number
	bits: number
}
