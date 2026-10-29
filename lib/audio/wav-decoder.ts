// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFourCc } from '../io/binary-helpers.js'

/** Minimal WAV decoder: tags 1 (PCM), 3 (float) and 0x11/0x02 (IMA/MS-ADPCM), downmixed to mono.
 *
 * VPX stores imported .wav sounds as a reconstructed canonical WAVE file
 * (@see Sound::CreateFromStream), so a small header parser covers every
 * table-embedded WAV without runtime deps. Runs inline in Node/tests and
 * the browser (no worker round-trip, no decodeAudioData).
 * Unsupported codecs (e.g. tag 34) and non-WAV imports (upstream
 * stores those as raw MP3/OGG bytes) return null. Multi-channel audio is
 * downmixed to mono: the sinks are mono-only (`createBuffer(1, ...)`).
 */
export interface DecodedWav {
	pcm: Float32Array
	sampleRate: number
	/** Pre-downmix count; native feeds this to mono compensation. */
	channels: number
}

export function decodeWavAudio(bytes: Uint8Array): DecodedWav | null {
	if (bytes.length < 44) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (readFourCc(view, 0) !== 'RIFF' || readFourCc(view, 8) !== 'WAVE') return null
	// Scan chunks (fmt, data, skipping unknowns) instead of assuming a 44-byte header.
	let fmt: { tag: number; channels: number; rate: number; bits: number; blockAlign: number } | null = null
	let dataOffset = -1
	let dataSize = 0
	let pos = 12
	while (pos + 8 <= bytes.length) {
		const tag = readFourCc(view, pos)
		const size = view.getUint32(pos + 4, true)
		if (tag === 'fmt ' && fmt === null && size >= 16 && pos + 24 <= bytes.length) {
			fmt = {
				tag: view.getUint16(pos + 8, true),
				channels: view.getUint16(pos + 10, true),
				rate: view.getUint32(pos + 12, true),
				bits: view.getUint16(pos + 22, true),
				blockAlign: view.getUint16(pos + 20, true),
			}
		} else if (tag === 'data' && dataOffset < 0) {
			dataOffset = pos + 8
			dataSize = size
		}
		pos += 8 + size + (size % 2)
	}
	if (!fmt || dataOffset < 0) return null
	const { tag, channels, rate, bits, blockAlign } = fmt
	// Sanity cap: real WAVs stay far below 64 channels, so more means a corrupt fmt chunk.
	if (!(rate > 0) || channels < 1 || channels > 64) return null
	if (tag === 2 || tag === 0x11)
		return decodeAdpcm(view, bytes, dataOffset, dataSize, tag, channels, rate, blockAlign)
	const bytesPerSample = bits / 8
	if (![1, 2, 3, 4].includes(bytesPerSample)) return null
	const frameSize = channels * bytesPerSample
	const available = Math.min(dataSize, bytes.length - dataOffset)
	const frames = Math.floor(available / frameSize)
	if (frames <= 0) return null
	const pcm = new Float32Array(frames)
	const isFloat = tag === 3
	if (isFloat && bits !== 32 && bits !== 64) return null
	if (!isFloat && tag !== 1) return null
	for (let frame = 0; frame < frames; frame++) {
		let sum = 0
		for (let ch = 0; ch < channels; ch++) {
			const off = dataOffset + frame * frameSize + ch * bytesPerSample
			sum += readSample(view, bytes, off, tag, bits)
		}
		pcm[frame] = sum / channels
	}
	return { pcm, sampleRate: rate, channels }
}

/**
 * Decodes any browser-supported container (MP3/OGG/FLAC/WAV) through a
 * throwaway offline context, downmixed to mono and resampled to the context's
 * 44.1 kHz rate. Null where
 * decoding is unavailable (Node/tests) or the bytes are undecodable; the
 * input is copied because `decodeAudioData` detaches its buffer.
 */
export async function decodeExternalAudio(bytes: Uint8Array): Promise<DecodedWav | null> {
	const Ctor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
	if (!Ctor || bytes.length < 16) return null
	try {
		const ctx = new Ctor(1, 1, 44100)
		const copy = bytes.slice()
		const buffer = await ctx.decodeAudioData(copy.buffer)
		const channels = buffer.numberOfChannels
		const frames = buffer.length
		const pcm = new Float32Array(frames)
		for (let ch = 0; ch < channels; ch++) {
			const data = buffer.getChannelData(ch)
			for (let i = 0; i < frames; i++) pcm[i] += data[i] / channels
		}
		return { pcm, sampleRate: buffer.sampleRate, channels }
	} catch {
		return null
	}
}

function readSample(view: DataView, bytes: Uint8Array, off: number, tag: number, bits: number): number {
	if (tag === 3) return bits === 32 ? view.getFloat32(off, true) : view.getFloat64(off, true)
	switch (bits) {
		// 8-bit WAV PCM is unsigned with a 128 center.
		case 8:
			return (bytes[off]! - 128) / 128
		case 16:
			return view.getInt16(off, true) / 32768
		case 24: {
			const raw = bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16)
			return (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608
		}
		case 32:
			return view.getInt32(off, true) / 2147483648
		default:
			return null as never
	}
}

