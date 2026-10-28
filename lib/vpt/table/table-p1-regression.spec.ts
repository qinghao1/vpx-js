import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BinaryReader } from '../../io/binary-reader.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { type ILogger, Logger } from '../../util/logger.js'
import type { Texture } from '../texture.js'
import { Table } from './table.js'
import { TableData } from './table-data.js'

const TEXTURE_FIXTURE = path.resolve('test/fixtures/table-texture.vpx')
const DECAL_FIXTURE = path.resolve('test/fixtures/table-decal.vpx')
const EMPTY_FIXTURE = path.resolve('test/fixtures/table-empty.vpx')

const TEXTURE_BYTES = bytesOf(TEXTURE_FIXTURE)
const DECAL_BYTES = bytesOf(DECAL_FIXTURE)
const EMPTY_BYTES = bytesOf(EMPTY_FIXTURE)

function stubRenderApi(): Record<string, (...args: any[]) => any> {
	return {
		preloadTextures: async () => {},
		createParentNode: (name: string) => ({ name, children: [] as unknown[] }),
		transformScene: () => {},
		addChildToParent: (parent: any, child: any) => parent.children.push(child),
		findInGroup: () => undefined,
		createObjectFromRenderable: () => ({}) as any,
		createPointLight: () => ({}) as any,
	}
}

const ALL_EXPORTS_OFF = {
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
}

const PLAYFIELD_ONLY = { preloadTextures: false, exportPlayfield: false }

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
		const table = await Table.load(new BinaryReader(TEXTURE_BYTES), { tableInfoOnly: true })
		expect(table.info?.TableName).toBe('Table Name')
		expect(table.data).toBeUndefined()
		expect(table.tableScript).toBeUndefined()
		expect(Object.keys(table.items)).toHaveLength(0)
	})

	it('still loads the script by default', async () => {
		const table = await Table.load(new BinaryReader(TEXTURE_BYTES))
		expect(table.data).toBeDefined()
		expect(table.tableScript).toContain('Option Explicit')
	})

	it('still opts into script+info with explicit tableInfoOnly and loadTableScript', async () => {
		const table = await Table.load(new BinaryReader(TEXTURE_BYTES), {
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
		const table = await Table.load(new BinaryReader(DECAL_BYTES))
		expect(Object.keys(table.decals)).not.toHaveLength(0)
		await table.generateTableNode(stubRenderApi() as any, ALL_EXPORTS_OFF)
		expect(warnings.some(w => /decal/i.test(w))).toBe(true)
	})

	it('resolves textures case-insensitively like materials', async () => {
		const table = await Table.load(new BinaryReader(TEXTURE_BYTES))
		expect(table.getTexture('TEST_PATTERN_PNG')?.getName()).toBe('test_pattern_png')
		expect(table.getTexture('Test_Pattern_Png')).toBe(table.getTexture('test_pattern_png'))
		expect(table.getTexture('no-such-texture')).toBeUndefined()
		expect(table.getTexture()).toBeUndefined()
	})

	it('invalidates the getTexture cache when the texture dict changes', async () => {
		const table = await Table.load(new BinaryReader(bytesOf(TEXTURE_FIXTURE)))
		const keys = Object.keys(table.textures)
		expect(keys.length).toBeGreaterThan(1)
		// Reference scan: the pre-cache authoritative algorithm (case-insensitive, last wins).
		const referenceScan = (name: string): Texture | undefined => {
			const lc = name.toLowerCase()
			const entries = Object.entries(table.textures)
			for (let i = entries.length - 1; i >= 0; i--) {
				const [key, texture] = entries[i]!
				if (key.toLowerCase() === lc || texture.getName?.().toLowerCase() === lc) return texture
			}
			return undefined
		}
		const names = [...keys, keys[0]!.toUpperCase(), 'no-such-texture']
		const expectCached = (): void => {
			for (const name of names) expect(table.getTexture(name)).toBe(referenceScan(name))
		}
		expectCached()
		// Same-count swap: identity validation must rebuild instead of serving stale entries.
		const [keyA, keyB] = keys as [string, string]
		const texA = table.textures[keyA]!
		table.textures[keyA] = table.textures[keyB]!
		table.textures[keyB] = texA
		expectCached()
		// Removal and re-adding change the size and must rebuild too.
		delete table.textures[keyA]
		expectCached()
		table.textures[keyA] = texA
		expectCached()
	})

	it('does not warn about decals when the table has none', async () => {
		captureWarnings()
		const table = await Table.load(new BinaryReader(EMPTY_BYTES), { loadTableScript: false })
		expect(Object.keys(table.decals)).toHaveLength(0)
		await table.generateTableNode(stubRenderApi() as any, PLAYFIELD_ONLY)
		expect(warnings.some(w => /decal/i.test(w))).toBe(false)
	})
})
