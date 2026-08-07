// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

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
			`class cvpmDictionary {\n    constructor() {\n        this.mDict = undefined;\n        this.mDict = CreateObject('Scripting.Dictionary');\n    }\n}`,
		)
	})

	it('should transpile a class with a get property', () => {
		const vbs = `Class cvpmTest\nPrivate mEnabled\nPublic Property Get Balls(test):mEnabled=test:Balls=mEnabled:If Balls=1 Then Exit Property:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`class cvpmTest {\n    constructor() {\n        this.mEnabled = undefined;\n    }\n    Balls(test) {\n        let Balls = undefined;\n        this.mEnabled = test;\n        Balls = this.mEnabled;\n        if (${Transformer.VBSHELPER_NAME}.equals(Balls, 1)) {\n            return Balls;\n        }\n        return Balls;\n    }\n}`,
		)
	})

	it('should transpile a class with an empty get property', () => {
		const vbs = `Class cvpmTest\nPrivate mEnabled\nPublic Property Get Balls():End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTest {\n    constructor() {\n        this.mEnabled = undefined;\n    }\n    Balls() {\n        let Balls = undefined;\n        return Balls;\n    }\n}',
		)
	})

	it('should transpile a class with a set property', () => {
		const vbs = `Class cvpmDictionary\nPrivate mDict\nPublic Property Set Key(aKey)\nmDict=Nothing:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmDictionary {\n    constructor() {\n        this.mDict = undefined;\n    }\n    Key(aKey) {\n        this.mDict = Nothing;\n    }\n}',
		)
	})

	it('should transpile a class with a let property', () => {
		const vbs = `Class cvpmTimer\nPrivate mDebug\nPublic Property Let isDebug(enabled):mDebug=enabled:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTimer {\n    constructor() {\n        this.mDebug = undefined;\n    }\n    isDebug(enabled) {\n        this.mDebug = enabled;\n    }\n}',
		)
	})

	it('should transpile a class with method declaration', () => {
		const vbs = `Class cvpmImpulseP\nPrivate mEntrySnd\nPublic Sub InitEntrySnd(aNoBall):mEntrySnd=aNoBall:End Sub\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmImpulseP {\n    constructor() {\n        this.mEntrySnd = undefined;\n    }\n    InitEntrySnd(aNoBall) {\n        this.mEntrySnd = aNoBall;\n    }\n}',
		)
	})

	it('should transpile a class with identifiers that match member identifiers', () => {
		const vbs = `Class cvpmTimer\nPublic mBalls\nPublic Property Get Balls():Balls=mBalls.Keys:Test=x.mBalls:End Property\nEnd Class`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			'class cvpmTimer {\n    constructor() {\n        this.mBalls = undefined;\n    }\n    Balls() {\n        let Balls = undefined;\n        Balls = this.mBalls.Keys;\n        Test = x.mBalls;\n        return Balls;\n    }\n}',
		)
	})
})
