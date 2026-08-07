// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Transpiler } from '../transpiler.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript math stdlib', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	it('should provide the Pow function', () => {
		const scope = {} as any
		const vbs = `result = math.pow(2, 10)`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.result).to.equal(1024)
	})
})
