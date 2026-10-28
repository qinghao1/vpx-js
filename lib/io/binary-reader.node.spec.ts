// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'chai'
import { NodeBinaryReader } from './binary-reader.node.js'

const PAYLOAD = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80])

describe('The Node file reader', () => {
	let dir = ''
	let file = ''

	before(() => {
		dir = mkdtempSync(join(tmpdir(), 'vpx-node-reader-'))
		file = join(dir, 'sample.bin')
		writeFileSync(file, PAYLOAD)
	})

	after(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('should throw when reading before opening', async () => {
		const reader = new NodeBinaryReader(file)
		expect(reader.isOpen()).to.be.false
		let err: Error | null = null
		try {
			await reader.read(new Uint8Array(1), 0, 1, 0)
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.equal('NodeBinaryReader not open')
	})

	it('should be idempotent across open calls', async () => {
		const reader = new NodeBinaryReader(file)
		await reader.open()
		await reader.open()
		expect(reader.isOpen()).to.be.true
		const target = new Uint8Array(PAYLOAD.length)
		const [n, view] = await reader.read(target, 0, PAYLOAD.length, 0)
		expect(n).to.equal(PAYLOAD.length)
		expect(new Uint8Array(view)).to.deep.equal(PAYLOAD)
		await reader.close()
	})

	it('should report the bytes actually read (not the requested length)', async () => {
		const reader = new NodeBinaryReader(file)
		await reader.open()
		const target = new Uint8Array(100)
		const [n, data] = await reader.read(target, 0, 100, 0)
		expect(n).to.equal(PAYLOAD.length)
		expect(data.length).to.equal(PAYLOAD.length)
		await reader.close()
	})

	it('should report zero at EOF', async () => {
		const reader = new NodeBinaryReader(file)
		await reader.open()
		const [n, data] = await reader.read(new Uint8Array(10), 0, 10, 999)
		expect(n).to.equal(0)
		expect(data.length).to.equal(0)
		await reader.close()
	})

	it('should reject negative positions instead of aliasing bytes', async () => {
		const reader = new NodeBinaryReader(file)
		await reader.open()
		let err: Error | null = null
		try {
			await reader.read(new Uint8Array(4), 0, 4, -8)
		} catch (e) {
			err = e as Error
		}
		expect(err?.message).to.match(/position/)
		await reader.close()
	})

	it('should retain bytes after close but drop them on release', async () => {
		const reader = new NodeBinaryReader(file)
		await reader.open()
		await reader.close()
		expect(reader.isOpen()).to.be.true
		expect(reader.getData()?.length).to.equal(PAYLOAD.length)
		await reader.release()
		expect(reader.isOpen()).to.be.false
		expect(reader.getData()).to.equal(undefined)
	})
})
