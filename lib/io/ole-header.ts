// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView, OLE_ID } from './binary-helpers.js'

/** OLE header (512 bytes).
 * @see https://github.com/vpinball/vpinball/blob/master/third-party/include/pole/pole.cpp */
export class Header {
	public secSize!: number
	public shortSecSize!: number
	public SATSize!: number
	public dirSecId!: number
	public shortStreamMax!: number
	public SSATSecId!: number
	public SSATSize!: number
	public MSATSecId!: number
	public MSATSize!: number
	public partialMSAT: number[] = []

	private constructor() {}

	public static load(buf: Uint8Array): Header {
		if (buf.length < 512) throw new Error('Not a valid compound document (truncated header).')
		for (let i = 0; i < 8; i++)
			if (OLE_ID[i] !== buf[i])
				throw new Error(
					`Not a valid compound document (bad OLE ID byte ${i}: 0x${OLE_ID[i].toString(16)} !== 0x${buf[i].toString(16)}).`,
				)
		const v = getDataView(buf)
		const secShift = v.getUint16(30, true) // 0x1E
		if (secShift !== 9 && secShift !== 12)
			throw new Error(`Not a valid compound document (invalid sector size shift ${secShift}).`)
		const shortShift = v.getUint16(32, true) // 0x20
		if (shortShift !== 6)
			throw new Error(`Not a valid compound document (invalid mini sector size shift ${shortShift}).`)
		const h = new Header()
		h.secSize = 1 << secShift
		h.shortSecSize = 1 << shortShift
		h.SATSize = v.getInt32(44, true) // 0x2C
		h.dirSecId = v.getInt32(48, true) // 0x30
		h.shortStreamMax = v.getInt32(56, true) // 0x38
		h.SSATSecId = v.getInt32(60, true) // 0x3C
		h.SSATSize = v.getInt32(64, true) // 0x40
		h.MSATSecId = v.getInt32(68, true) // 0x44
		h.MSATSize = v.getInt32(72, true) // 0x48
		// pole's Header::valid rejects an empty FAT; zero-size SSAT/MSAT mean absent.
		if (h.SATSize <= 0 || h.SSATSize < 0 || h.MSATSize < 0)
			throw new Error('Not a valid compound document (invalid allocation table size).')
		h.partialMSAT = Array.from({ length: 109 }, (_, i) => v.getInt32(76 + i * 4, true)) // 0x4C
		return h
	}
}
