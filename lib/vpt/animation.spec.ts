// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { FrameData, VertData } from './animation.js'

function vertBuffer(values: number[]): Uint8Array {
	const buffer = new Uint8Array(values.length * 4)
	const view = new DataView(buffer.buffer)
	values.forEach((value, index) => view.setFloat32(index * 4, value, true))
	return buffer
}

describe('VertData', () => {
	it('loads position and normal from 6 little-endian floats', () => {
		const vert = VertData.load(vertBuffer([1, 2, 3, 0, 0, 1]))
		expect([vert.x, vert.y, vert.z, vert.nx, vert.ny, vert.nz]).toEqual([1, 2, 3, 0, 0, 1])
	})

	it('loads from a byte offset', () => {
		const vert = VertData.load(vertBuffer([9, 9, 9, 9, 9, 9, 1, 2, 3, 4, 5, 6]), 24)
		expect([vert.x, vert.y, vert.z, vert.nx, vert.ny, vert.nz]).toEqual([1, 2, 3, 4, 5, 6])
	})

	it('clones into an equal but distinct instance', () => {
		const vert = VertData.load(vertBuffer([1, 2, 3, 4, 5, 6]))
		const clone = vert.clone()
		expect(clone).not.toBe(vert)
		expect(clone).toEqual(vert)
	})
})

describe('FrameData', () => {
	it('parses one vertex per 24 bytes', () => {
		const frame = FrameData.get(vertBuffer([1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0]), 2)
		expect(frame.frameVerts).toHaveLength(2)
		expect(frame.frameVerts.map(vert => vert.y)).toEqual([0, 2])
	})

	it('clones deeply', () => {
		const frame = FrameData.get(vertBuffer([1, 2, 3, 4, 5, 6]), 1)
		const clone = frame.clone()
		expect(clone).not.toBe(frame)
		expect(clone.frameVerts).not.toBe(frame.frameVerts)
		expect(clone.frameVerts[0]).not.toBe(frame.frameVerts[0])
		expect(clone.frameVerts[0]).toEqual(frame.frameVerts[0])
	})
})
