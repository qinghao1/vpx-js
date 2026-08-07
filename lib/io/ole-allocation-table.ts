// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView } from './binary-helpers.js'
import type { OleCompoundDoc } from './ole-doc.js'

/** Sector allocation table (SAT/SSAT). */
export class AllocationTable {
	private static SecIdEndOfChain = -2

	private readonly doc: OleCompoundDoc
	private readonly table: number[] = []

	private constructor(doc: OleCompoundDoc, table: number[]) {
		this.doc = doc
		this.table = table
	}

	/** Load the allocation table from raw sector chain. */
	public static async load(doc: OleCompoundDoc, secIds: number[]): Promise<AllocationTable> {
		const header = doc.header
		const table = new Array(secIds.length * (header.secSize / 4))
		const buffer = await doc.readSectors(secIds)
		const view = getDataView(buffer)
		for (let i = 0; i < buffer.length / 4; i++) {
			table[i] = view.getInt32(i * 4, true)
		}
		return new AllocationTable(doc, table)
	}

	/** Follow a chain starting at `startSecId` until end-of-chain. */
	public getSecIdChain(startSecId: number): number[] {
		let secId = startSecId
		const secIds: number[] = []
		while (secId !== AllocationTable.SecIdEndOfChain) {
			secIds.push(secId)
			secId = this.table[secId]
			if (secId === undefined) {
				throw new Error(`Corrupt file: secId ${secIds[secIds.length - 1]} missing in allocation table.`)
			}
		}
		return secIds
	}
}
