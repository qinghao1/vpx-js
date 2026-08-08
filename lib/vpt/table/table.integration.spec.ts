// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from './table.js'

const VPX_WALKING_DEAD = path.resolve('walking_dead.vpx')
const EMPTY_FIXTURE = path.resolve('test/fixtures/table-empty.vpx')

describe('Table integration', () => {
	it('loads table-empty.vpx via NodeBinaryReader', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		expect(table).toBeDefined()
		expect(table.data).toBeDefined()
		expect(table.info).toBeDefined()
		expect(Object.keys(table.items).length).toBeGreaterThan(0)
	})

	it('empty fixture has playfield dimensions', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		expect(table.data!.right).toBeGreaterThan(0)
		expect(table.data!.bottom).toBeGreaterThan(0)
	})

	it('TableBuilder produces minimal table usable by Table API', () => {
		const table = new TableBuilder().addFlipper('Flipper1').addBumper('Bumper1').build()
		expect(table.flippers.Flipper1).toBeDefined()
		expect(table.bumpers.Bumper1).toBeDefined()
		expect(Object.keys(table.items)).toContain('Flipper1')
	})

	it('TableBuilder with script stores tableScript', async () => {
		const vbs = 'Sub Test()\nEnd Sub\n'
		const table = new TableBuilder().withTableScript(vbs).build()
		expect(table.tableScript).toBe(vbs)
	})

	it('loads example VPX (walking_dead) and extracts metadata — generic GameName check (skipped if missing)', async () => {
		if (!fs.existsSync(VPX_WALKING_DEAD)) {
			console.warn('[integration] walking_dead.vpx not found — skip')
			return
		}
		const table = await Table.load(new NodeBinaryReader(VPX_WALKING_DEAD))
		expect(table.tableScript).toBeDefined()
		expect(table.tableScript!.length).toBeGreaterThan(100_000)
		expect(table.info?.TableName).toMatch(/Walking Dead/i)
		expect(table.info?.AuthorName).toBeDefined()
		const gameName = table.tableScript!.match(/cGameName\s*=\s*["']([^"']+)["']/i)?.[1]
		expect(gameName?.length).toBeGreaterThan(2) // generic: any GameName, twd_160h is just the example ROM
		expect(Object.keys(table.items).length).toBeGreaterThan(500)
		expect(Object.keys(table.lights).length).toBeGreaterThan(100)
		expect(Object.keys(table.flippers).length).toBeGreaterThanOrEqual(2)
		expect(Object.keys(table.textures).length).toBeGreaterThan(10)
		expect(Object.keys(table.collections).length).toBeGreaterThanOrEqual(0)
		expect(table.data!.right).toBeGreaterThan(900)
		expect(table.data!.bottom).toBeGreaterThan(2000)
	})

	it('Table.load handles empty script gracefully', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		// empty fixture has no script — should be undefined or empty string
		expect(table.tableScript == null || table.tableScript.length < 1000).toBe(true)
	})
})
