// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { deflateSync } from 'node:zlib'
import { expect } from 'chai'
import { BiffParser, type OnBiffResultStream } from './biff-parser.js'

function record(tag: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, 4 + payload.length, true)
	for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i)
	out.set(payload, 8)
	return out
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let pos = 0
	for (const p of parts) {
		out.set(p, pos)
		pos += p.length
	}
	return out
}

describe('BiffParser.stream', () => {
	it('frames CODE exactly (cchar bytes, no trim)', async () => {
		// CODE with script text ending in "ENDB": framing must be exact so the
		// loader needs no trim (upstream AsScript reads exactly cchar).
		const script = new TextEncoder().encode('IF x THEN ENDB')
		const cchar = new Uint8Array(4)
		new DataView(cchar.buffer).setInt32(0, script.length, true)
		const codePayload = concat([cchar, script])
		// CODE record header claims len=4 (BeginObject), blob follows uncounted
		const codeHead = new Uint8Array(8)
		new DataView(codeHead.buffer).setInt32(0, 4, true)
		for (let i = 0; i < 4; i++) codeHead[4 + i] = 'CODE'.charCodeAt(i)
		const stream = concat([codeHead, codePayload, record('ENDB', new Uint8Array(0))])
		let seen: { offset: number; len: number } | undefined
		const next = BiffParser.stream(
			async (_b, tag, offset, len) => {
				if (tag === 'CODE') seen = { offset, len }
				return 0
			},
			{ streamedTags: ['CODE'] },
		)
		const adv = await next({ data: stream, storageOffset: 0 })
		expect(seen?.len).to.equal(script.length)
		expect(seen?.offset).to.equal(12)
		expect(stream.subarray(seen!.offset, seen!.offset + seen!.len)).to.deep.equal(script)
		expect(adv).to.equal(12 + script.length)
	})

	it('throws on corrupt size len<4 like upstream m_hasError instead of hanging', async () => {
		for (const bad of [-8, -4, -1, 0, 1, 3]) {
			const buf = new Uint8Array(12)
			new DataView(buf.buffer).setInt32(0, bad, true)
			for (let i = 0; i < 4; i++) buf[4 + i] = 'TEST'.charCodeAt(i)
			let called = false
			const next = BiffParser.stream(async () => {
				called = true
				return 0
			})
			let error: unknown
			try {
				await next({ data: buf, storageOffset: 0 })
			} catch (err) {
				error = err
			}
			expect((error as Error)?.message, `len=${bad}`).to.match(/invalid size/)
			expect(called, `len=${bad}`).to.equal(false)
		}
	})

	it('throws on a negative CODE length instead of stalling', async () => {
		const head = new Uint8Array(12)
		new DataView(head.buffer).setInt32(0, 4, true)
		for (let i = 0; i < 4; i++) head[4 + i] = 'CODE'.charCodeAt(i)
		new DataView(head.buffer).setInt32(8, -5, true)
		const next = BiffParser.stream(async () => 0, { streamedTags: ['CODE'] })
		let error: unknown
		try {
			await next({ data: head, storageOffset: 0 })
		} catch (err) {
			error = err
		}
		expect((error as Error)?.message).to.match(/invalid CODE length/)
	})

	it('skips FONT via 11+nameLen (not streamed cchar math) and continues to ENDB', async () => {
		// FontDescriptor: ver(1) charset(2) attr(1) weight(2) size(4) nameLen(1) name
		const name = new TextEncoder().encode('Arial')
		const payload = new Uint8Array(11 + name.length)
		payload[0] = 1
		new DataView(payload.buffer).setUint16(4, 400, true)
		new DataView(payload.buffer).setInt32(6, 100, true)
		payload[10] = name.length
		payload.set(name, 11)
		const fontHead = new Uint8Array(8)
		new DataView(fontHead.buffer).setInt32(0, 4, true)
		for (let i = 0; i < 4; i++) fontHead[4 + i] = 'FONT'.charCodeAt(i)
		const after = record('TEST', new Uint8Array([9, 9, 9, 9]))
		const stream = concat([fontHead, payload, after, record('ENDB', new Uint8Array(0))])
		const tags: string[] = []
		// Note: no streamedTags option — FONT has dedicated framing and never
		// consults that list.
		const next = BiffParser.stream(async (_b, tag) => {
			tags.push(tag)
			return 0
		})
		// FONT record
		const advFont = await next({ data: stream, storageOffset: 0 })
		expect(advFont).to.equal(19 + name.length)
		expect(tags).to.deep.equal(['FONT'])
		// next record must be TEST (not garbage mid-FONT)
		const advTest = await next({ data: stream.subarray(advFont!), storageOffset: advFont! })
		expect(tags).to.deep.equal(['FONT', 'TEST'])
		expect(advTest).to.equal(12)
	})
})

