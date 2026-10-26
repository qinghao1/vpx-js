// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView } from './binary-helpers.js'
import type { OleCompoundDoc } from './ole-doc.js'

/** Sector allocation table (SAT/SSAT).
 * @see https://github.com/vpinball/vpinball/blob/master/ole-doc.cpp */
export class AllocationTable {
	private static SecIdEndOfChain = -2

	private constructor(
		readonly _doc: OleCompoundDoc,
		private readonly table: number[],
	) {}

	public static async load(doc: OleCompoundDoc, secIds: number[]): Promise<AllocationTable> {
		const buf = await doc.readSectors(secIds)
		const view = getDataView(buf)
		const table = Array.from({ length: buf.length / 4 }, (_, i) => view.getInt32(i * 4, true))
		return new AllocationTable(doc, table)
	}

	public getSecIdChain(start: number): number[] {
		const ids: number[] = []
		const seen = new Set<number>()
		let id = start
		while (id !== AllocationTable.SecIdEndOfChain) {
			if (seen.has(id)) throw new Error(`Corrupt file: cycle detected at secId ${id} in allocation table.`)
			seen.add(id)
			ids.push(id)
			const next = this.table[id]
			if (next === undefined) throw new Error(`Corrupt file: secId ${id} missing in allocation table.`)
			id = next
		}
		return ids
	}
}
