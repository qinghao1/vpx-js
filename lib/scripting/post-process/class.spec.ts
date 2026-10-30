// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { Player } from '../../game/player.js'
import type { Table } from '../../vpt/table/table.js'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'
import { Transpiler } from '../transpiler.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Class', () => {
	it('should transpile an empty class', () => {
		const vbs = `Class cvpmDictionary\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('class cvpmDictionary {\n    constructor() {\n    }\n}')
	})

	it('should transpile a class with private members', () => {
		const vbs = `Class cvpmImpulseP\nPrivate mEnabled, mBalls\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmImpulseP {\n    constructor() {\n        this.mEnabled = undefined;\n        this.mBalls = undefined;\n    }\n}',
		)
	})

	it('should transpile a class with a constructor', () => {
		const vbs = `Class cvpmDictionary\nPrivate mDict\nPrivate Sub Class_Initialize : Set mDict = CreateObject("Scripting.Dictionary") : End Sub\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`class cvpmDictionary {\n    constructor() {\n        this.mDict = undefined;\n        this.mdict = CreateObject('Scripting.Dictionary');\n    }\n}`,
		)
	})

	it('should transpile a class with a get property', () => {
		const vbs = `Class cvpmTest\nPrivate mEnabled\nPublic Property Get Balls(test):mEnabled=test:Balls=mEnabled:If Balls=1 Then Exit Property:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`class cvpmTest {\n    constructor() {\n        this.mEnabled = undefined;\n    }\n    Balls(test) {\n        let Balls = undefined;\n        this.menabled = test;\n        Balls = this.menabled;\n        if (${Transformer.VBSHELPER_NAME}.isTrue(${Transformer.VBSHELPER_NAME}.equals(Balls, 1))) {\n            return Balls;\n        }\n        return Balls;\n    }\n}`,
		)
	})

	it('should transpile a class with an empty get property', () => {
		const vbs = `Class cvpmTest\nPrivate mEnabled\nPublic Property Get Balls():End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTest {\n    constructor() {\n        this.mEnabled = undefined;\n    }\n    get Balls() {\n        let Balls = undefined;\n        return Balls;\n    }\n}',
		)
	})

	it('should transpile a class with a set property', () => {
		const vbs = `Class cvpmDictionary\nPrivate mDict\nPublic Property Set Key(aKey)\nmDict=Nothing:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmDictionary {\n    constructor() {\n        this.mDict = undefined;\n    }\n    set Key(aKey) {\n        this.mdict = Nothing;\n    }\n}',
		)
	})

	it('should transpile a class with a let property', () => {
		const vbs = `Class cvpmTimer\nPrivate mDebug\nPublic Property Let isDebug(enabled):mDebug=enabled:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTimer {\n    constructor() {\n        this.mDebug = undefined;\n    }\n    set isDebug(enabled) {\n        this.mdebug = enabled;\n    }\n}',
		)
	})

	it('should transpile a class with method declaration', () => {
		const vbs = `Class cvpmImpulseP\nPrivate mEntrySnd\nPublic Sub InitEntrySnd(aNoBall):mEntrySnd=aNoBall:End Sub\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmImpulseP {\n    constructor() {\n        this.mEntrySnd = undefined;\n    }\n    InitEntrySnd(aNoBall) {\n        this.mentrysnd = aNoBall;\n    }\n}',
		)
	})

	it('should transpile a class with identifiers that match member identifiers', () => {
		const vbs = `Class cvpmTimer\nPublic mBalls\nPublic Property Get Balls():Balls=mBalls.Keys:Test=x.mBalls:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTimer {\n    constructor() {\n        this.mBalls = undefined;\n    }\n    get Balls() {\n        let Balls = undefined;\n        Balls = this.mballs.Keys;\n        Test = x.mBalls;\n        return Balls;\n    }\n}',
		)
	})
})

describe('The VBScript transpiler - Property Get behavior', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().build()
		player = new Player(table)
	})

	function execute(vbs: string): any {
		const scope = {} as any
		new Transpiler(table, player).execute(vbs, scope, 'global')
		return scope
	}

	it('should return the current value on Exit Property', () => {
		// Locks the Exit Property coupling: branch.ts emits a bare `return`
		// that ppPropertyGetDeclaration fills with the property-name value.
		const scope = execute(
			'Class C\nPublic Property Get P(x)\nP = 41\nIf x = 1 Then Exit Property\nP = 99\nEnd Property\nEnd Class\nDim o : Set o = New C\nr1 = o.P(1)\nr2 = o.P(2)',
		)
		expect(scope.r1).to.equal(41)
		expect(scope.r2).to.equal(99)
	})
})
