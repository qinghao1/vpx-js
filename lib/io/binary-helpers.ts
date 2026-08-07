// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** OLE compound document magic header. */
export const OLE_ID = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** Concatenates two Uint8Arrays. */
export function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
	const c = new Uint8Array(a.length + b.length)
	c.set(a, 0)
	c.set(b, a.length)
	return c
}

/** Creates a DataView for the given Uint8Array. */
export function getDataView(buf: Uint8Array): DataView {
	return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

export const textDecoder = new TextDecoder('utf-8')

/** Decodes a Uint8Array as UTF-8. */
export function decodeUtf8(buf: Uint8Array): string {
	return textDecoder.decode(buf)
}

/** Reads a little-endian int32 at `off`. */
export function readInt32LE(buf: Uint8Array, off: number): number {
	return getDataView(buf).getInt32(off, true)
}

/** Reads a little-endian uint16 at `off`. */
export function readUInt16LE(buf: Uint8Array, off: number): number {
	return getDataView(buf).getUint16(off, true)
}

/** Reads a little-endian uint32 at `off`. */
export function readUInt32LE(buf: Uint8Array, off: number): number {
	return getDataView(buf).getUint32(off, true)
}

/** Reads a little-endian float32 at `off`. */
export function readFloatLE(buf: Uint8Array, off: number): number {
	return getDataView(buf).getFloat32(off, true)
}
