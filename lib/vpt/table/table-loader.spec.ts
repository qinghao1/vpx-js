import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BinaryReader } from '../../io/binary-reader.js'
import type { TableLoadOptions } from './table.js'
import { Table } from './table.js'
import { type LoadedTable, TableLoader } from './table-loader.js'

const EMPTY_FIXTURE = path.resolve('test/fixtures/table-empty.vpx')
const TEXTURE_FIXTURE = path.resolve('test/fixtures/table-texture.vpx')
const PRIMITIVE_FIXTURE = path.resolve('test/fixtures/table-primitive.vpx')
const TEXTBOX_FIXTURE = path.resolve('test/fixtures/table-textbox.vpx')
const TIMER_FIXTURE = path.resolve('test/fixtures/table-timer.vpx')

interface BytePatch {
	anchor: string
	replacement: Buffer
}

/** Applies same-length in-place patches to a copy of the empty fixture. Each anchor must occur exactly once. */
function patchedFixtureBytes(patches: BytePatch[]): Uint8Array {
	const bytes = Buffer.from(readFileSync(EMPTY_FIXTURE))
	for (const patch of patches) {
		const needle = Buffer.from(patch.anchor, 'utf16le')
		if (patch.replacement.length !== needle.length) {
			throw new Error(`Replacement for ${patch.anchor} must be ${needle.length} bytes`)
		}
		const first = bytes.indexOf(needle)
		if (first < 0 || bytes.indexOf(needle, first + 1) >= 0) {
			throw new Error(`Anchor ${patch.anchor} must occur exactly once in fixture`)
		}
		patch.replacement.copy(bytes, first)
	}
	return bytes
}

async function loadInfo(bytes: Uint8Array): Promise<Record<string, string> | undefined> {
	const loader = new TableLoader()
	const loaded = await loader.load(new BinaryReader(bytes), { tableInfoOnly: true })
	return loaded.info
}

describe('TableLoader TableInfo', () => {
	it('decodes ASCII info values', async () => {
		const info = await loadInfo(patchedFixtureBytes([]))
		expect(info?.TableName).toBe('Table Name')
		expect(info?.AuthorName).toBe('Table Author')
		expect(info?.TableRules).toBe('Rules')
	})

	it('decodes non-ASCII info values as UTF-16LE', async () => {
		const bytes = patchedFixtureBytes([{ anchor: 'Table Name', replacement: Buffer.from('Täblé Nàmé', 'utf16le') }])
		const info = await loadInfo(bytes)
		expect(info?.TableName).toBe('Täblé Nàmé')
	})

	it('skips the binary Screenshot stream', async () => {
		const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		const filler = Buffer.alloc(14, 0xa5)
		const bytes = patchedFixtureBytes([
			{ anchor: 'TableBlurb', replacement: Buffer.from('Screenshot', 'utf16le') },
			{ anchor: 'Short Blurb', replacement: Buffer.concat([pngMagic, filler]) },
		])
		const info = await loadInfo(bytes)
		expect(info).toBeDefined()
		expect(info?.Screenshot).toBeUndefined()
		expect(info?.TableName).toBe('Table Name')
	})

	it('truncates info values at the first NUL (upstream ReadInfoValue)', async () => {
		const bytes = patchedFixtureBytes([
			{ anchor: 'Table Name', replacement: Buffer.from('Table\0Name', 'utf16le') },
		])
		const info = await loadInfo(bytes)
		expect(info?.TableName).toBe('Table')
	})
})

describe('TableLoader script framing', () => {
	it('reads CODE exactly (cchar bytes, no ENDB trim)', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { loadTableScript: true })
		// A stale endsWith('ENDB') trim would corrupt scripts ending in ENDB.
		expect(out.tableScript).toBe("'Empty Table\r\n\r\nOption Explicit\r\n\r\n\r\n' EOF")
	})

	it('loads an empty script as empty (cchar 0, not trailing ENDB bytes)', async () => {
		const out = await loadFixture(TIMER_FIXTURE, { loadTableScript: true })
		expect(out.tableScript).toBe('')
	})
})

async function loadFixture(fixture: string, opts: TableLoadOptions): Promise<LoadedTable> {
	return new TableLoader().load(new BinaryReader(new Uint8Array(readFileSync(fixture))), opts)
}

