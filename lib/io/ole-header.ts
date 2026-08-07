// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView, OLE_ID } from './binary-helpers.js'

/** OLE header (512 bytes).
 * @see https://github.com/vpinball/vpinball/blob/master/ole-doc.cpp */
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
		for (let i = 0; i < 8; i++)
			if (OLE_ID[i] !== buf[i])
				throw new Error(
					`Not a valid compound document (bad OLE ID byte ${i}: 0x${OLE_ID[i].toString(16)} !== 0x${buf[i].toString(16)}).`,
				)
		const v = getDataView(buf)
		const h = new Header()
		h.secSize = 1 << v.getInt16(30, true)
		h.shortSecSize = 1 << v.getInt16(32, true)
		h.SATSize = v.getInt32(44, true)
		h.dirSecId = v.getInt32(48, true)
		h.shortStreamMax = v.getInt32(56, true)
		h.SSATSecId = v.getInt32(60, true)
		h.SSATSize = v.getInt32(64, true)
		h.MSATSecId = v.getInt32(68, true)
		h.MSATSize = v.getInt32(72, true)
		h.partialMSAT = Array.from({ length: 109 }, (_, i) => v.getInt32(76 + i * 4, true))
		return h
	}
}
