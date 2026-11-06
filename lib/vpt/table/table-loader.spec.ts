// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
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

interface BytePatch {
	anchor: string
	replacement: Buffer
}

/** Applies same-length in-place patches to a copy of a fixture. Each anchor must occur exactly once. */
function patchedFixtureBytes(patches: BytePatch[], fixture: string = EMPTY_FIXTURE): Uint8Array {
	const bytes = Buffer.from(readFileSync(fixture))
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

async function loadFixture(fixture: string, opts: TableLoadOptions): Promise<LoadedTable> {
	return new TableLoader().load(new BinaryReader(new Uint8Array(readFileSync(fixture))), opts)
}

describe('TableLoader options matrix', () => {
	it('loads everything by default', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, {})
		expect(out.data).toBeDefined()
		expect(out.textures).toHaveLength(8)
		expect(Object.keys(out.items)).toHaveLength(8)
		expect(out.info?.TableName).toBe('Table Name')
	})

	it('loads only game data with tableDataOnly', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableDataOnly: true })
		expect(out.data).toBeDefined()
		expect(out.textures).toBeUndefined()
		expect(out.info).toBeUndefined()
		expect(Object.keys(out.items)).toHaveLength(0)
	})

	it('loads only table info with tableInfoOnly', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { tableInfoOnly: true })
		expect(out.info?.TableName).toBe('Table Name')
		expect(out.data).toBeUndefined()
		expect(out.textures).toBeUndefined()
		expect(Object.keys(out.items)).toHaveLength(0)
	})

	it('returns an empty texture list with skipTextures', async () => {
		const out = await loadFixture(TEXTURE_FIXTURE, { skipTextures: true })
		expect(out.textures).toEqual([])
		expect(out.data).toBeDefined()
		expect(Object.keys(out.items)).toHaveLength(8)
	})

	it('loads primitive meshes by default', async () => {
		const out = await loadFixture(PRIMITIVE_FIXTURE, {})
		const cube = out.primitives?.find(p => p.getName() === 'Cube')
		expect(cube?.data.numVertices).toBe(24)
		expect((cube?.data as unknown as { numIndices: number } | undefined)?.numIndices).toBe(36)
		expect(cube?.data.mesh.vertices).toHaveLength(24)
		expect(cube?.data.mesh.indices).toHaveLength(36)
	})

	it('skips mesh bulk data but keeps counts with skipMeshes', async () => {
		const out = await loadFixture(PRIMITIVE_FIXTURE, { skipMeshes: true })
		const cube = out.primitives?.find(p => p.getName() === 'Cube')
		expect(cube?.data.numVertices).toBe(24)
		expect((cube?.data as unknown as { numIndices: number } | undefined)?.numIndices).toBe(36)
		expect(cube?.data.mesh.vertices).toHaveLength(0)
		expect(cube?.data.mesh.indices).toHaveLength(0)
	})
})

describe('TableLoader duplicate part names', () => {
	it('renames the second of two same-named items instead of dropping it (upstream GetUniqueName)', async () => {
		const bytes = patchedFixtureBytes(
			[{ anchor: 'Primitive2', replacement: Buffer.from('Primitive1', 'utf16le') }],
			TEXTURE_FIXTURE,
		)
		const table = await Table.load(new BinaryReader(bytes))
		expect(Object.keys(table.items)).toHaveLength(8)
		expect(table.items.Primitive1).toBeDefined()
		const renamed = Object.keys(table.items).find(name => /^Primitive1\d{3}$/.test(name))
		expect(renamed).toBeDefined()
		expect(
			Object.values(table.primitives)
				.map(primitive => primitive.getName())
				.sort(),
		).toEqual(['Primitive1', 'Primitive1001', 'Primitive3', 'Primitive4', 'Primitive5', 'Primitive6'])
	})
})
