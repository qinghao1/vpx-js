// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** OLE compound document magic header. */
export const OLE_ID = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** Concatenates Uint8Arrays. */
export function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
	const len = arrays.reduce((n, a) => n + a.length, 0)
	const out = new Uint8Array(len)
	let off = 0
	for (const a of arrays) {
		out.set(a, off)
		off += a.length
	}
	return out
}

export function getDataView(buf: Uint8Array): DataView {
	return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

export const textDecoder = new TextDecoder('utf-8')

/** Decodes a Uint8Array as UTF-8. */
export function decodeUtf8(buf: Uint8Array): string {
	return textDecoder.decode(buf)
}

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true })
const cp1252Decoder = new TextDecoder('windows-1252')

/**
 * Decodes bytes as UTF-8, falling back to CP1252 for legacy ANSI text.
 * @see string_from_utf8_or_cp1252 in vpinball src/core/def.cpp
 */
export function decodeUtf8OrCp1252(buf: Uint8Array): string {
	try {
		return strictUtf8Decoder.decode(buf)
	} catch {
		return cp1252Decoder.decode(buf)
	}
}

/** Reads a little-endian int32 at `off`. */
export function readInt32LE(buf: Uint8Array, off: number): number {
	return getDataView(buf).getInt32(off, true)
}
