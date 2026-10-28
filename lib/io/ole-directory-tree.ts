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
	/** False for unknown types and empty names, like pole's DirEntry::valid: skipped, never filed. */
	valid: boolean
	storages: Record<string, StorageEntry>
	streams: Record<string, StorageEntry>
}

/** OLE directory tree.
 * @see https://github.com/vpinball/vpinball/blob/master/third-party/include/pole/pole.cpp */
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
			const rawNameLen = view.getUint16(off + 64, true)
			const nameBytes = Math.min(rawNameLen, 64) & ~1
			const rawName = decoder.decode(buf.subarray(off, off + nameBytes))
			const nul = rawName.indexOf('\0')
			const type = view.getInt8(off + 66)
			entries.push({
				name: nul < 0 ? rawName : rawName.slice(0, nul),
				type,
				valid:
					(type === DirectoryTree.EntryTypeStorage ||
						type === DirectoryTree.EntryTypeStream ||
						type === DirectoryTree.EntryTypeRoot) &&
					rawNameLen >= 1,
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
		const root = entries.find(e => e.type === DirectoryTree.EntryTypeRoot && e.valid)
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

	private buildHierarchy(root: StorageEntry): void {
		// Iterative DFS: a corrupt file can nest storages deeper than the call
		// stack allows, and pole walks siblings iteratively and bounded too.
		const active = new Set<StorageEntry>()
		// null = not yet expanded; [] = expanded leaf. A drained ([]) frame
		// must pop, never re-expand, or it refills and loops forever.
		const stack: Array<{ entry: StorageEntry; children: StorageEntry[] | null }> = [{ entry: root, children: null }]
		active.add(root)
		while (stack.length > 0) {
			const frame = stack[stack.length - 1]!
			if (frame.children === null) {
				const ids = this.getChildIds(frame.entry)
				frame.entry.storages = {}
				frame.entry.streams = {}
				for (const id of ids) {
					const child = this.entries[id]
					if (!child.valid) continue
					if (child.type === DirectoryTree.EntryTypeStorage) frame.entry.storages[child.name] = child
					if (child.type === DirectoryTree.EntryTypeStream) frame.entry.streams[child.name] = child
				}
				frame.children = Object.values(frame.entry.storages)
			}
			const child = frame.children.pop()
			if (!child) {
				active.delete(frame.entry)
				stack.pop()
				continue
			}
			if (active.has(child)) throw new Error('Corrupt file: cycle detected in directory storage hierarchy.')
			active.add(child)
			stack.push({ entry: child, children: null })
		}
	}

	private getChildIds(entry: StorageEntry): number[] {
		if (entry.storageDirId === DirectoryTree.Leaf) return []
		this.assertIndex(entry.storageDirId)
		// Iterative in-order BST walk matching pole's dirtree_find_siblings
		// (left, self, right): each index is pushed once, so the walk is
		// bounded by the entry count and cannot recurse on a crafted deep
		// chain. In-order filing decides the last-wins winner for duplicate
		// child names, so the order must match upstream, not pre-order.
		const ids: number[] = []
		const seen = new Set<number>()
		const stack: number[] = []
		let id: number | undefined = entry.storageDirId
		while (stack.length > 0 || id !== undefined) {
			while (id !== undefined) {
				if (id === DirectoryTree.Leaf) break
				this.assertIndex(id)
				if (seen.has(id)) throw new Error(`Corrupt file: cycle detected at directory index ${id}.`)
				seen.add(id)
				stack.push(id)
				id = this.entries[id].left
			}
			if (stack.length === 0) break
			const node = stack.pop()!
			ids.push(node)
			const right = this.entries[node].right
			id = right === DirectoryTree.Leaf ? undefined : right
		}
		return ids
	}

	private assertIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.entries.length)
			throw new Error(`Corrupt file: directory index ${index} out of range.`)
	}
}
