// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView } from './binary-helpers.js'
import type { OleCompoundDoc } from './ole-doc.js'

export interface StorageEntry {
	name: string
	type: number
	nodeColor: number
	left: number
	right: number
	storageDirId: number
	secId: number
	size: number
	storages: Record<string, StorageEntry>
	streams: Record<string, StorageEntry>
}

/** OLE directory tree.
 * @see https://github.com/vpinball/vpinball/blob/master/ole-doc.cpp */
export class DirectoryTree {
	private static EntryTypeStorage = 1
	private static EntryTypeStream = 2
	private static EntryTypeRoot = 5
	private static Leaf = -1

	public readonly root: StorageEntry

	public static async load(doc: OleCompoundDoc, secIds: number[]): Promise<DirectoryTree> {
		const buf = await doc.readSectors(secIds)
		const view = getDataView(buf)
		const decoder = new TextDecoder('utf-16le')
		const entries: StorageEntry[] = []
		for (let off = 0; off < buf.length; off += 128) {
			const len = Math.max(view.getInt16(off + 64, true) - 2, 0)
			entries.push({
				name: decoder.decode(buf.subarray(off, off + len)),
				type: view.getInt8(off + 66),
				nodeColor: view.getInt8(off + 67),
				left: view.getInt32(off + 68, true),
				right: view.getInt32(off + 72, true),
				storageDirId: view.getInt32(off + 76, true),
				secId: view.getInt32(off + 116, true),
				size: view.getUint32(off + 120, true) + view.getUint32(off + 124, true) * 2 ** 32,
				storages: {},
				streams: {},
			})
		}
		const root = entries.find(e => e.type === DirectoryTree.EntryTypeRoot)
		if (!root) throw new Error('No root entry found.')
		return new DirectoryTree(doc, root, entries)
	}

	private constructor(
		readonly _doc: OleCompoundDoc,
		root: StorageEntry,
		private readonly entries: StorageEntry[],
	) {
		this.root = root
		this.buildHierarchy(root)
	}

	private buildHierarchy(e: StorageEntry): void {
		const ids = this.getChildIds(e)
		e.storages = {}
		e.streams = {}
		for (const id of ids) {
			const c = this.entries[id]
			if (c.type === DirectoryTree.EntryTypeStorage) e.storages[c.name] = c
			if (c.type === DirectoryTree.EntryTypeStream) e.streams[c.name] = c
		}
		for (const c of Object.values(e.storages)) this.buildHierarchy(c)
	}

	private getChildIds(e: StorageEntry): number[] {
		if (e.storageDirId <= -1) return []
		return this.visit(this.entries[e.storageDirId], [e.storageDirId])
	}

	private visit(e: StorageEntry, ids: number[] = []): number[] {
		if (e.left !== DirectoryTree.Leaf) {
			ids.push(e.left)
			this.visit(this.entries[e.left], ids)
		}
		if (e.right !== DirectoryTree.Leaf) {
			ids.push(e.right)
			this.visit(this.entries[e.right], ids)
		}
		return ids
	}
}
