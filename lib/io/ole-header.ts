// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView, OLE_ID } from './binary-helpers.js'

/** OLE compound document header (512 bytes). */
export class Header {
	public secSize!: number
	public SATSize!: number
	public MSATSize!: number
	public MSATSecId!: number
	public shortSecSize!: number
	public shortStreamMax!: number
	public SSATSize!: number
	public SSATSecId!: number
	public dirSecId!: number
	public partialMSAT: number[] = []

	private readonly oleId: Uint8Array = OLE_ID

	private constructor() {}

	/** Parse and validate the 512-byte OLE header. */
	public static load(buffer: Uint8Array): Header {
		const header = new Header()
		for (let i = 0; i < 8; i++) {
			if (header.oleId[i] !== buffer[i]) {
				throw new Error(
					`Not a valid compound document (bad OLE ID byte ${i}: 0x${header.oleId[i].toString(16)} !== 0x${buffer[i].toString(16)}).`,
				)
			}
		}
		const view = getDataView(buffer)
		header.secSize = 1 << view.getInt16(30, true)
		header.shortSecSize = 1 << view.getInt16(32, true)
		header.SATSize = view.getInt32(44, true)
		header.dirSecId = view.getInt32(48, true)
		header.shortStreamMax = view.getInt32(56, true)
		header.SSATSecId = view.getInt32(60, true)
		header.SSATSize = view.getInt32(64, true)
		header.MSATSecId = view.getInt32(68, true)
		header.MSATSize = view.getInt32(72, true)
		header.partialMSAT = new Array(109)
		for (let i = 0; i < 109; i++) {
			header.partialMSAT[i] = view.getInt32(76 + i * 4, true)
		}
		return header
	}
}
