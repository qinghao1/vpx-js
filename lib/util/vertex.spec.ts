import { describe, expect, it } from 'vitest'
import { Vertex3DNoTex2 } from './vertex.js'

describe('Vertex3DNoTex2.get', () => {
	it('reads from an unaligned buffer without throwing', () => {
		const raw = new Uint8Array(1 + Vertex3DNoTex2.size * 2)
		const writer = new DataView(raw.buffer)
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
		values.forEach((value, index) => writer.setFloat32(1 + index * 4, value, true))
		const chunk = raw.subarray(1)
		expect(chunk.byteOffset % 4).not.toBe(0)
		const vertex = Vertex3DNoTex2.get(chunk, 1)
		expect([vertex.x, vertex.y, vertex.z, vertex.nx, vertex.ny, vertex.nz, vertex.tu, vertex.tv]).toEqual([
			9, 10, 11, 12, 13, 14, 15, 16,
		])
	})
})

describe('Vertex3DNoTex2.getAll', () => {
	it('matches repeated get() with a single view, honoring start', () => {
		const count = 3
		const raw = new Uint8Array(Vertex3DNoTex2.size * (count + 1))
		const writer = new DataView(raw.buffer)
		for (let i = 0; i < 8 * (count + 1); i++) writer.setFloat32(i * 4, i + 1, true)
		const all = Vertex3DNoTex2.getAll(raw, count, 1)
		expect(all.length).toBe(count)
		const fields = (v: Vertex3DNoTex2) => [v.x, v.y, v.z, v.nx, v.ny, v.nz, v.tu, v.tv]
		for (let i = 0; i < count; i++) {
			expect(fields(all[i])).toEqual(fields(Vertex3DNoTex2.get(raw, i + 1)))
		}
		expect([all[0].x, all[0].tv]).toEqual([9, 16])
	})
})

describe('Vertex3DNoTex2.fromArray', () => {
	it('reads eight numbers in field order', () => {
		const v = Vertex3DNoTex2.fromArray([1, 2, 3, 4, 5, 6, 7, 8])
		expect([v.x, v.y, v.z, v.nx, v.ny, v.nz, v.tu, v.tv]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
	})

	it('pads missing UVs with zero', () => {
		const v = Vertex3DNoTex2.fromArray([1, 2, 3, 4, 5, 6])
		expect([v.x, v.y, v.z, v.nx, v.ny, v.nz, v.tu, v.tv]).toEqual([1, 2, 3, 4, 5, 6, 0, 0])
	})

	it('fails fast on corrupt lengths instead of storing undefined', () => {
		expect(() => Vertex3DNoTex2.fromArray([1, 2])).toThrow(RangeError)
		expect(() => Vertex3DNoTex2.fromArray([1, 2, 3, 4, 5, 6, 7])).toThrow(RangeError)
	})
})
