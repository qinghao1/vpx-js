// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Table } from './table.js'

const EMPTY_FIXTURE = path.resolve('test/fixtures/table-empty.vpx')

describe('Table integration', () => {
	it('loads table-empty.vpx via NodeBinaryReader', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		expect(table).toBeDefined()
		expect(table.data).toBeDefined()
		expect(table.info).toBeDefined()
		// The fixture's only game item is a Textbox (type 4), removed with the script surface.
		expect(Object.keys(table.items).length).toBe(0)
	})

	it('empty fixture has playfield dimensions', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		expect(table.data?.right).toBeGreaterThan(0)
		expect(table.data?.bottom).toBeGreaterThan(0)
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

	it('Table.load handles empty script gracefully', async () => {
		const table = await Table.load(new NodeBinaryReader(EMPTY_FIXTURE))
		// Empty fixture ships no script.
		expect(table.tableScript == null || table.tableScript.length < 1000).toBe(true)
	})
})
