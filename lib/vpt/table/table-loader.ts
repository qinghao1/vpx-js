// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const textDecoder = new TextDecoder()

import { type IBinaryReader, OleCompoundDoc, type Storage } from '../../io/ole-doc.js'
import { logger, progress } from '../../util/logger.js'
import { Collection } from '../collection/collection.js'
import type { Item } from '../item.js'
import { ItemData } from '../item-data.js'
import { ITEM_KEYS, ITEM_REGISTRY, loadItemByType } from '../item-registry.js'
import { Texture } from '../texture.js'
import type { TableLoadOptions } from './table.js'
import { TableData } from './table-data.js'

export class TableLoader {
	private doc!: OleCompoundDoc

	async load(reader: IBinaryReader, opts: TableLoadOptions = {}): Promise<LoadedTable> {
		progress().start('table.load', 'Loading VPX file')
		const then = Date.now()
		this.doc = await OleCompoundDoc.load(reader)
		try {
			const loadedTable: LoadedTable = { items: {} }
			if (opts.loadTableScript || opts.tableDataOnly || !opts.tableInfoOnly) {
				const gameStorage = this.doc.storage('GameStg')
				loadedTable.data = await TableData.fromStorage(gameStorage, 'GameData')
				if (!opts.tableDataOnly) {
					await this.loadGameItems(loadedTable, gameStorage, loadedTable.data.numGameItems, opts)
					await this.loadTextures(loadedTable, gameStorage, loadedTable.data.numTextures)
					await this.loadCollections(loadedTable, gameStorage, loadedTable.data.numCollections)
				}
				if (opts.loadTableScript) {
					const script = await gameStorage.read('GameData', loadedTable.data.scriptPos, loadedTable.data.scriptLen)
					loadedTable.tableScript = textDecoder.decode(script)
					if (loadedTable.tableScript.endsWith('ENDB')) {
						loadedTable.tableScript = loadedTable.tableScript.slice(0, -8)
					}
				}
			}
			if (opts.tableInfoOnly || !opts.tableDataOnly) {
				await this.loadTableInfo(loadedTable)
			}
			logger().info('[Table.load] Table loaded in %sms.', Date.now() - then)
			return loadedTable
		} finally {
			await this.doc.close()
			progress().end('table.load')
		}
	}

	async streamStorage<T>(name: string, streamer: (stg: Storage) => Promise<T>): Promise<T> {
		try {
			await this.doc.reopen()
			return await streamer(this.doc.storage(name))
		} finally {
			await this.doc.close()
		}
	}

	private async loadGameItems(
		loadedTable: LoadedTable,
		storage: Storage,
		numItems: number,
		opts: TableLoadOptions,
	): Promise<Record<string, number>> {
		const stats: Record<string, number> = {}

		for (const key of ITEM_KEYS) (loadedTable as any)[key] = []

		progress().show('Loading game items')
		for (let i = 0; i < numItems; i++) {
			const itemName = `GameItem${i}`
			const itemData = await storage.read(itemName, 0, 4)
			const itemType = new DataView(itemData.buffer, itemData.byteOffset, itemData.byteLength).getInt32(0, true)
			const item = await this.loadItem(loadedTable, storage, itemName, itemType, opts)
			if (item) {
				progress().details(item.getName())
				loadedTable.items[item.getName()] = item
			}
			const typeName = ItemData.getType(itemType)
			stats[typeName] = (stats[typeName] ?? 0) + 1
		}
		return stats
	}

	private async loadItem(
		loadedTable: LoadedTable,
		storage: Storage,
		itemName: string,
		itemType: number,
		opts: TableLoadOptions,
	): Promise<Item<ItemData> | null> {
		const item = await loadItemByType(storage, itemName, itemType, opts)
		if (!item) return null

		const key = ITEM_REGISTRY[itemType]?.key
		if (!key) return item

		// Textbox/Timer are invisible by default; respect loadInvisibleItems
		if ((key === 'textBoxes' || key === 'timers') && !opts.loadInvisibleItems) {
			return item
		}
		;(loadedTable as any)[key].push(item)
		return item
	}

	private async loadTextures(loadedTable: LoadedTable, storage: Storage, numItems: number): Promise<void> {
		progress().show('Loading textures')
		loadedTable.textures = []
		for (let i = 0; i < numItems; i++) {
			const texture = await Texture.fromStorage(storage, `Image${i}`)
			loadedTable.textures.push(texture)
			progress().details(texture.getName())
		}
	}

	private async loadTableInfo(loadedTable: LoadedTable): Promise<void> {
		const tableInfoStorage = this.doc.storage('TableInfo')
		loadedTable.info = {}
		for (const key of tableInfoStorage.getStreams()) {
			const data = await tableInfoStorage.read(key)
			if (data) loadedTable.info[key] = textDecoder.decode(data).replace(/\0/g, '')
		}
	}

	private async loadCollections(loadedTable: LoadedTable, storage: Storage, numItems: number): Promise<void> {
		loadedTable.collections = []
		for (let i = 0; i < numItems; i++) {
			const collection = await Collection.fromStorage(storage, `Collection${i}`)
			loadedTable.collections.push(collection)
			loadedTable.items[collection.getName()] = collection
		}
	}
}

export interface LoadedTable {
	data?: TableData
	info?: Record<string, string>
	items: Record<string, Item<ItemData>>
	tableScript?: string
	textures?: Texture[]
	collections?: Collection[]
	surfaces?: import('../surface/surface.js').Surface[]
	primitives?: import('../primitive/primitive.js').Primitive[]
	rubbers?: import('../rubber/rubber.js').Rubber[]
	flippers?: import('../flipper/flipper.js').Flipper[]
	flashers?: import('../flasher/flasher.js').Flasher[]
	bumpers?: import('../bumper/bumper.js').Bumper[]
	ramps?: import('../ramp/ramp.js').Ramp[]
	lights?: import('../light/light.js').Light[]
	hitTargets?: import('../hit-target/hit-target.js').HitTarget[]
	gates?: import('../gate/gate.js').Gate[]
	kickers?: import('../kicker/kicker.js').Kicker[]
	triggers?: import('../trigger/trigger.js').Trigger[]
	spinners?: import('../spinner/spinner.js').Spinner[]
	plungers?: import('../plunger/plunger.js').Plunger[]
	textBoxes?: import('../textbox/textbox.js').Textbox[]
	decals?: import('../decal/decal.js').Decal[]
	lightSeqs?: import('../lightseq/lightseq.js').LightSeq[]
	dispReels?: import('../dispreel/dispreel.js').DispReel[]
	timers?: import('../timer/timer.js').Timer[]
}
