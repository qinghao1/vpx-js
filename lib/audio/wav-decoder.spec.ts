// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { decodeExternalAudio, decodeWavAudio } from './wav-decoder.js'

function buildWav(
	formatTag: number,
	channels: number,
	rate: number,
	bits: number,
	payload: Uint8Array,
	extraChunks: Uint8Array[] = [],
	blockAlign = Math.round((channels * bits) / 8),
): Uint8Array {
	const dataSize = payload.length
	const headerSize = 12 + extraChunks.reduce((n, c) => n + c.length, 0) + 8 + 16 + 8
	const out = new Uint8Array(headerSize + dataSize)
	const view = new DataView(out.buffer)
	const writeTag = (pos: number, tag: string): void => {
		for (let i = 0; i < 4; i++) view.setUint8(pos + i, tag.charCodeAt(i))
	}
	writeTag(0, 'RIFF')
	view.setUint32(4, out.length - 8, true)
	writeTag(8, 'WAVE')
	let pos = 12
	for (const chunk of extraChunks) {
		out.set(chunk, pos)
		pos += chunk.length
	}
	writeTag(pos, 'fmt ')
	view.setUint32(pos + 4, 16, true)
	view.setUint16(pos + 8, formatTag, true)
	view.setUint16(pos + 10, channels, true)
	view.setUint32(pos + 12, rate, true)
	view.setUint32(pos + 16, Math.round((rate * channels * bits) / 8), true)
	view.setUint16(pos + 20, blockAlign, true)
	view.setUint16(pos + 22, bits, true)
	pos += 24
	writeTag(pos, 'data')
	view.setUint32(pos + 4, dataSize, true)
	out.set(payload, pos + 8)
	return out
}

function int16Samples(values: number[]): Uint8Array {
	const out = new Uint8Array(values.length * 2)
	const view = new DataView(out.buffer)
	values.forEach((v, i) => view.setInt16(i * 2, v, true))
	return out
}

