// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { getTextFile } from '../../scripting/vbs-scripts.node.js'
import { Grammar } from './grammar.js'

chai.use((sinonChai as any).default ?? sinonChai)

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The scripting grammar - format', () => {
	it('should remove whitespace', () => {
		const vbs = `Dim   x`
		const js = grammar.format(vbs)
		expect(js).to.equal(`Dim x\n`)
	})

	it('should remove comments', () => {
		const vbs = `Dim   x ' Test comment`
		const js = grammar.format(vbs)
		expect(js).to.equal(`Dim x\n`)
	})

	it('should standardize keywords', () => {
		const vbs = `ReDiM x(2) : DiM x2`
		const js = grammar.format(vbs)
		expect(js).to.equal(`ReDim x(2):Dim x2\n`)
	})

	it('should join line continuation', () => {
		const vbs = `x = x +_\n5`
		const js = grammar.format(vbs)
		expect(js).to.equal(`x=x+5\n`)
	})

	it('should remove blank lines', () => {
		const vbs = `x = x + 5\n\n\nx = x + 10\n\n\n`
		const js = grammar.format(vbs)
		expect(js).to.equal(`x=x+5\nx=x+10\n`)
	})
})

describe('The scripting grammar - transpile', () => {
	it('should throw an exception for an empty script', () => {
		const vbs = ``
		expect(() => grammar.transpile(vbs)).to.throw(Error)
	})

	it('should throw an exception for invalid syntax', () => {
		const vbs = `test()\ntest2\ntest3() 1,2\n`
		expect(() => grammar.transpile(vbs)).to.throw(Error)
	})

	it('should allow lines to end with a ":" statement terminator', () => {
		const vbs = `SLLPos=0:Me.TimerEnabled=1:\n`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`SLLPos = 0;\nthis.TimerEnabled = 1;`)
	})

	// it('should transpile controller.vbs successfully', () => {
	// 	const vbs = getTextFile('controller.vbs');
	// 	expect(() => grammar.transpile(vbs)).not.to.throw(Error);
	// });
	//
	// it('should transpile core.vbs successfully', () => {
	// 	const vbs = getTextFile('core.vbs');
	// 	expect(() => grammar.transpile(vbs)).not.to.throw(Error);
	// });
})

describe('The scripting grammar - fastFormat parity', () => {
	it('should match legacyFormat for bundled scripts', () => {
		const names = ['controller.vbs', 'core.vbs', 'sam.vbs', 'WPC.vbs', 'VPMKeys.vbs']
		for (const n of names) {
			let vbs: string
			try {
				vbs = getTextFile(n)
			} catch {
				continue
			}
			const fast = (grammar as any).fastFormat.call(grammar, vbs)
			const leg = (grammar as any).legacyFormat.call(grammar, vbs)
			expect(fast).to.equal(leg, n)
			expect(() => grammar.transpile(vbs)).not.to.throw(Error, n)
		}
	})

	it('should match legacyFormat for walking_dead when available', { timeout: 30000 }, async () => {
		const fs = await import('node:fs')
		const path = '/home/qinghao1/Downloads/walking_dead.vpx'
		if (!fs.existsSync(path)) return
		const { NodeBinaryReader } = await import('../../io/binary-reader.node.js')
		const { Table } = await import('../../vpt/table/table.js')
		const { Player } = await import('../../game/player.js')
		const { Transpiler } = await import('../transpiler.js')
		const table = await Table.load(new NodeBinaryReader(path), { skipTextures: true } as any)
		const vbs = (table as any).tableScript as string
		expect(vbs.length).to.be.greaterThan(10000)
		const fast = (grammar as any).fastFormat.call(grammar, vbs)
		const leg = (grammar as any).legacyFormat.call(grammar, vbs)
		expect(fast).to.equal(leg)
		const player = new Player(table)
		const transpiler = new Transpiler(table, player)
		let jsFast: string
		expect(() => {
			jsFast = transpiler.transpile(vbs)
		}).not.to.throw()
		expect(jsFast!.length).to.be.greaterThan(10000)
		const orig = Grammar.prototype.format
		const legacy = (grammar as any).legacyFormat.bind(grammar)
		;(Grammar.prototype as any).format = (s: string) => legacy(s)
		let jsLeg: string
		try {
			jsLeg = new Transpiler(table, player).transpile(vbs)
		} finally {
			;(Grammar.prototype as any).format = orig
		}
		expect(jsFast!).to.equal(jsLeg!)
		const prog = grammar.transpile('Dim x\n')
		expect(prog.body.length).to.equal(1)
	})
})
