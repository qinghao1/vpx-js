// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const MAX_CODES = 4095
const CODE_MASK = [0, 0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff, 0x01ff, 0x03ff, 0x07ff, 0x0fff]

/**
 * This is a 1:1 port of VPinball's lzwreader which is used to decompress
 * bitmaps.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/media/lzwreader.cpp
 */
export class LzwReader {
	private pstm: BufferPtr

	private readonly pbBitsOutCur: BufferPtr
	private readonly cbStride: number

	private currSize: number = 0 /* The current code size */
	private clear: number = 0 /* Value for a clear code */
	private ending: number = 0 /* Value for a ending code */
	private newCodes: number = 0 /* First available code */
	private topSlot: number = 0 /* Highest code for current size */
	private slot: number = 0 /* Last read code */

	/* Bit-stream state for separating out codes. */
	private numAvailBytes: number = 0 /* # bytes left in block */
	private numBitsLeft: number = 0 /* # bits left in current byte */
	private b1: number = 0 /* Current byte */
	private byteBuff = new Uint8Array(257) /* Current block */
	private pBytes!: BufferPtr /* points to byte_buff - Pointer to next byte in block */

	private stack = new Uint8Array(
		MAX_CODES + 2,
	) /* Stack for storing pixels (worst case expansion is MAX_CODES+2 pushes per code) */
	private suffix = new Uint8Array(MAX_CODES + 1) /* Suffix table */
	private prefix: number[] = [] /* Prefix linked list */

	private readonly width: number
	private badCodeCount: number = 0

	constructor(pstm: Uint8Array, width: number, height: number, pitch: number) {
		for (let i = 0; i < MAX_CODES + 1; i++) {
			this.prefix[i] = 0
		}
		this.cbStride = pitch
		this.pbBitsOutCur = new BufferPtr(new Uint8Array(pitch * height))

		this.badCodeCount = 0

		this.pstm = new BufferPtr(pstm)

		this.width = width // 32-bit picture
	}

	/** Corrupt codes seen beyond the current slot (KwKwK over-emission guard). */
	public getBadCodeCount(): number {
		return this.badCodeCount
	}

	public decompress(): [Uint8Array, number] {
		let sp: BufferPtr // points to this.stack
		let bufPtr: BufferPtr // points to this.buf
		let buf: BufferPtr
		let bufCnt: number

		let c: number
		let oc: number
		let fc: number
		let code: number
		let size: number

		/* Initialize for decoding a new image...
		 */
		size = 8
		this.initExp(size)

		/* Initialize in case the stream lacks a leading clear code. */
		oc = fc = 0

		/* Allocate space for the decode buffer
		 */
		buf = this.NextLine()

		/* Set up the stack pointer and decode buffer pointer
		 */
		sp = new BufferPtr(this.stack)
		bufPtr = BufferPtr.fromPtr(buf)
		bufCnt = this.width
		const outLen = this.pbBitsOutCur.getBuffer().length

		/* This is the main loop.  For each code we get we pass through the
		 * linked list of prefix codes, pushing the corresponding "character" for
		 * each code onto the stack.  When the list reaches a single "character"
		 * we push that on the stack too, and then start unstacking each
		 * character for output in the correct order.  Special handling is
		 * included for the clear code, and the whole thing ends when we get
		 * an ending code.
		 */
		c = this.getNextCode()
		while (c !== this.ending) {
			/* If we had a file error, return without completing the decode
			 */
			if (c < 0) {
				break
			}

			/* If the code is a clear code, reinitialize all necessary items.
			 */
			if (c === this.clear) {
				this.currSize = size + 1
				this.slot = this.newCodes
				this.topSlot = 1 << this.currSize

				/* Skip repeated clear codes. */
				c = this.getNextCode()
				while (c === this.clear) {
					c = this.getNextCode()
				}

				/* An ending code right after a clear code ends the image. */
				if (c === this.ending) {
					break
				}

				/* Clamp an out-of-range code after a clear to color zero. */
				if (c >= this.slot) {
					c = 0
				}

				oc = fc = c

				/* Emit the pixel, advancing to the next line at the row end. */
				bufPtr.set(c)
				bufPtr.incr()

				if (--bufCnt === 0) {
					buf = this.NextLine()
					bufPtr = BufferPtr.fromPtr(buf)
					bufCnt = this.width
				}
				if (bufPtr.getPos() >= outLen) break // corrupt stream emitting more pixels than the declared size
			} else {
				/* Otherwise this is a data code: decode it into a stack of pixels. */
				code = c

				/* Handle a code beyond the current slot (KwKwK case) by reusing the last code. */
				if (code >= this.slot) {
					if (code > this.slot) {
						++this.badCodeCount
					}
					code = oc
					sp.set(fc)
					sp.incr()
				}

				/* Walk the prefix chain, pushing suffixes onto the stack. */
				while (code >= this.newCodes) {
					sp.set(this.suffix[code])
					sp.incr()
					code = this.prefix[code]
				}

				/* Push the final suffix, extend the prefix table, and grow the code
				 * size when the slot no longer fits. A full table keeps its codes.
				 */
				sp.set(code)
				sp.incr()
				if (this.slot < this.topSlot) {
					fc = code
					this.suffix[this.slot] = fc
					this.prefix[this.slot++] = oc
					oc = c
				}
				if (this.slot >= this.topSlot) {
					if (this.currSize < 12) {
						this.topSlot <<= 1
						++this.currSize
					}
				}

				/* Pop the decoded pixels into the output buffer, advancing lines as rows fill. */
				while (sp.getPos() > 0 && bufPtr.getPos() < outLen) {
					sp.decr()
					bufPtr.set(sp.get())
					bufPtr.incr()
					if (--bufCnt === 0) {
						buf = this.NextLine()
						bufPtr = buf
						bufCnt = this.width
					}
				}
				if (bufPtr.getPos() >= outLen) break // corrupt stream emitting more pixels than the declared size
			}
			c = this.getNextCode()
		}
		return [this.pbBitsOutCur.getBuffer(), this.pstm.getPos()]
	}

