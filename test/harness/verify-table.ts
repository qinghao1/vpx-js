// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Table loading harness — verifies VPX parsing of static table items.
 * Run: npx tsx test/harness/verify-table.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'

const EMPTY = path.resolve('test/fixtures/table-empty.vpx')
const FULL_CANDIDATES = [
	path.resolve('test/fixtures/table-full.vpx'),
	path.resolve('example-table.vpx'),
	path.resolve('test/fixtures/table-light.vpx'),
]
const FULL = FULL_CANDIDATES.find(p => fs.existsSync(p)) ?? path.resolve('test/fixtures/table-light.vpx')

async function verifyEmpty() {
	console.log('=== Table: empty fixture ===')
	if (!fs.existsSync(EMPTY)) {
		console.log('  FAIL — test/fixtures/table-empty.vpx not found')
		return false
	}
	const table = await Table.load(new NodeBinaryReader(EMPTY))
	const items = Object.keys(table.items).length
	console.log(`  Items: ${items}, data: ${table.data?.name}, info: ${table.info?.TableName ?? 'n/a'}`)
	if (!table.data) {
		console.log('  FAIL — no table data parsed')
		return false
	}
	console.log('  ✓ empty fixture loaded')
	return true
}

async function verifyFull() {
	console.log('\n=== Table: full fixture ===')
	if (!fs.existsSync(FULL)) {
		console.log(`  FAIL — fixture not found: ${FULL}`)
		return false
	}
	const stat = fs.statSync(FULL)
	console.log(`  Source: ${path.basename(FULL)}, File: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
	const table = await Table.load(new NodeBinaryReader(FULL))
	console.log(`  Table: ${table.info?.TableName ?? 'n/a'} (${table.info?.AuthorName ?? 'n/a'})`)
	const counts = {
		items: Object.keys(table.items).length,
		lights: Object.keys(table.lights).length,
		flippers: Object.keys(table.flippers).length,
		bumpers: Object.keys(table.bumpers).length,
		textures: Object.keys(table.textures).length,
		materials: table.data?.materials.length ?? 0,
	}
	console.log(
		`  Items: ${counts.items}, Lights: ${counts.lights}, Flippers: ${counts.flippers}, Bumpers: ${counts.bumpers}`,
	)
	console.log(`  Textures: ${counts.textures}, Materials: ${counts.materials}`)
	if (counts.items === 0) {
		console.log('  FAIL — no items parsed')
		return false
	}
	console.log(`  ✓ full fixture loaded (${path.basename(FULL)})`)
	return true
}

async function main() {
	console.log('vpx-js Table harness —', new Date().toISOString())
	const a = await verifyEmpty()
	const b = await verifyFull()
	console.log(`\n=== Result: ${a && b ? 'PASS' : 'FAIL'} ===`)
	if (!a || !b) process.exit(1)
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
