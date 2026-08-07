// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { inflate } from 'zlib'
import { f4 } from '../math/float.js'
import { decodeUtf8, getDataView, readInt32LE } from './binary-helpers.js'
import type { ReadResult } from './ole-doc.js'

/** Parser for BIFF records used in VPX files. */
export class BiffParser {
	/**
	 * Creates a streaming BIFF handler.
	 * @param callback called for each tag
	 * @param opts optional streamed/nested tag handling
	 * @returns handler that consumes `ReadResult` chunks
	 */
	static stream(callback: OnBiffResult, opts: BiffStreamOptions = {}): (result: ReadResult) => Promise<number | null> {
		let nested: OnBiffResultStream<any> | null = null
		let nestedItem: any = null
		return async (result: ReadResult): Promise<number | null> => {
			const data = result.data
			if (data.length < 4) return null

			let len = readInt32LE(data, 0)
			if (len > data.length - 4) return -(len + 4)

			const tag = decodeUtf8(data.subarray(4, 8))
			let relStartPos = 8
			let relEndPos = -4
			let dataResult: Uint8Array

			if (opts.nestedTags?.[tag]) {
				nested = opts.nestedTags[tag]
				nestedItem = nested.onStart()
				return len + 4
			}

			if (opts.streamedTags?.includes(tag)) {
				len += readInt32LE(data, 8) + 4
				dataResult = new Uint8Array(0)
				relStartPos += 4
				relEndPos -= 4
			} else {
				dataResult = data.subarray(8, 8 + len - 4)
			}

			if (!tag || tag === 'ENDB' || tag === 'FONT') {
				if (nested) {
					nested.onEnd(nestedItem)
					nestedItem = null
					nested = null
					return len + 4
				}
				return null
			}
			const cb = nested ? nested.onTag(nestedItem) : callback
			const skip = await cb(dataResult!, tag, result.storageOffset + relStartPos, len + relEndPos)
			return (skip || len) + 4
		}
	}

	/** Decompresses a BIFF chunk via zlib. */
	static async decompress(buffer: Uint8Array): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			inflate(buffer as any, (err: any, result: any) => {
				/* istanbul ignore if */
				if (err) return reject(err)
				resolve(
					result instanceof Uint8Array ? result : new Uint8Array(result.buffer, result.byteOffset, result.byteLength),
				)
			})
		})
	}

	/** Reads a null-terminated string, optionally limited to `maxLength`. */
	static parseNullTerminatedString(buffer: Uint8Array, maxLength = 0): string {
		let slice = maxLength ? buffer.subarray(0, maxLength) : buffer
		const nullIdx = slice.indexOf(0x00)
		if (nullIdx >= 0) slice = slice.subarray(0, nullIdx)
		return decodeUtf8(slice)
	}

	/** Converts BGR to RGB. */
	static bgrToRgb(bgr: number): number {
		const r = (bgr & 0xff) << 16
		const g = bgr & 0xff00
		const b = (bgr & 0xff0000) >> 16
		return r + g + b
	}

	protected getString(buffer: Uint8Array, len: number, dropIfNotAscii = false): string {
		const str = decodeUtf8(buffer.subarray(4, len))
		return !dropIfNotAscii || this.isAscii(str) ? str : ''
	}

	protected getWideString(buffer: Uint8Array, len: number): string {
		return new TextDecoder('utf-16le').decode(buffer.subarray(4, len))
	}

	protected getInt(buffer: Uint8Array): number {
		return getDataView(buffer).getInt32(0, true)
	}
	protected getFloat(buffer: Uint8Array): number {
		return f4(getDataView(buffer).getFloat32(0, true))
	}
	protected getBool(buffer: Uint8Array): boolean {
		return getDataView(buffer).getInt32(0, true) > 0
	}

	protected getUnsignedInt2s(buffer: Uint8Array, num: number): number[] {
		const view = getDataView(buffer)
		return Array.from({ length: num }, (_, i) => view.getUint16(i * 2, true))
	}

	protected getUnsignedInt4s(buffer: Uint8Array, num: number): number[] {
		const view = getDataView(buffer)
		return Array.from({ length: num }, (_, i) => view.getUint32(i * 4, true))
	}

	private isAscii(str: string): boolean {
		return /^[\x00-\x7F]*$/.test(str)
	}
}

export type OnBiffResult = (buffer: Uint8Array, tag: string, offset: number, len: number) => Promise<number>

export interface OnBiffResultStream<T> {
	onStart: () => T
	onTag: (item: T) => OnBiffResult
	onEnd: (item: T) => void
}

export interface BiffStreamOptions {
	streamedTags?: string[]
	nestedTags?: Record<string, OnBiffResultStream<any>>
}
