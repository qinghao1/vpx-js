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

describe('The VBScript transpiler - Loop', () => {
	it('should transpile a "For...Next" statement', () => {
		const vbs = `For j = 1 To 20\ntotal = total + 1\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`__exitFor:\n    for (j = 1; ${Transformer.VBSHELPER_NAME}.lte(j, 20); j = ${Transformer.VBSHELPER_NAME}.add(j, 1)) {\n        total = ${Transformer.VBSHELPER_NAME}.add(total, 1);\n    }`,
		)
	})

	it('should transpile an empty "For...Next" statement', () => {
		const vbs = `For j = 1 To 20\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`__exitFor:\n    for (j = 1; ${Transformer.VBSHELPER_NAME}.lte(j, 20); j = ${Transformer.VBSHELPER_NAME}.add(j, 1)) {\n    }`,
		)
	})

	it('should transpile an inline "For...Next" statement', () => {
		const vbs = `If mBalls Then For ii = 1 to mBalls : x = 5 : Next`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (mBalls) {\n    __exitFor:\n        for (ii = 1; ${Transformer.VBSHELPER_NAME}.lte(ii, mBalls); ii = ${Transformer.VBSHELPER_NAME}.add(ii, 1)) {\n            x = 5;\n        }\n}`,
		)
	})

	it('should transpile an inline "For/Each...Next" statement', () => {
		const vbs = `If BallsInPlay>=1 Then For Each x In BulbP:x.image="Bulb_On":x.TriggerSingleUpdate:Next`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`if (${Transformer.VBSHELPER_NAME}.gte(BallsInPlay, 1)) {\n    __exitFor:\n        for (x of __vbs.toIterable(BulbP)) {\n            x.image = 'Bulb_On';\n            x.TriggerSingleUpdate();\n        }\n}`,
		)
	})

	it('should transpile a "For/Step...Next" increment statement ', () => {
		const vbs = `For j = 1 To 20 Step 3\ntotal = total + 1\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`__exitFor:\n    for (j = 1; ${Transformer.VBSHELPER_NAME}.lt(3, 0) ? ${Transformer.VBSHELPER_NAME}.gte(j, 20) : ${Transformer.VBSHELPER_NAME}.lte(j, 20); j = ${Transformer.VBSHELPER_NAME}.add(j, 3)) {\n        total = ${Transformer.VBSHELPER_NAME}.add(total, 1);\n    }`,
		)
	})

	it('should transpile a "For/Step...Next" decrement statement ', () => {
		const vbs = `For j = 1 To 20 Step -3\ntotal = total + 1\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`__exitFor:\n    for (j = 1; ${Transformer.VBSHELPER_NAME}.lt(-3, 0) ? ${Transformer.VBSHELPER_NAME}.gte(j, 20) : ${Transformer.VBSHELPER_NAME}.lte(j, 20); j = ${Transformer.VBSHELPER_NAME}.add(j, -3)) {\n        total = ${Transformer.VBSHELPER_NAME}.add(total, 1);\n    }`,
		)
	})

	it('should transpile a "For/Each...Next" statement', () => {
		const vbs = `For Each x In students\ntotal = total + x\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`__exitFor:\n    for (x of __vbs.toIterable(students)) {\n        total = ${Transformer.VBSHELPER_NAME}.add(total, x);\n    }`,
		)
	})

	it('should transpile an empty "For/Each...Next" statement', () => {
		const vbs = `For Each x In students\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('__exitFor:\n    for (x of __vbs.toIterable(students)) {\n    }')
	})

	it('should transpile a "Do While...Loop" statement', () => {
		const vbs = `Dim x\nx = 1\nDo While x < 5\nx = x + 1\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 1;\n__exitDo:\n    while (${Transformer.VBSHELPER_NAME}.lt(x, 5)) {\n        x = ${Transformer.VBSHELPER_NAME}.add(x, 1);\n    }`,
		)
	})

	it('should transpile an empty "Do While...Loop" statement', () => {
		const vbs = `Dim x\nx = 1\nDo While x < 5\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`let x;\nx = 1;\n__exitDo:\n    while (${Transformer.VBSHELPER_NAME}.lt(x, 5)) {\n    }`)
	})

	it('should transpile a "Do Until...Loop" statement', () => {
		const vbs = `Dim x\nx = 1\nDo Until x = 5\nx = x + 1\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 1;\n__exitDo:\n    do {\n        if (${Transformer.VBSHELPER_NAME}.equals(x, 5))\n            break;\n        x = ${Transformer.VBSHELPER_NAME}.add(x, 1);\n    } while (true);`,
		)
	})

	it('should transpile an empty "Do Until...Loop" statement', () => {
		const vbs = `Dim x\nx = 1\nDo Until x = 5\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 1;\n__exitDo:\n    do {\n        if (${Transformer.VBSHELPER_NAME}.equals(x, 5))\n            break;\n    } while (true);`,
		)
	})

	it('should transpile a "Do...Loop While" statement', () => {
		const vbs = `Dim x\nx = 7\nDo\nx = x + 1\nLoop While x < 5`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 7;\n__exitDo:\n    do {\n        x = ${Transformer.VBSHELPER_NAME}.add(x, 1);\n    } while (${Transformer.VBSHELPER_NAME}.lt(x, 5));`,
		)
	})

	it('should transpile an empty "Do...Loop While" statement', () => {
		const vbs = `Dim x\nx = 7\nDo\nLoop While x < 5`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 7;\n__exitDo:\n    do {\n    } while (${Transformer.VBSHELPER_NAME}.lt(x, 5));`,
		)
	})

	it('should transpile a "Do...Loop Until" statement', () => {
		const vbs = `Dim i\ni = 10\nDo\ni = i + 1\nLoop Until i < 15`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let i;\ni = 10;\n__exitDo:\n    do {\n        i = ${Transformer.VBSHELPER_NAME}.add(i, 1);\n        if (${Transformer.VBSHELPER_NAME}.lt(i, 15))\n            break;\n    } while (true);`,
		)
	})

	it('should transpile an empty "Do...Loop Until" statement', () => {
		const vbs = `Dim i\ni = 10\nDo\nLoop Until i < 15`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let i;\ni = 10;\n__exitDo:\n    do {\n        if (${Transformer.VBSHELPER_NAME}.lt(i, 15))\n            break;\n    } while (true);`,
		)
	})

	it('should transpile a "Do...Loop" statement', () => {
		const vbs = `Dim x\nx = 7\nDo\nx = x + 1\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 7;\n__exitDo:\n    do {\n        x = ${Transformer.VBSHELPER_NAME}.add(x, 1);\n    } while (true);`,
		)
	})

	it('should transpile a "While...WEnd" statement', () => {
		const vbs = `Dim x\nx = 1\nWhile x < 5\nx = x + 1\nWEnd`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`let x;\nx = 1;\n__exitDo:\n    while (${Transformer.VBSHELPER_NAME}.lt(x, 5)) {\n        x = ${Transformer.VBSHELPER_NAME}.add(x, 1);\n    }`,
		)
	})

	it('should transpile an empty "While...WEnd" statement', () => {
		const vbs = `Dim x\nx = 1\nWhile x < 5\nWEnd`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(`let x;\nx = 1;\n__exitDo:\n    while (${Transformer.VBSHELPER_NAME}.lt(x, 5)) {\n    }`)
	})

	it('should bind "Exit Do" to the outer loop in mixed nesting', () => {
		const vbs = `Do\nFor i = 1 To 5\nIf i = 3 Then Exit Do\nNext\nLoop`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.contain('break __exitDo;')
		expect(js).to.contain('__exitDo:')
	})

	it('should bind "Exit For" to the outer loop in mixed nesting', () => {
		const vbs = `For i = 1 To 5\nDo\nIf i = 3 Then Exit For\nLoop Until i > 9\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.contain('break __exitFor;')
		expect(js).to.contain('__exitFor:')
	})

	it('should use distinct labels for nested same-kind loops', () => {
		const vbs = `For i = 1 To 3\nFor j = 1 To 3\nIf j = 2 Then Exit For\nNext\nNext`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.contain('__exitFor1:')
		expect(js).to.contain('break __exitFor1;')
	})
})

describe('The VBScript transpiler - Loop behavior', () => {
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

	it('should iterate Dictionary keys with For Each', () => {
		const vbs = `Set d = CreateObject("Scripting.Dictionary")\nd.Add "a", 1\nd.Add "b", 2\ns = ""\nFor Each k In d.Keys\ns = s & k\nNext`
		expect(execute(vbs).s).to.equal('ab')
	})

	it('should exit the outer Do from an "Exit Do" inside a For', () => {
		const vbs = `n = 0\nDo\nFor i = 1 To 5\nn = n + 1\nIf i = 3 Then Exit Do\nNext\nLoop`
		expect(execute(vbs).n).to.equal(3)
	})

	it('should exit the outer For from an "Exit For" inside a Do', () => {
		const vbs = `n = 0\nFor i = 1 To 5\nDo\nn = n + 1\nIf n = 3 Then Exit For\nLoop While False\nNext`
		const scope = execute(vbs)
		expect(scope.n).to.equal(3)
		expect(scope.i).to.equal(3)
	})

	it('should exit only the inner For from a same-kind "Exit For"', () => {
		const vbs = `n = 0\nFor i = 1 To 3\nFor j = 1 To 3\nn = n + 1\nIf j = 2 Then Exit For\nNext\nNext`
		expect(execute(vbs).n).to.equal(6)
	})

	it('should exit only the inner Do from a same-kind "Exit Do"', () => {
		const vbs = `n = 0\nm = 0\nDo\nm = m + 1\nDo\nn = n + 1\nIf n = 2 Then Exit Do\nLoop While False\nLoop While m < 3`
		const scope = execute(vbs)
		expect(scope.n).to.equal(3)
		expect(scope.m).to.equal(3)
	})

	it('should skip a For loop with a Null upper bound', () => {
		const vbs = `s = 0\nFor i = 1 To Null\ns = s + 1\nNext\nx = s`
		expect(execute(vbs).x).to.equal(0)
	})

	it('should treat a Step of True as -1 (descending)', () => {
		const vbs = `s = 0\nFor i = 3 To 1 Step True\ns = s + 1\nNext\nx = s`
		expect(execute(vbs).x).to.equal(3)
	})

	it('should not enter a For loop with an Empty upper bound below the start', () => {
		const vbs = `Dim m\ns = 0\nFor i = 1 To m\ns = s + 1\nNext\nx = s`
		expect(execute(vbs).x).to.equal(0)
	})
})
