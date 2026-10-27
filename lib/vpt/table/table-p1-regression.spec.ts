import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BinaryReader } from '../../io/binary-reader.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { type ILogger, Logger } from '../../util/logger.js'
import { Table } from './table.js'
import { TableData } from './table-data.js'

const TEXTURE_FIXTURE = path.resolve('test/fixtures/table-texture.vpx')
const DECAL_FIXTURE = path.resolve('test/fixtures/table-decal.vpx')
const EMPTY_FIXTURE = path.resolve('test/fixtures/table-empty.vpx')

function bytesOf(fixture: string): Uint8Array {
	return new Uint8Array(readFileSync(fixture))
}

function record(tag: string, payload: Uint8Array): Uint8Array {
	// BIFF length prefix covers the 4 tag bytes plus the payload.
	const out = new Uint8Array(8 + payload.length)
	new DataView(out.buffer).setInt32(0, payload.length + 4, true)
	for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i)
	out.set(payload, 8)
	return out
}

function intRecord(tag: string, value: number): Uint8Array {
	const payload = new Uint8Array(4)
	new DataView(payload.buffer).setInt32(0, value, true)
	return record(tag, payload)
}

function storageOf(...records: Uint8Array[]): Storage {
	const total = records.reduce((n, r) => n + r.length, 0)
	const blob = new Uint8Array(total)
	let at = 0
	for (const r of records) {
		blob.set(r, at)
		at += r.length
	}
	return {
		async streamFiltered(
			_name: string,
			_offset: number,
			next: (result: ReadResult) => Promise<number | null>,
		): Promise<void> {
			let pos = 0
			while (pos < blob.length) {
				const consumed = await next({ data: blob.subarray(pos), storageOffset: pos })
				if (consumed === null || consumed <= 0) break
				pos += consumed
			}
		},
	} as unknown as Storage
}

const warnings: string[] = []
const originalLogger = Logger.logger()

function captureWarnings(): void {
	warnings.length = 0
	const noop = () => {}
	Logger.setLogger({
		wtf: noop,
		error: noop,
		warn: (f: string) => warnings.push(f),
		info: noop,
		debug: noop,
	} as ILogger)
}

afterEach(() => {
	Logger.setLogger(originalLogger)
})

describe('Table P1 load regressions', () => {
	it('keeps tableInfoOnly authoritative through Table.load defaults (no GameStg, no script)', async () => {
		const table = await Table.load(new BinaryReader(bytesOf(TEXTURE_FIXTURE)), { tableInfoOnly: true })
		expect(table.info?.TableName).toBe('Table Name')
		expect(table.data).toBeUndefined()
		expect(table.tableScript).toBeUndefined()
		expect(Object.keys(table.items)).toHaveLength(0)
	})

	it('still loads the script by default', async () => {
		const table = await Table.load(new BinaryReader(bytesOf(TEXTURE_FIXTURE)))
		expect(table.data).toBeDefined()
		expect(table.tableScript).toContain('Option Explicit')
	})

	it('still opts into script+info with explicit tableInfoOnly and loadTableScript', async () => {
		const table = await Table.load(new BinaryReader(bytesOf(TEXTURE_FIXTURE)), {
			tableInfoOnly: true,
			loadTableScript: true,
		})
		expect(table.info?.TableName).toBe('Table Name')
		expect(table.tableScript).toContain('Option Explicit')
	})

	it('consumes BTRA/BTST without storing file values on the table', async () => {
		const data = await TableData.fromStorage(storageOf(intRecord('BTRA', 1), intRecord('BTST', 75)), 'GameData')
		expect(data.useTrailForBalls).toBeUndefined()
		expect(data.ballTrailStrength).toBeUndefined()
	})

	it('warns that loaded decals are not rendered instead of dropping them silently', async () => {
		captureWarnings()
		const table = await Table.load(new BinaryReader(bytesOf(DECAL_FIXTURE)))
		expect(Object.keys(table.decals)).not.toHaveLength(0)
		const stubApi = {
			preloadTextures: async () => {},
			createParentNode: (name: string) => ({ name, children: [] as unknown[] }),
			transformScene: () => {},
			addChildToParent: (parent: any, child: any) => parent.children.push(child),
			findInGroup: () => undefined,
			createObjectFromRenderable: () => ({}) as any,
			createPointLight: () => ({}) as any,
		}
		await table.generateTableNode(stubApi as any, {
			preloadTextures: false,
			exportPlayfield: false,
			exportPrimitives: false,
			exportRubbers: false,
			exportSurfaces: false,
			exportFlippers: false,
			exportBumpers: false,
			exportRamps: false,
			exportLightBulbs: false,
			exportLightBulbLights: false,
			exportPlayfieldLights: false,
			exportHitTargets: false,
			exportGates: false,
			exportKickers: false,
			exportTriggers: false,
			exportSpinners: false,
			exportPlungers: false,
		})
		expect(warnings.some(w => /decal/i.test(w))).toBe(true)
	})

	it('resolves textures case-insensitively like materials', async () => {
		const table = await Table.load(new BinaryReader(bytesOf(TEXTURE_FIXTURE)))
		expect(table.getTexture('TEST_PATTERN_PNG')?.getName()).toBe('test_pattern_png')
		expect(table.getTexture('Test_Pattern_Png')).toBe(table.getTexture('test_pattern_png'))
		expect(table.getTexture('no-such-texture')).toBeUndefined()
		expect(table.getTexture()).toBeUndefined()
	})

	it('does not warn about decals when the table has none', async () => {
		captureWarnings()
		const table = await Table.load(new BinaryReader(bytesOf(EMPTY_FIXTURE)), { loadTableScript: false })
		expect(Object.keys(table.decals)).toHaveLength(0)
		const stubApi = {
			preloadTextures: async () => {},
			createParentNode: (name: string) => ({ name, children: [] as unknown[] }),
			transformScene: () => {},
			addChildToParent: (parent: any, child: any) => parent.children.push(child),
			findInGroup: () => undefined,
		}
		await table.generateTableNode(stubApi as any, { preloadTextures: false, exportPlayfield: false })
		expect(warnings.some(w => /decal/i.test(w))).toBe(false)
	})
})
