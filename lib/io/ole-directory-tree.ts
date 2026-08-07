// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getDataView } from './binary-helpers.js'
import type { OleCompoundDoc } from './ole-doc.js'

/** Entry in the OLE directory tree. */
export interface StorageEntry {
	name: string
	type: number
	nodeColor: number
	left: number
	right: number
	storageDirId: number
	secId: number
	size: number
	storages: { [key: string]: StorageEntry }
	streams: { [key: string]: StorageEntry }
}

/** OLE directory tree. */
export class DirectoryTree {
	private static EntryTypeEmpty = 0
	private static EntryTypeStorage = 1
	private static EntryTypeStream = 2
	private static EntryTypeRoot = 5
	private static NodeColorRed = 0
	private static NodeColorBlack = 1
	private static Leaf = -1

	public readonly root: StorageEntry
	private readonly doc: OleCompoundDoc
	private readonly entries: StorageEntry[]

	public static async load(doc: OleCompoundDoc, secIds: number[]): Promise<DirectoryTree> {
		const buffer = await doc.readSectors(secIds)
		const count = buffer.length / 128
		const entries = new Array<StorageEntry>(count)
		const view = getDataView(buffer)
		const decoder = new TextDecoder('utf-16le')
		for (let i = 0; i < count; i++) {
			const offset = i * 128
			const nameLength = Math.max(view.getInt16(64 + offset, true) - 2, 0)
			const nameBytes = buffer.subarray(offset, offset + nameLength)
			entries[i] = {
				name: decoder.decode(nameBytes),
				type: view.getInt8(66 + offset),
				nodeColor: view.getInt8(67 + offset),
				left: view.getInt32(68 + offset, true),
				right: view.getInt32(72 + offset, true),
				storageDirId: view.getInt32(76 + offset, true),
				secId: view.getInt32(116 + offset, true),
				size: view.getInt32(120 + offset, true),
				storages: {},
				streams: {},
			}
		}
		const root = entries.find((e) => e.type === DirectoryTree.EntryTypeRoot)
		if (!root) throw new Error('No root entry found in directory tree.')
		return new DirectoryTree(doc, root, entries)
	}

	private constructor(doc: OleCompoundDoc, root: StorageEntry, entries: StorageEntry[]) {
		this.doc = doc
		this.root = root
		this.entries = entries
		this.buildHierarchy(this.root)
	}

	private buildHierarchy(entry: StorageEntry): void {
		const childIds = this.getChildIds(entry)
		entry.storages = {}
		entry.streams = {}
		for (const id of childIds) {
			const child = this.entries[id]
			if (child.type === DirectoryTree.EntryTypeStorage) entry.storages[child.name] = child
			if (child.type === DirectoryTree.EntryTypeStream) entry.streams[child.name] = child
		}
		for (const child of Object.values(entry.storages)) this.buildHierarchy(child)
	}

	private getChildIds(entry: StorageEntry): number[] {
		if (entry.storageDirId <= -1) return []
		const ids: number[] = [entry.storageDirId]
		return this.visit(this.entries[entry.storageDirId], ids)
	}

	private visit(entry: StorageEntry, ids: number[] = []): number[] {
		if (entry.left !== DirectoryTree.Leaf) {
			ids.push(entry.left)
			this.visit(this.entries[entry.left], ids)
		}
		if (entry.right !== DirectoryTree.Leaf) {
			ids.push(entry.right)
			this.visit(this.entries[entry.right], ids)
		}
		return ids
	}
}
