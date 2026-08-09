// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Table loading harness — verifies VPX parsing and script extraction.
 * Run: npx tsx test/harness/verify-table.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'

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
	if (!fs.existsSync(VPX_EXAMPLE)) {
		console.log(`  SKIP — ${VPX_EXAMPLE} not found (any VPX with GameName works)`)
		return true
	}
	const stat = fs.statSync(VPX_EXAMPLE)
	console.log(`  File: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
	const table = await Table.load(new NodeBinaryReader(VPX_EXAMPLE))
	const script = table.tableScript ?? ''
	const gameName = script.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'n/a'
	console.log(`  Table: ${table.info?.TableName} (${table.info?.AuthorName})`)
	console.log(`  GameName: ${gameName}, script: ${(script.length / 1024).toFixed(0)} KB`)
	console.log(
		`  Items: ${Object.keys(table.items).length}, Lights: ${Object.keys(table.lights).length}, Flippers: ${Object.keys(table.flippers).length}, Bumpers: ${Object.keys(table.bumpers).length}`,
	)
	console.log(`  Textures: ${Object.keys(table.textures).length}, Materials: ${table.data?.materials.length ?? 0}`)
	console.log(`  Collections: ${Object.keys(table.collections).length}`)
	if (!script.includes('GameName')) {
		console.log('  FAIL — script missing GameName')
		return false
	}
	if (!gameName) {
		console.log('  FAIL — GameName missing in script')
		return false
	}
	if (Object.keys(table.lights).length < 50) {
		console.log('  FAIL — expected many lights for TWD')
		return false
	}
	console.log(`  ✓ example VPX loaded (GameName=${gameName})`)
	return true
}

async function main() {
	console.log('vpx-js Table harness —', new Date().toISOString())
	const a = await verifyEmpty()
	const b = await verifyExampleVpx()
	console.log(`\n=== Result: ${a && b ? 'PASS' : 'FAIL'} ===`)
	if (!a || !b) process.exit(1)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
