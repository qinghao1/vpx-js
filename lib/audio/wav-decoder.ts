// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Minimal WAV file decoder (PCM + IEEE float, downmixed to mono).
 *
 * VPX stores imported .wav sounds as a reconstructed canonical WAVE file
 * (44-byte header + raw sample bytes, @see Sound::CreateFromStream), so a
 * small header parser covers every table-embedded WAV without runtime deps.
 * It runs inline in both Node/tests and the browser: no worker round-trip
 * and no decodeAudioData needed.
 *
 * Tradeoff: only format tags 1 (PCM 8/16/24/32-bit) and 3 (IEEE float
 * 32/64-bit) decode. Exotic codecs (e.g. ADPCM tags 2/17/34) and non-WAV
 * imports (upstream stores those as raw MP3/OGG file bytes) return null —
 * playing those is a follow-up (browser decodeAudioData or a codec dep).
 * Multi-channel audio is downmixed to mono: the repo sinks
 * (Web/NullSoundEngine) are mono-only (`createBuffer(1, ...)`).
 */
export interface DecodedWav {
	pcm: Float32Array
	sampleRate: number
}

/** Decodes a complete WAV file to mono float PCM, or null when unsupported/corrupt. */
export function decodeWavAudio(bytes: Uint8Array): DecodedWav | null {
	if (bytes.length < 44) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (readTag(view, 0) !== 'RIFF' || readTag(view, 8) !== 'WAVE') return null
	// Scan chunks (fmt, data, skipping unknowns) instead of assuming a 44-byte header.
	let fmt: { tag: number; channels: number; rate: number; bits: number } | null = null
	let dataOffset = -1
	let dataSize = 0
	let pos = 12
	while (pos + 8 <= bytes.length) {
		const tag = readTag(view, pos)
		const size = view.getUint32(pos + 4, true)
		if (tag === 'fmt ' && fmt === null && size >= 16) {
			fmt = {
				tag: view.getUint16(pos + 8, true),
				channels: view.getUint16(pos + 10, true),
				rate: view.getUint32(pos + 12, true),
				bits: view.getUint16(pos + 22, true),
			}
		} else if (tag === 'data' && dataOffset < 0) {
			dataOffset = pos + 8
			dataSize = size
		}
		pos += 8 + size + (size % 2)
	}
	if (!fmt || dataOffset < 0) return null
	const { tag, channels, rate, bits } = fmt
	if (!(rate > 0) || channels < 1 || channels > 64) return null
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
	return { pcm, sampleRate: rate }
}

function readTag(view: DataView, pos: number): string {
	return String.fromCharCode(
		view.getUint8(pos),
		view.getUint8(pos + 1),
		view.getUint8(pos + 2),
		view.getUint8(pos + 3),
	)
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
		default:
			return view.getInt32(off, true) / 2147483648
	}
}
