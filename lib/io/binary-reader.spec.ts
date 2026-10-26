// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { BinaryReader } from './binary-reader.js'

describe('BinaryReader short reads', () => {
	it('reports the bytes actually read (not the requested length)', async () => {
		const reader = new BinaryReader(new Uint8Array([1, 2, 3]))
		await reader.open()
		const target = new Uint8Array(10)
		const [n, data] = await reader.read(target, 0, 10, 0)
		expect(n).to.equal(3)
		expect(data.length).to.equal(3)
		expect(Array.from(data)).to.deep.equal([1, 2, 3])
		await reader.close()
	})

	it('reports zero at EOF', async () => {
		const reader = new BinaryReader(new Uint8Array([1, 2, 3]))
		await reader.open()
		const target = new Uint8Array(10)
		const [n, data] = await reader.read(target, 0, 10, 99)
		expect(n).to.equal(0)
		expect(data.length).to.equal(0)
		await reader.close()
	})
})

const PAYLOAD = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80])

async function readAll(reader: BinaryReader, length = PAYLOAD.length): Promise<Uint8Array> {
	await reader.open()
	const target = new Uint8Array(length)
	const [n, view] = await reader.read(target, 0, length, 0)
	expect(n).to.equal(Math.min(length, PAYLOAD.length))
	return new Uint8Array(view)
}

describe('The isomorphic binary reader', () => {
	it('should throw when reading before opening', async () => {
		const reader = new BinaryReader(new Uint8Array([1]))
		expect(reader.isOpen()).to.be.false
		let err: Error | null = null
		try {
			await reader.read(new Uint8Array(1), 0, 1, 0)
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.equal('BinaryReader not open')
	})

	it('should be idempotent across open calls', async () => {
		const reader = new BinaryReader(new Uint8Array(PAYLOAD))
		await reader.open()
		await reader.open()
		expect(reader.isOpen()).to.be.true
		expect(await readAll(reader)).to.deep.equal(PAYLOAD)
	})

	it('should read from a Uint8Array', async () => {
		expect(await readAll(new BinaryReader(new Uint8Array(PAYLOAD)))).to.deep.equal(PAYLOAD)
	})

	it('should read from an ArrayBuffer', async () => {
		const buf = new Uint8Array(PAYLOAD).buffer as ArrayBuffer
		expect(await readAll(new BinaryReader(buf))).to.deep.equal(PAYLOAD)
	})

	it('should read from a DataView honoring byteOffset/byteLength', async () => {
		const padded = new Uint8Array([0, 0, ...PAYLOAD, 0, 0])
		const view = new DataView(padded.buffer, 2, PAYLOAD.length)
		expect(await readAll(new BinaryReader(view))).to.deep.equal(PAYLOAD)
	})

	it('should read from a Blob', async () => {
		const blob = new Blob([PAYLOAD as unknown as BlobPart])
		expect(await readAll(new BinaryReader(blob))).to.deep.equal(PAYLOAD)
	})

	it('should reject unsupported sources', async () => {
		const reader = new BinaryReader('nope' as unknown as Blob)
		let err: Error | null = null
		try {
			await reader.open()
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.equal('Unsupported binary data source')
	})

	it('should release its buffer', async () => {
		const reader = new BinaryReader(new Uint8Array(PAYLOAD))
		await reader.open()
		expect(reader.isOpen()).to.be.true
		await reader.release()
		expect(reader.isOpen()).to.be.false
	})
})
