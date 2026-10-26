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
			// Name length is bytes incl. terminator in a 64-byte field; clamp it
			// and stop at the first NUL, like pole's DirTree::load.
			const nameBytes = Math.min(view.getUint16(off + 64, true), 64) & ~1
			const rawName = decoder.decode(buf.subarray(off, off + nameBytes))
			const nul = rawName.indexOf('\0')
			entries.push({
				name: nul < 0 ? rawName : rawName.slice(0, nul),
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

	private buildHierarchy(entry: StorageEntry, seen: Set<StorageEntry> = new Set()): void {
		if (seen.has(entry)) throw new Error('Corrupt file: cycle detected in directory storage hierarchy.')
		seen.add(entry)
		const ids = this.getChildIds(entry)
		entry.storages = {}
		entry.streams = {}
		for (const id of ids) {
			const child = this.entries[id]
			if (child.type === DirectoryTree.EntryTypeStorage) entry.storages[child.name] = child
			if (child.type === DirectoryTree.EntryTypeStream) entry.streams[child.name] = child
		}
		for (const child of Object.values(entry.storages)) this.buildHierarchy(child, seen)
	}

	private getChildIds(entry: StorageEntry): number[] {
		if (entry.storageDirId <= -1) return []
		this.assertIndex(entry.storageDirId)
		return this.visit(this.entries[entry.storageDirId], [entry.storageDirId], new Set([entry.storageDirId]))
	}

	private visit(entry: StorageEntry, ids: number[], seen: Set<number>): number[] {
		for (const next of [entry.left, entry.right]) {
			if (next === DirectoryTree.Leaf) continue
			this.assertIndex(next)
			if (seen.has(next)) throw new Error(`Corrupt file: cycle detected at directory index ${next}.`)
			seen.add(next)
			ids.push(next)
			this.visit(this.entries[next], ids, seen)
		}
		return ids
	}

	private assertIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.entries.length)
			throw new Error(`Corrupt file: directory index ${index} out of range.`)
	}
}
