// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BufferGeometry, Material, Object3D } from '../refs.node.js'
import { logger } from '../util/logger.js'

/** Return true if arrays are shallow-equal. */
export function equalArray(a: unknown[], b: unknown[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Convert string to Buffer, replacing multi-byte chars with space. */
export function stringToBuffer(text: string): Buffer {
	const array = Buffer.alloc(text.length)
	for (let i = 0; i < text.length; i++) {
		const v = text.charCodeAt(i)
		array[i] = v > 0xff ? 0x20 : v
	}
	return array
}

/** Pad buffer size to next 4-byte boundary. */
export function getPaddedBufferSize(size: number): number {
	return Math.ceil(size / 4) * 4
}

/** Return buffer padded to 4-byte boundary. */
export function getPaddedArrayBuffer(buf: Buffer, pad = 0x0): Buffer {
	const padded = getPaddedBufferSize(buf.byteLength)
	if (padded === buf.byteLength) return buf
	return Buffer.concat([buf, Buffer.alloc(padded - buf.byteLength, pad)])
}

/** Serialize `object.userData` safely. */
export function serializeUserData(object: Object3D | Material | BufferGeometry): Record<string, unknown> {
	try {
		return JSON.parse(JSON.stringify(object.userData))
	} catch (err) {
		logger().warn(
			`[GLTFExporter.serializeUserData] userData of '${object.name}' won't be serialized: ${(err as Error).message}`,
		)
		return {}
	}
}