describe('TableLoader options matrix', () => {
	it('loads everything when only the script flag is set', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { loadTableScript: true })
		expect(out.data).toBeDefined()
		expect(out.tableScript).toContain('Option Explicit')
		expect(out.textures).toHaveLength(8)
		expect(Object.keys(out.items)).toHaveLength(8)
		expect(out.collections).toHaveLength(0)
		expect(out.info?.TableName).toBe('Table Name')
	})

	it('loads only game data with tableDataOnly', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableDataOnly: true })
		expect(out.data).toBeDefined()
		expect(out.tableScript).toBeUndefined()
		expect(out.textures).toBeUndefined()
		expect(out.collections).toBeUndefined()
		expect(out.info).toBeUndefined()
		expect(Object.keys(out.items)).toHaveLength(0)
	})

	it('adds the script to a data-only load when requested', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableDataOnly: true, loadTableScript: true })
		expect(out.data).toBeDefined()
		expect(out.tableScript).toContain('Option Explicit')
		expect(out.info).toBeUndefined()
		expect(Object.keys(out.items)).toHaveLength(0)
	})

	it('loads only table info with tableInfoOnly', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableInfoOnly: true })
		expect(out.info?.TableName).toBe('Table Name')
		expect(out.data).toBeUndefined()
		expect(out.tableScript).toBeUndefined()
		expect(out.textures).toBeUndefined()
		expect(Object.keys(out.items)).toHaveLength(0)
	})

	it('loads the script and info for tableInfoOnly with loadTableScript', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableInfoOnly: true, loadTableScript: true })
		expect(out.info?.TableName).toBe('Table Name')
		expect(out.tableScript).toContain('Option Explicit')
	})

	it('skips only the script with loadTableScript false', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { loadTableScript: false })
		expect(out.tableScript).toBeUndefined()
		expect(out.data).toBeDefined()
		expect(out.textures).toHaveLength(8)
		expect(Object.keys(out.items)).toHaveLength(8)
		expect(out.info?.TableName).toBe('Table Name')
	})

	it('returns an empty texture list with skipTextures', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { skipTextures: true, loadTableScript: true })
		expect(out.textures).toEqual([])
		expect(out.data).toBeDefined()
		expect(Object.keys(out.items)).toHaveLength(8)
	})

	it('loads primitive meshes by default', async () => {
		const out = await loadFixture(PRIMITIVE_FIXTURE, { loadTableScript: true })
		const cube = out.primitives?.find(p => p.getName() === 'Cube')
		expect(cube?.data.numVertices).toBe(24)
		expect((cube?.data as unknown as { numIndices: number } | undefined)?.numIndices).toBe(36)
		expect(cube?.data.mesh.vertices).toHaveLength(24)
		expect(cube?.data.mesh.indices).toHaveLength(36)
	})

	it('skips mesh bulk data but keeps counts with skipMeshes', async () => {
		const out = await loadFixture(PRIMITIVE_FIXTURE, { skipMeshes: true, loadTableScript: true })
		const cube = out.primitives?.find(p => p.getName() === 'Cube')
		expect(cube?.data.numVertices).toBe(24)
		expect((cube?.data as unknown as { numIndices: number } | undefined)?.numIndices).toBe(36)
		expect(cube?.data.mesh.vertices).toHaveLength(0)
		expect(cube?.data.mesh.indices).toHaveLength(0)
	})
})

describe('TableLoader loadInvisibleItems', () => {
	async function loadTable(loadInvisibleItems?: boolean): Promise<Table> {
		const bytes = new Uint8Array(readFileSync(TEXTBOX_FIXTURE))
		return loadInvisibleItems === undefined
			? Table.load(new BinaryReader(bytes))
			: Table.load(new BinaryReader(bytes), { loadInvisibleItems })
	}

	it('loads timers and textboxes by default', async () => {
		const table = await loadTable()
		expect(Object.keys(table.timers)).toEqual(['Timer'])
		expect(Object.keys(table.textboxes).sort()).toEqual(['NudgeText', 'TextBox1'])
	})

	it('loads timers and textboxes when enabled', async () => {
		const table = await loadTable(true)
		expect(Object.keys(table.timers)).toEqual(['Timer'])
		expect(Object.keys(table.textboxes).sort()).toEqual(['NudgeText', 'TextBox1'])
		expect(Object.keys(table.items).sort()).toEqual(['NudgeText', 'Plunger1', 'TextBox1', 'Timer'])
	})

	it('omits timers and textboxes from their dicts when disabled but keeps every item', async () => {
		const table = await loadTable(false)
		expect(Object.keys(table.timers)).toHaveLength(0)
		expect(Object.keys(table.textboxes)).toHaveLength(0)
		// Visible items are unaffected, and `items` still registers every game item.
		expect(Object.keys(table.plungers)).toEqual(['Plunger1'])
		expect(Object.keys(table.items).sort()).toEqual(['NudgeText', 'Plunger1', 'TextBox1', 'Timer'])
	})
})