const IMA_INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]
const IMA_STEP_TABLE = [
	7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107,
	118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
	1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894,
	6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
	32767,
]
const MS_ADAPTATION_TABLE = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230]
// Standard predictor pairs (stored streams carry no fmt extension to read them from).
const MS_COEFS: Array<readonly [number, number]> = [
	[256, 0],
	[512, -256],
	[0, 0],
	[192, 64],
	[240, 0],
	[460, -208],
	[392, -232],
]

/** IMA-ADPCM (0x11) and MS-ADPCM (0x02) block decode, downmixed to mono. */
function decodeAdpcm(
	view: DataView,
	bytes: Uint8Array,
	dataOffset: number,
	dataSize: number,
	tag: number,
	channels: number,
	rate: number,
	blockAlign: number,
): DecodedWav | null {
	const isMs = tag === 2
	const header = (isMs ? 7 : 4) * channels
	if (blockAlign <= header) return null
	const perBlock = isMs
		? Math.floor(((blockAlign - 7 * channels) * 2) / channels) + 2
		: Math.floor(((blockAlign - 4 * channels) * 8) / (4 * channels)) + 1
	const available = Math.min(dataSize, bytes.length - dataOffset)
	const blocks = Math.floor(available / blockAlign)
	if (blocks <= 0) return null
	const frames = blocks * perBlock
	const chans = Array.from({ length: channels }, () => new Float32Array(frames))
	let frame = 0
	if (isMs) {
		const sample1 = new Int32Array(channels)
		const sample2 = new Int32Array(channels)
		const delta = new Int32Array(channels)
		const coef1 = new Int32Array(channels)
		const coef2 = new Int32Array(channels)
		for (let b = 0; b < blocks; b++, frame += perBlock) {
			const block = dataOffset + b * blockAlign
			for (let c = 0; c < channels; c++) {
				const pair = MS_COEFS[Math.min(bytes[block + c], MS_COEFS.length - 1)]
				coef1[c] = pair[0]
				coef2[c] = pair[1]
			}
			for (let c = 0; c < channels; c++) delta[c] = view.getInt16(block + channels + c * 2, true)
			for (let c = 0; c < channels; c++) sample1[c] = view.getInt16(block + channels * 3 + c * 2, true)
			for (let c = 0; c < channels; c++) sample2[c] = view.getInt16(block + channels * 5 + c * 2, true)
			let n = 0
			for (let c = 0; c < channels; c++) chans[c][frame] = sample2[c] / 32768
			if (++n < perBlock) {
				for (let c = 0; c < channels; c++) chans[c][frame + n] = sample1[c] / 32768
				n++
			}
			const base = block + channels * 7
			let nibble = 0
			while (n < perBlock) {
				for (let c = 0; c < channels && n < perBlock; c++) {
					const byte = bytes[base + (nibble >> 1)]
					const u = nibble % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
					nibble++
					const signed = u >= 8 ? u - 16 : u
					// Arithmetic shift like upstream dr_wav; truncating division rounds
					// negative predictor sums the wrong way (off by one).
					const next = Math.max(
						-32768,
						Math.min(32767, ((sample1[c] * coef1[c] + sample2[c] * coef2[c]) >> 8) + signed * delta[c]),
					)
					chans[c][frame + n] = next / 32768
					sample2[c] = sample1[c]
					sample1[c] = next
					delta[c] = Math.max(16, (delta[c] * MS_ADAPTATION_TABLE[u]) >> 8)
				}
				n++
			}
		}
	} else {
		const predictor = new Int32Array(channels)
		const stepIndex = new Int32Array(channels)
		for (let b = 0; b < blocks; b++, frame += perBlock) {
			const block = dataOffset + b * blockAlign
			let at = block
			for (let c = 0; c < channels; c++) {
				predictor[c] = view.getInt16(at, true)
				stepIndex[c] = Math.max(0, Math.min(88, bytes[at + 2]))
				chans[c][frame] = predictor[c] / 32768
				at += 4
			}
			let n = 1
			while (n < perBlock) {
				for (let c = 0; c < channels && n < perBlock; c++) {
					for (let k = 0; k < 8 && n + k < perBlock; k++) {
						const nibble = k % 2 === 0 ? bytes[at + (k >> 1)] & 0x0f : bytes[at + (k >> 1)] >> 4
						const step = IMA_STEP_TABLE[stepIndex[c]]
						let diff = step >> 3
						if (nibble & 1) diff += step >> 2
						if (nibble & 2) diff += step >> 1
						if (nibble & 4) diff += step
						predictor[c] = Math.max(-32768, Math.min(32767, predictor[c] + (nibble & 8 ? -diff : diff)))
						stepIndex[c] = Math.max(0, Math.min(88, stepIndex[c] + IMA_INDEX_TABLE[nibble]))
						chans[c][frame + n + k] = predictor[c] / 32768
					}
					at += 4
				}
				n += 8
			}
		}
	}
	const pcm = new Float32Array(frames)
	for (let i = 0; i < frames; i++) {
		let sum = 0
		for (let c = 0; c < channels; c++) sum += chans[c][i]
		pcm[i] = sum / channels
	}
	return { pcm, sampleRate: rate, channels }
}