describe('BiffParser decompress and options', () => {
	it('should decompress a deflated chunk', async () => {
		const expected = new TextEncoder().encode('Hello BIFF! '.repeat(100))
		const compressed = deflateSync(expected)
		const out = await BiffParser.decompress(new Uint8Array(compressed))
		expect(out).to.deep.equal(expected)
	})

	it('should decompress a large multi-chunk stream', async () => {
		const expected = new Uint8Array(200_000).map((_, i) => (i * 31 + 7) & 0xff)
		const compressed = deflateSync(expected)
		const out = await BiffParser.decompress(new Uint8Array(compressed))
		expect(out).to.deep.equal(expected)
	})

	it('should route nested tags through onStart/onTag/onEnd', async () => {
		const seen: Array<{ tag: string; len: number }> = []
		const ended: unknown[] = []
		const nested: OnBiffResultStream<{ id: number }> = {
			onStart: () => ({ id: 7 }),
			onTag:
				item =>
				async (_buf, tag, _off, len): Promise<number> => {
					seen.push({ tag, len })
					expect(item.id).to.equal(7)
					return 0
				},
			onEnd: item => void ended.push(item),
		}
		const handler = BiffParser.stream(async () => 0, { nestedTags: { TEST: nested } })

		const consumedStart = await handler({ data: record('TEST', new Uint8Array([1, 2, 3, 4])), storageOffset: 0 })
		expect(consumedStart).to.equal(12)
		const consumedInner = await handler({ data: record('FOO!', new Uint8Array([9, 9, 9, 9])), storageOffset: 12 })
		expect(consumedInner).to.equal(12)
		const consumedEnd = await handler({ data: record('ENDB', new Uint8Array(0)), storageOffset: 24 })
		expect(consumedEnd).to.equal(8)

		expect(seen).to.deep.equal([{ tag: 'FOO!', len: 4 }])
		expect(ended).to.deep.equal([{ id: 7 }])
	})

	it('should terminate a top-level stream at ENDB', async () => {
		const handler = BiffParser.stream(async () => 0)
		const result = await handler({ data: record('ENDB', new Uint8Array(0)), storageOffset: 0 })
		expect(result).to.be.null
	})

	it('should request more bytes when the record is truncated', async () => {
		const handler = BiffParser.stream(async () => 0)
		// Declared len 8 (tag + 4 payload bytes) but only 8 bytes present: -(8 + 4).
		const partial = record('TEST', new Uint8Array([1, 2, 3, 4])).subarray(0, 8)
		const result = await handler({ data: partial, storageOffset: 0 })
		expect(result).to.equal(-12)
	})

	it('should stop on input shorter than a length prefix', async () => {
		const handler = BiffParser.stream(async () => 0)
		const result: number | null = await handler({ data: new Uint8Array([1, 2, 3]), storageOffset: 0 })
		expect(result).to.be.null
	})

	it('should report chunk offsets relative to the storage', async () => {
		const offsets: number[] = []
		const handler = BiffParser.stream(async (_buf, _tag, offset) => {
			offsets.push(offset)
			return 0
		})
		await handler({ data: record('AB  ', new Uint8Array([5, 6])), storageOffset: 100 })
		expect(offsets).to.deep.equal([108])
	})
})
