import { expect } from 'chai'
import { LzwReader } from './lzw-reader.js'

describe('The LZW reader', () => {
	it('should decode a single pixel between clear and ending codes', () => {
		// 9-bit LSB-first codes: clear(256), pixel 65, ending(257).
		const reader = new LzwReader(new Uint8Array([4, 0x00, 0x83, 0x04, 0x04]), 4, 1, 4)
		const [pixels, consumed] = reader.decompress()
		expect(consumed).to.equal(5)
		expect(pixels[0]).to.equal(65)
	})

	it('should stop at the ending code without consuming trailing bytes', () => {
		const reader = new LzwReader(new Uint8Array([3, 0x00, 0x03, 0x02, 0x00, 0x00]), 4, 4, 16)
		const [pixels, consumed] = reader.decompress()
		expect(consumed).to.equal(4)
		expect(pixels.length).to.equal(64)
	})

	it('should terminate on an empty stream instead of hanging', () => {
		const reader = new LzwReader(new Uint8Array([]), 4, 4, 16)
		const [pixels, consumed] = reader.decompress()
		expect(consumed).to.equal(0)
		expect(pixels.length).to.equal(64)
	})

	it('should terminate on a mid-stream truncation instead of hanging', () => {
		const reader = new LzwReader(new Uint8Array([3, 0x00, 0x03]), 4, 4, 16)
		const [pixels, consumed] = reader.decompress()
		expect(consumed).to.be.at.most(3)
		expect(pixels.length).to.equal(64)
	})

	it('should stop writing once the output is full (corrupt oversize stream)', () => {
		// Zero codes decode to one pixel each; 1x1 RGBA output holds 4 bytes.
		// Upstream breaks when buf >= bufEnd; port must terminate with a
		// correctly-sized buffer instead of churning past the end.
		const reader = new LzwReader(new Uint8Array([20, ...new Array(20).fill(0)]), 4, 1, 4)
		const [pixels] = reader.decompress()
		expect(pixels.length).to.equal(4)
	})
})

const CLEAR = 256
const END = 257

/** Packs codes LSB-first like a GIF LZW stream, mirroring decoder code-width growth. */
function encode(codes: number[]): Uint8Array {
	let size = 9
	let slot = 258
	let top = 512
	let acc = 0
	let nbits = 0
	const bytes: number[] = []
	for (const code of codes) {
		acc |= code << nbits
		nbits += size
		while (nbits >= 8) {
			bytes.push(acc & 0xff)
			acc >>= 8
			nbits -= 8
		}
		if (code === CLEAR) {
			size = 9
			slot = 258
			top = 512
		} else if (code !== END) {
			if (slot < top) slot++
			if (slot >= top && size < 12) {
				top <<= 1
				size++
			}
		}
	}
	if (nbits > 0) bytes.push(acc & 0xff)
	return new Uint8Array([bytes.length, ...bytes, 0])
}

describe('The LZW reader rewrite guards', () => {
	it('should decode literal codes after a clear', () => {
		const [out, consumed] = new LzwReader(encode([CLEAR, 1, 2, 3, 4, 5, 6, 7, 8, END]), 8, 1, 8).decompress()
		expect(new Uint8Array(out)).to.deep.equal(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
		expect(consumed).to.equal(13)
	})

	it('should decode back-references through the prefix table', () => {
		// 258 is defined as "10 11" by the first two literals.
		const [out] = new LzwReader(encode([CLEAR, 10, 11, 258, END]), 4, 1, 4).decompress()
		expect(new Uint8Array(out)).to.deep.equal(new Uint8Array([10, 11, 10, 11]))
	})

	it('should handle a code beyond the current slot (KwKwK case)', () => {
		const [out] = new LzwReader(encode([CLEAR, 5, 258, END]), 3, 1, 3).decompress()
		expect(new Uint8Array(out)).to.deep.equal(new Uint8Array([5, 5, 5]))
	})

	it('should advance rows by pitch, not width', () => {
		const [out] = new LzwReader(encode([CLEAR, 1, 2, 3, 4, 5, 6, 7, 8, END]), 4, 2, 8).decompress()
		expect(out.length).to.equal(16)
		expect(new Uint8Array(out.subarray(0, 4))).to.deep.equal(new Uint8Array([1, 2, 3, 4]))
		expect(new Uint8Array(out.subarray(8, 12))).to.deep.equal(new Uint8Array([5, 6, 7, 8]))
	})

	it('should reinitialize on a mid-stream clear', () => {
		const [out] = new LzwReader(encode([CLEAR, 1, 2, CLEAR, 3, 4, END]), 4, 1, 4).decompress()
		expect(new Uint8Array(out)).to.deep.equal(new Uint8Array([1, 2, 3, 4]))
	})

	it('should stop at the output end on corrupt over-emission', () => {
		const [out] = new LzwReader(encode([CLEAR, 9, 9, 9, 9, 9, 9, 9, 9, END]), 2, 1, 2).decompress()
		expect(new Uint8Array(out)).to.deep.equal(new Uint8Array([9, 9]))
	})

	it('should terminate on truncated input', () => {
		const truncated = encode([CLEAR, 1, 2, 3, 4, 5, 6, 7, 8]).subarray(0, 5)
		const [out, consumed] = new LzwReader(truncated, 8, 1, 8).decompress()
		expect(out.length).to.equal(8)
		expect(consumed).to.equal(truncated.length)
	})
})