	private initExp(size: number): void {
		this.currSize = size + 1
		this.topSlot = 1 << this.currSize
		this.clear = 1 << size
		this.ending = this.clear + 1
		this.slot = this.newCodes = this.ending + 1
		this.numAvailBytes = this.numBitsLeft = 0
	}

	private NextLine(): BufferPtr {
		const pbRet = BufferPtr.fromPtr(this.pbBitsOutCur)
		this.pbBitsOutCur.incr(this.cbStride) // step one stride per decoded line, like upstream output += width
		return pbRet
	}

	private getNextCode(): number {
		let ret: number
		if (this.numBitsLeft === 0) {
			if (this.numAvailBytes <= 0) {
				const filled = this.fillBlock()
				if (filled < 0) {
					return filled
				}
			}
			this.b1 = this.pBytes.get()
			this.pBytes.incr()
			this.numBitsLeft = 8
			--this.numAvailBytes
		}

		ret = this.b1 >> (8 - this.numBitsLeft)
		while (this.currSize > this.numBitsLeft) {
			if (this.numAvailBytes <= 0) {
				const filled = this.fillBlock()
				if (filled < 0) {
					return filled
				}
			}
			this.b1 = this.pBytes.get()
			this.pBytes.incr()
			ret |= this.b1 << this.numBitsLeft
			this.numBitsLeft += 8
			--this.numAvailBytes
		}
		this.numBitsLeft -= this.currSize
		ret &= CODE_MASK[this.currSize]
		return ret
	}

	/** Reads the next block into the byte buffer; returns bytes available, or -1 at EOF. */
	private fillBlock(): number {
		this.pBytes = new BufferPtr(this.byteBuff)
		this.numAvailBytes = this.getByte()
		if (this.numAvailBytes < 0) {
			return this.numAvailBytes
		}
		for (let blockIndex = 0; blockIndex < this.numAvailBytes; ++blockIndex) {
			const byteValue = this.getByte()
			if (byteValue < 0) {
				return byteValue
			}
			this.byteBuff[blockIndex] = byteValue
		}
		return this.numAvailBytes
	}

	private getByte(): number {
		return this.pstm.next()
	}
}

/**
 * Simulates a C pointer to some data. Data is never copied,
 * only the pointer is updated.
 */
class BufferPtr {
	private readonly buf: Uint8Array
	private pos: number

	constructor(buf: Uint8Array, pos: number = 0) {
		this.buf = buf
		this.pos = pos
	}

	public static fromPtr(ptr: BufferPtr) {
		return new BufferPtr(ptr.buf, ptr.pos)
	}

	public incr(offset: number = 1) {
		this.pos += offset
	}

	public decr(offset: number = 1) {
		this.pos -= offset
	}

	public get(): number {
		return this.buf[this.pos]
	}

	public next(): number {
		if (this.pos >= this.buf.length) {
			return -1
		}
		return this.buf[this.pos++]
	}

	public set(value: number) {
		this.buf[this.pos] = value
	}

	public getPos(): number {
		return this.pos
	}

	public getBuffer(): Uint8Array {
		return this.buf
	}

	public toString() {
		return `${this.pos}:[ ${this.buf.slice(this.pos).join(', ')} ]`
	}
}
