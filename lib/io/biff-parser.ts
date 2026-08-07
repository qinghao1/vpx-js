// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { inflate } from 'zlib'
import { f4 } from '../util/float.js'
import { decodeUtf8, getDataView, readInt32LE } from './binary-helpers.js'
import type { ReadResult } from './ole-doc.js'

/** BIFF record parser. @see https://github.com/vpinball/vpinball/blob/master/BiffReader.cpp */
export class BiffParser {
	/** Creates a streaming BIFF handler. */
	static stream(cb: OnBiffResult, opts: BiffStreamOptions = {}): (r: ReadResult) => Promise<number | null> {
		let nested: OnBiffResultStream<any> | null = null
		let nestedItem: any = null

		return async (result: ReadResult): Promise<number | null> => {
			const data = result.data
			if (data.length < 4) return null

			let len = readInt32LE(data, 0)
			if (len > data.length - 4) return -(len + 4)
			const tag = decodeUtf8(data.subarray(4, 8))

			if (opts.nestedTags?.[tag]) {
				nested = opts.nestedTags[tag]
				nestedItem = nested.onStart()
				return len + 4
			}

			let chunk: Uint8Array
			let relStart = 8,
				relEnd = -4
			if (opts.streamedTags?.includes(tag)) {
				len += readInt32LE(data, 8) + 4
				chunk = new Uint8Array(0)
				relStart += 4
				relEnd -= 4
			} else {
				chunk = data.subarray(8, 8 + len - 4)
			}

			if (!tag || tag === 'ENDB' || tag === 'FONT') {
				if (nested) {
					nested.onEnd(nestedItem)
					nested = nestedItem = null
					return len + 4
				}
				return null
			}

			const fn = nested ? nested.onTag(nestedItem) : cb
			const skip = await fn(chunk!, tag, result.storageOffset + relStart, len + relEnd)
			return (skip || len) + 4
		}
	}

	/** Decompresses a BIFF chunk. */
	static async decompress(buf: Uint8Array): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			inflate(buf as unknown as Parameters<typeof inflate>[0], (err: unknown, res: unknown) => {
				if (err) return reject(err as Error)
				resolve(
					res instanceof Uint8Array
						? res
						: new Uint8Array(
								(res as Uint8Array).buffer,
								(res as Uint8Array).byteOffset,
								(res as Uint8Array).byteLength,
							),
				)
			})
		})
	}

	/** Reads a null-terminated UTF-8 string. */
	static parseNullTerminatedString(buf: Uint8Array, max = 0): string {
		let slice = max ? buf.subarray(0, max) : buf
		const idx = slice.indexOf(0x00)
		if (idx >= 0) slice = slice.subarray(0, idx)
		return decodeUtf8(slice)
	}

	/** BGR → RGB. */
	static bgrToRgb(bgr: number): number {
		return ((bgr & 0xff) << 16) + (bgr & 0xff00) + ((bgr & 0xff0000) >> 16)
	}

	/** Reads string at offset 4. */
	public getString(buf: Uint8Array, len: number, dropIfNotAscii = false): string {
		const s = decodeUtf8(buf.subarray(4, len))
		return !dropIfNotAscii || this.isAscii(s) ? s : ''
	}

	/** Reads UTF-16LE string at offset 4. */
	public getWideString(buf: Uint8Array, len: number): string {
		return new TextDecoder('utf-16le').decode(buf.subarray(4, len))
	}

	/** Reads int32 at 0. */
	public getInt(buf: Uint8Array): number {
		return getDataView(buf).getInt32(0, true)
	}

	/** Reads float32 at 0 (single precision). */
	public getFloat(buf: Uint8Array): number {
		return f4(getDataView(buf).getFloat32(0, true))
	}

	/** Reads bool (int32 > 0). */
	public getBool(buf: Uint8Array): boolean {
		return getDataView(buf).getInt32(0, true) > 0
	}

	/** Reads n uint16. */
	protected getUnsignedInt2s(buf: Uint8Array, n: number): number[] {
		const dv = getDataView(buf)
		return Array.from({ length: n }, (_, i) => dv.getUint16(i * 2, true))
	}

	/** Reads n uint32. */
	protected getUnsignedInt4s(buf: Uint8Array, n: number): number[] {
		const dv = getDataView(buf)
		return Array.from({ length: n }, (_, i) => dv.getUint32(i * 4, true))
	}

	private isAscii(s: string): boolean {
		return /^[\x00-\x7F]*$/.test(s)
	}
}

/** BIFF tag handler. */
export type OnBiffResult = (buf: Uint8Array, tag: string, offset: number, len: number) => Promise<number>

/** Nested BIFF stream handler. */
export interface OnBiffResultStream<T> {
	onStart: () => T
	onTag: (item: T) => OnBiffResult
	onEnd: (item: T) => void
}

/** Options for BiffParser.stream. */
export interface BiffStreamOptions {
	streamedTags?: string[]
	nestedTags?: Record<string, OnBiffResultStream<any>>
}