describe('decodeWavAudio', () => {
	it('should decode 16-bit mono PCM', () => {
		const decoded = decodeWavAudio(buildWav(1, 1, 8000, 16, int16Samples([0, 32767, -32768]))!)
		expect(decoded?.sampleRate).to.equal(8000)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(3)
		expect(decoded?.pcm[0]).to.be.closeTo(0, 1e-9)
		expect(decoded?.pcm[1]).to.be.closeTo(32767 / 32768, 1e-6)
		expect(decoded?.pcm[2]).to.equal(-1)
	})

	it('should downmix stereo to mono', () => {
		const decoded = decodeWavAudio(buildWav(1, 2, 44100, 16, int16Samples([32767, -32767, 0, 0]))!)
		expect(decoded?.sampleRate).to.equal(44100)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(2)
		expect(decoded?.pcm[0]).to.be.closeTo(0, 1e-6)
		expect(decoded?.pcm[1]).to.equal(0)
	})

	it('should decode unsigned 8-bit PCM', () => {
		const decoded = decodeWavAudio(buildWav(1, 1, 11025, 8, new Uint8Array([128, 255, 0]))!)
		expect(decoded?.sampleRate).to.equal(11025)
		expect(decoded?.pcm[0]).to.equal(0)
		expect(decoded?.pcm[1]).to.be.closeTo(127 / 128, 1e-6)
		expect(decoded?.pcm[2]).to.equal(-1)
	})

	it('should decode 32-bit float', () => {
		const payload = new Uint8Array(8)
		new DataView(payload.buffer).setFloat32(0, 0.5, true)
		new DataView(payload.buffer).setFloat32(4, -0.25, true)
		const decoded = decodeWavAudio(buildWav(3, 1, 48000, 32, payload))!
		expect(decoded?.sampleRate).to.equal(48000)
		expect(decoded?.pcm[0]).to.be.closeTo(0.5, 1e-6)
		expect(decoded?.pcm[1]).to.be.closeTo(-0.25, 1e-6)
	})

	it('should skip unknown chunks before fmt', () => {
		const junk = new Uint8Array(12)
		new DataView(junk.buffer).setUint8(0, 'J'.charCodeAt(0))
		new DataView(junk.buffer).setUint8(1, 'U'.charCodeAt(0))
		new DataView(junk.buffer).setUint8(2, 'N'.charCodeAt(0))
		new DataView(junk.buffer).setUint8(3, 'K'.charCodeAt(0))
		new DataView(junk.buffer).setUint32(4, 4, true)
		const decoded = decodeWavAudio(buildWav(1, 1, 8000, 16, int16Samples([16384]), [junk]))!
		expect(decoded?.pcm[0]).to.be.closeTo(0.5, 1e-6)
	})

	it('should return null for unsupported codecs and corrupt input', () => {
		expect(decodeWavAudio(buildWav(0x11, 1, 8000, 16, new Uint8Array(256)))).to.equal(null)
		expect(decodeWavAudio(buildWav(34, 1, 8000, 16, int16Samples([0])))).to.equal(null)
		expect(decodeWavAudio(buildWav(3, 1, 8000, 24, new Uint8Array(3)))).to.equal(null)
		expect(decodeWavAudio(buildWav(1, 65, 8000, 16, new Uint8Array(130)))).to.equal(null)
		expect(decodeWavAudio(new Uint8Array(10))).to.equal(null)
		expect(decodeWavAudio(new TextEncoder().encode('RIFF....NOTWAVE' + 'x'.repeat(40)))).to.equal(null)
		expect(decodeWavAudio(buildWav(1, 1, 8000, 16, new Uint8Array(0)))).to.equal(null)
	})

	it('should decode 24-bit PCM sign extension', () => {
		const payload = new Uint8Array([0x00, 0x00, 0x80, 0xff, 0xff, 0x7f])
		const decoded = decodeWavAudio(buildWav(1, 1, 8000, 24, payload))!
		expect(decoded?.pcm[0]).to.equal(-1)
		expect(decoded?.pcm[1]).to.be.closeTo(8388607 / 8388608, 1e-9)
	})

	it('should decode 32-bit int and 64-bit float PCM', () => {
		const intPayload = new Uint8Array(8)
		const intView = new DataView(intPayload.buffer)
		intView.setInt32(0, 2147483647, true)
		intView.setInt32(4, -2147483648, true)
		const intDecoded = decodeWavAudio(buildWav(1, 1, 8000, 32, intPayload))!
		expect(intDecoded?.pcm[0]).to.be.closeTo(2147483647 / 2147483648, 1e-9)
		expect(intDecoded?.pcm[1]).to.equal(-1)
		const floatPayload = new Uint8Array(8)
		new DataView(floatPayload.buffer).setFloat64(0, 0.5, true)
		const floatDecoded = decodeWavAudio(buildWav(3, 1, 8000, 64, floatPayload))!
		expect(floatDecoded?.pcm[0]).to.be.closeTo(0.5, 1e-9)
	})

	it('should downmix stereo 8-bit PCM to mono', () => {
		const decoded = decodeWavAudio(buildWav(1, 2, 11025, 8, new Uint8Array([128, 128, 255, 0])))!
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(2)
		expect(decoded?.pcm[0]).to.equal(0)
		expect(decoded?.pcm[1]).to.be.closeTo(-1 / 256, 1e-9)
	})

	it('should clamp an overrunning data size to the buffer', () => {
		const bytes = buildWav(1, 1, 8000, 16, int16Samples([16384]))
		new DataView(bytes.buffer).setUint32(40, 100, true)
		const decoded = decodeWavAudio(bytes)!
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(1)
		expect(decoded?.pcm[0]).to.be.closeTo(0.5, 1e-6)
	})

	it('should skip odd-size chunks with padding', () => {
		const junk = new Uint8Array([0x4a, 0x55, 0x4e, 0x4b, 5, 0, 0, 0, 1, 2, 3, 4, 5, 0])
		const decoded = decodeWavAudio(buildWav(1, 1, 8000, 16, int16Samples([16384]), [junk]))!
		expect(decoded?.pcm[0]).to.be.closeTo(0.5, 1e-6)
	})

	it('should return null (not throw) for a truncated fmt body', () => {
		// 44 bytes: RIFF header + JUNK chunk + fmt header declaring 16 body
		// bytes that are not there. Must not throw RangeError.
		const bytes = new Uint8Array(44)
		const view = new DataView(bytes.buffer)
		const writeTag = (pos: number, tag: string): void => {
			for (let i = 0; i < 4; i++) view.setUint8(pos + i, tag.charCodeAt(i))
		}
		writeTag(0, 'RIFF')
		writeTag(8, 'WAVE')
		writeTag(12, 'JUNK')
		view.setUint32(16, 16, true)
		writeTag(36, 'fmt ')
		view.setUint32(40, 16, true)
		expect(decodeWavAudio(bytes)).to.equal(null)
	})

	it('should decode IMA-ADPCM mono', () => {
		const header = new Uint8Array([100, 0, 0, 0])
		const decoded = decodeWavAudio(buildWav(0x11, 1, 8000, 4, new Uint8Array([...header, 0x77, 0, 0, 0]), [], 8))
		expect(decoded?.sampleRate).to.equal(8000)
		expect(decoded?.channels).to.equal(1)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(9)
		expect(decoded?.pcm[0]).to.be.closeTo(100 / 32768, 1e-9)
		expect(decoded?.pcm[1]).to.be.closeTo(111 / 32768, 1e-9)
		expect(decoded?.pcm[2]).to.be.closeTo(141 / 32768, 1e-9)
	})

	it('should decode IMA-ADPCM stereo and downmix', () => {
		const left = new Uint8Array([100, 0, 0, 0])
		const right = new Uint8Array([156, 255, 0, 0])
		const decoded = decodeWavAudio(
			buildWav(0x11, 2, 8000, 4, new Uint8Array([...left, ...right, 0x77, 0, 0, 0, 0x77, 0, 0, 0]), [], 16),
		)
		expect(decoded?.channels).to.equal(2)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(9)
		expect(decoded?.pcm[0]).to.be.closeTo(0, 1e-9)
		expect(decoded?.pcm[1]).to.be.closeTo(11 / 32768, 1e-9)
	})

	it('should decode MS-ADPCM mono', () => {
		const header = new Uint8Array([0, 64, 0, 232, 3, 244, 1])
		const decoded = decodeWavAudio(buildWav(2, 1, 8000, 4, new Uint8Array([...header, 0x10]), [], 8))
		expect(decoded?.sampleRate).to.equal(8000)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(4)
		for (const [i, v] of [500, 1000, 1064, 1064].entries()) expect(decoded?.pcm[i]).to.be.closeTo(v / 32768, 1e-9)
	})

	it('should round negative MS-ADPCM predictor sums down', () => {
		// coef[3]=(192,64), s1=-1000/s2=501: (-192000+32064)/256=-624.75 floors
		// to -625 (truncation would give -624); next frame floors -718.75 to -719.
		const header = new Uint8Array([3, 0, 0, 0x18, 0xfc, 0xf5, 0x01])
		const decoded = decodeWavAudio(buildWav(2, 1, 8000, 4, new Uint8Array([...header, 0x00]), [], 8))
		for (const [i, v] of [501, -1000, -625, -719].entries()) expect(decoded?.pcm[i]).to.be.closeTo(v / 32768, 1e-9)
	})

	it('should decode MS-ADPCM stereo and downmix', () => {
		const header = new Uint8Array([0, 0, 64, 0, 64, 0, 232, 3, 208, 7, 244, 1, 220, 5])
		const decoded = decodeWavAudio(buildWav(2, 2, 8000, 4, new Uint8Array([...header, 0x11, 0x00]), [], 16))
		expect(decoded?.channels).to.equal(2)
		expect(Array.from(decoded?.pcm ?? [])).to.have.length(4)
		for (const [i, v] of [1000, 1500, 1564, 1564].entries()) expect(decoded?.pcm[i]).to.be.closeTo(v / 32768, 1e-6)
	})

	it('should return null for truncated ADPCM blocks', () => {
		expect(decodeWavAudio(buildWav(0x11, 1, 8000, 4, new Uint8Array([100, 0]), [], 8))).to.equal(null)
		expect(decodeWavAudio(buildWav(2, 1, 8000, 4, new Uint8Array(3), [], 4))).to.equal(null)
	})

	it('should return null from container decode without a browser context', async () => {
		expect(await decodeExternalAudio(new Uint8Array(64))).to.equal(null)
	})
})
