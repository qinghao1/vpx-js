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
