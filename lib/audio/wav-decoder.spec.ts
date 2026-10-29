// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { decodeWavAudio } from './wav-decoder.js'

/** Builds a minimal WAV file: 44-byte header + payload (+ optional chunks before fmt). */
function buildWav(
	formatTag: number,
	channels: number,
	rate: number,
	bits: number,
	payload: Uint8Array,
	extraChunks: Uint8Array[] = [],
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
	view.setUint16(pos + 20, Math.round((channels * bits) / 8), true)
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
		// IMA ADPCM tag with otherwise valid framing.
		expect(decodeWavAudio(buildWav(0x11, 1, 8000, 16, new Uint8Array(256)))).to.equal(null)
		expect(decodeWavAudio(new Uint8Array(10))).to.equal(null)
		expect(decodeWavAudio(new TextEncoder().encode('RIFF....NOTWAVE' + 'x'.repeat(40)))).to.equal(null)
		expect(decodeWavAudio(buildWav(1, 1, 8000, 16, new Uint8Array(0)))).to.equal(null)
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

	it('should report the source channel count', () => {
		expect(decodeWavAudio(buildWav(1, 1, 8000, 16, int16Samples([0]))!)?.channels).to.equal(1)
		expect(decodeWavAudio(buildWav(1, 2, 8000, 16, int16Samples([0, 0])))?.channels).to.equal(2)
	})
})
