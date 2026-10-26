// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Table loading harness — verifies VPX parsing and script extraction.
 * Run: npx tsx test/harness/verify-table.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { extractGameName } from './vpinball-resolver.js'

const VPX_EXAMPLE = path.resolve('example-table.vpx') // any VPX; example-table is just an example
const EMPTY = path.resolve('test/fixtures/table-empty.vpx')

async function verifyEmpty() {
	console.log('=== Table: empty fixture ===')
	if (!fs.existsSync(EMPTY)) {
		console.log('  FAIL — test/fixtures/table-empty.vpx not found')
		return false
	}
	const table = await Table.load(new NodeBinaryReader(EMPTY))
	const items = Object.keys(table.items).length
	console.log(`  Items: ${items}, data: ${table.data?.name}, info: ${table.info?.TableName ?? 'n/a'}`)
	if (items === 0) {
		console.log('  FAIL — no items parsed')
		return false
	}
	console.log('  ✓ empty fixture loaded')
	return true
}

async function verifyExampleVpx() {
	console.log('\n=== Table: example VPX ===')
	// Prefer a user-provided example table, but fall back to an in-repo
	// fixture so this leg always exercises a full VPX load (never a bare SKIP).
	const fallback = path.resolve('test/fixtures/table-light.vpx')
	const target = fs.existsSync(VPX_EXAMPLE) ? VPX_EXAMPLE : fallback
	console.log(
		`  Source: ${target === VPX_EXAMPLE ? 'example-table.vpx' : 'test/fixtures/table-light.vpx (fallback)'}`,
	)
	const stat = fs.statSync(target)
	console.log(`  File: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
	const table = await Table.load(new NodeBinaryReader(target))
	const script = table.tableScript ?? ''
	const gameName = extractGameName(script)
	console.log(`  Table: ${table.info?.TableName} (${table.info?.AuthorName})`)
	console.log(`  GameName: ${gameName ?? '(none — generic table)'}, script: ${(script.length / 1024).toFixed(0)} KB`)
	const counts = {
		items: Object.keys(table.items).length,
		lights: Object.keys(table.lights).length,
		flippers: Object.keys(table.flippers).length,
		bumpers: Object.keys(table.bumpers).length,
		textures: Object.keys(table.textures).length,
		materials: table.data?.materials.length ?? 0,
		collections: Object.keys(table.collections).length,
	}
	console.log(
		`  Items: ${counts.items}, Lights: ${counts.lights}, Flippers: ${counts.flippers}, Bumpers: ${counts.bumpers}`,
	)
	console.log(`  Textures: ${counts.textures}, Materials: ${counts.materials}`)
	console.log(`  Collections: ${counts.collections}`)
	if (counts.items === 0) {
		console.log('  FAIL — no items parsed')
		return false
	}
	if (script.includes('GameName') && !gameName) {
		console.log('  FAIL — script mentions GameName but extraction failed')
		return false
	}
	console.log(`  ✓ example VPX loaded (GameName=${gameName ?? 'n/a'})`)
	return true
}

async function main() {
	console.log('vpx-js Table harness —', new Date().toISOString())
	const a = await verifyEmpty()
	const b = await verifyExampleVpx()
	console.log(`\n=== Result: ${a && b ? 'PASS' : 'FAIL'} ===`)
	if (!a || !b) process.exit(1)
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
