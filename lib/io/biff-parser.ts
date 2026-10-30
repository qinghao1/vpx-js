// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { concatUint8Arrays, decodeUtf8, decodeUtf8OrCp1252, getDataView, readInt32LE } from './binary-helpers.js'
import type { ReadResult } from './ole-doc.js'

/** Byte size of a BIFF record header (4-byte size + 4-byte tag); payloads begin here. */
export const BIFF_TAG_HEADER_SIZE = 8

/** BIFF record parser. @see https://github.com/vpinball/vpinball/blob/master/src/utils/BiffReader.cpp */
export class BiffParser {
	/** Creates a streaming BIFF handler. */
	static stream(cb: OnBiffResult, opts: BiffStreamOptions = {}): (r: ReadResult) => Promise<number | null> {
		let nested: OnBiffResultStream<any> | null = null
		let nestedItem: any = null

		return async (result: ReadResult): Promise<number | null> => {
			const data = result.data
			if (data.length < 4) return null

			let len = readInt32LE(data, 0)
			// Upstream BiffReader::ValidateLength flags len<0 or beyond-remaining as
			// m_hasError and fails the load; throw instead of stalling the stream.
			if (len < 4) throw new Error(`Corrupt BIFF record: invalid size ${len}.`)
			if (len > data.length - 4) return -(len + 4)
			const tag = decodeUtf8(data.subarray(4, 8))

			if (opts.nestedTags?.[tag]) {
				nested = opts.nestedTags[tag]
				nestedItem = nested.onStart()
				return len + 4
			}

			if (tag === 'FONT') {
				// FONT size omits its 11+nameLen blob, so total = 8 header + 11 + nameLen.
				if (data.length < 19) return -19
				const nameLen = data[18]!
				const total = 19 + nameLen
				if (total > data.length) return -total
				const fontChunk = data.subarray(8, total)
				const fontFn = nested ? nested.onTag(nestedItem) : cb
				const fontSkip = await fontFn(fontChunk, tag, result.storageOffset + 8, 11 + nameLen)
				return (fontSkip || total - 4) + 4
			}

			const streamed = opts.streamedTags?.includes(tag) ?? false
			if (streamed) {
				// cchar sits at payload offset 4; request more bytes on truncated records.
				if (data.length < 12) return -12
				const cchar = readInt32LE(data, 8)
				// Upstream AsScript fails the load on a short script read; a negative
				// length is always corrupt, so throw instead of stalling the stream.
				if (cchar < 0) throw new Error(`Corrupt BIFF record: invalid CODE length ${cchar}.`)
				len += cchar + 4
			}
			// Self-terminated ranged records (e.g. texture BITS): the declared len
			// covers only the header, so the payload is served from this already-
			// fetched range instead of a second OLE read. Same overrun guard as above.
			const rawHandler = !nested && opts.rawTags?.[tag]
			if (rawHandler) {
				if (len > data.length - 4) return -(len + 4)
				const skip = await rawHandler(data, result.storageOffset)
				return (skip || len) + 4
			}

			const chunk = streamed ? new Uint8Array(0) : data.subarray(8, 8 + len - 4)
			// Streamed CODE carries no payload chunk: offsets skip the extra cchar int.
			const relStart = streamed ? 12 : 8
			const relEnd = streamed ? -8 : -4

			// ENDB terminates a BIFF stream.
			if (tag === 'ENDB') {
				if (nested) {
					nested.onEnd(nestedItem)
					nested = nestedItem = null
					return len + 4
				}
				return null
			}

			const fn = nested ? nested.onTag(nestedItem) : cb
			const skip = await fn(chunk, tag, result.storageOffset + relStart, len + relEnd)
			return (skip || len) + 4
		}
	}

	/** Decompresses a BIFF chunk. */
	static async decompress(buf: Uint8Array): Promise<Uint8Array> {
		if (typeof DecompressionStream !== 'undefined') {
			const ds = new DecompressionStream('deflate')
			const writer = ds.writable.getWriter()
			writer.write(buf as unknown as BufferSource)
			writer.close()
			const chunks: Uint8Array[] = []
			const reader = ds.readable.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				if (value) chunks.push(value)
			}
			return concatUint8Arrays(...chunks)
		}
		const pako = await import('pako')
		const inflate =
			(pako as unknown as { inflate: (data: Uint8Array) => Uint8Array }).inflate ??
			(pako as unknown as { default: { inflate: (data: Uint8Array) => Uint8Array } }).default?.inflate
		if (inflate) {
			const res = inflate(buf)
			return res instanceof Uint8Array ? res : new Uint8Array(res)
		}
		throw new Error('Decompression failed: DecompressionStream unavailable and pako not available')
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

	/** Reads string at offset 4 (UTF-8, legacy CP1252 fallback like upstream). `end` is the payload end index. */
	public getString(buf: Uint8Array, end: number): string {
		return decodeUtf8OrCp1252(buf.subarray(4, end))
	}

	/** Reads UTF-16LE string at offset 4. `end` is the payload end index. */
	public getWideString(buf: Uint8Array, end: number): string {
		return new TextDecoder('utf-16le').decode(buf.subarray(4, end))
	}

	/** Reads int32 at 0. */
	public getInt(buf: Uint8Array): number {
		return getDataView(buf).getInt32(0, true)
	}

	/** Reads float32 at 0 (single precision). */
	public getFloat(buf: Uint8Array): number {
		return getDataView(buf).getFloat32(0, true)
	}

	/** Reads bool (int32 !== 0). */
	public getBool(buf: Uint8Array): boolean {
		return getDataView(buf).getInt32(0, true) !== 0
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
	/**
	 * Self-terminated records served from the fetched range. `range` starts
	 * at the record's tag header (4-byte size + 4-byte tag, so payloads begin
	 * at offset 8); returning 0/undefined falls back to the declared `len`,
	 * and the returned value skips that many bytes plus the 4-byte size.
	 */
	rawTags?: Record<string, (range: Uint8Array, storageOffset: number) => Promise<number>>
}
