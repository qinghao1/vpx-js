// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import type { Table } from '../vpt/table/table.js'
import { Transformer } from './transformer/transformer.js'
import { Transpiler } from './transpiler.js'
import { cacheKey, getTableDataForWorker, getVbsMemCache } from './transpiler-worker-pool.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VBScript transpiler', () => {
	let table: Table
	let player: Player

	before(async () => {
		table = new TableBuilder().addFlipper('Flipper').build()
		player = new Player(table)
	})

	it('should wrap everything into a global function', () => {
		const vbs = `Dim test\n`
		const transpiler = new Transpiler(table, player)
		const js = transpiler.transpile(vbs, 'runTableScript')
		expect(js).to.equal(
			`runTableScript = (${Transformer.SCOPE_NAME}, ${Transformer.ITEMS_NAME}, ${Transformer.ENUMS_NAME}, ${Transformer.GLOBAL_NAME}, ${Transformer.STDLIB_NAME}, ${Transformer.VBSHELPER_NAME}, ${Transformer.PLAYER_NAME}) => {\n        __scope.test = undefined;\n};`,
		)
	})

	it('should wrap everything into a function of an object', () => {
		const vbs = `Dim test\n`
		const transpiler = new Transpiler(table, player)
		const js = transpiler.transpile(vbs, 'runTableScript', 'window')
		expect(js).to.equal(
			`window.runTableScript = (${Transformer.SCOPE_NAME}, ${Transformer.ITEMS_NAME}, ${Transformer.ENUMS_NAME}, ${Transformer.GLOBAL_NAME}, ${Transformer.STDLIB_NAME}, ${Transformer.VBSHELPER_NAME}, ${Transformer.PLAYER_NAME}) => {\n        __scope.test = undefined;\n};`,
		)
	})

	it('should serve repeat sync transpiles from the memory cache', () => {
		const vbs = `Dim syncCacheProbe\n`
		const transpiler = new Transpiler(table, player)
		const first = transpiler.transpile(vbs, 'play', 'global')
		const key = cacheKey(vbs, 'play', 'global', getTableDataForWorker(table, player))
		expect(getVbsMemCache(key)).to.equal(first)
		expect(transpiler.transpile(vbs, 'play', 'global')).to.equal(first)
	})

	it('should reuse memoized table data and parse trees across Transpiler instances', () => {
		const vbs = `Dim sharedCacheProbe\nsharedCacheProbe = 40 + 2\n`
		const first = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		expect(new Transpiler(table, player).transpile(vbs, 'play', 'global')).to.equal(first)
		const scope = {} as any
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.sharedCacheProbe).to.equal(42)
	})

	it('should execute the table script', () => {
		const Spy = sinon.spy()
		const vbs = `Spy\n` // that's our spy, in VBScript!
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, { Spy }, 'global') // this should execute the spy

		expect(Spy).to.have.been.calledOnce
	})

	it('should handle case insensitivity when reading global variables', () => {
		const scope = {} as any
		const vbs = `MyVariable = 10\nValueRead = mYvArIAblE`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.ValueRead).to.equal(10)
	})

	it('should handle case insensitivity when writing global variables', () => {
		const scope = {} as any
		const vbs = `MyVariable = 10\nmYvArIAblE = 12`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.MyVariable).to.equal(12)
	})

	it('should handle case insensitivity when calling functions', () => {
		const scope = {} as any
		const vbs = `Sub Abc\nMyVariable = 13\nEnd Sub\naBC`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.MyVariable).to.equal(13)
	})

	it('should define globals via ExecuteGlobal', () => {
		const scope = {} as any
		const vbs = `ExecuteGlobal "z = 42"`
		const transpiler = new Transpiler(table, player)
		transpiler.execute(vbs, scope, 'global')

		expect(scope.z).to.equal(42)
	})

	it('should fail loudly on Imp instead of silently miscompiling it', () => {
		const transpiler = new Transpiler(table, player)
		expect(() => transpiler.transpile(`Dim a\na = True Imp False\n`)).to.throw()
	})

	it('should fail loudly on On Error GoTo with a label instead of silently ignoring it', () => {
		const transpiler = new Transpiler(table, player)
		expect(() => transpiler.transpile(`On Error GoTo Handler\nHandler:\n`)).to.throw()
	})

	it('should pass ByRef parameters by value like JS, documented as a divergence', () => {
		const scope = {} as any
		const vbs = `Sub Inc(ByRef x)\nx = x + 1\nEnd Sub\nDim a\na = 1\nInc a\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		// Real VBScript would set a to 2; without by-ref support the
		// caller's variable is untouched.
		expect(scope.a).to.equal(1)
	})

	it('should parse Option Explicit without enforcing it, documented as a divergence', () => {
		const scope = {} as any
		new Transpiler(table, player).execute(`Option Explicit\nundeclaredVar = 5\n`, scope, 'global')
		expect(scope.undeclaredVar).to.equal(5)
	})

	it('should support For Step with a negative step', () => {
		const scope = {} as any
		new Transpiler(table, player).execute(
			`Dim s\nDim i\ns = ""\nFor i = 3 To 1 Step -1\ns = s & i\nNext\n`,
			scope,
			'global',
		)
		expect(scope.s).to.equal('321')
	})

	it('should support Select Case', () => {
		const scope = {} as any
		const vbs = `Dim a\nDim b\na = 2\nSelect Case a\nCase 1\nb = "one"\nCase 2\nb = "two"\nCase Else\nb = "other"\nEnd Select\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.b).to.equal('two')
	})

	it('should re-arm throwing with On Error GoTo 0 after On Error Resume Next', () => {
		const scope = {} as any
		new Transpiler(table, player).execute(
			`On Error Resume Next\nresult = CInt("abc")\ncode = Err.Number\nOn Error GoTo 0\n`,
			scope,
			'global',
		)
		expect(scope.code).to.equal(13)
		expect(() => {
			new Transpiler(table, player).execute(`On Error GoTo 0\nresult = CInt("abc")\n`, {} as any, 'global')
		}).to.throw()
	})

	it('should grow an array on out-of-range write after a ByVal ReDim (FlipperPolarity.AddPt pattern)', () => {
		// Walking Dead calls x.AddPt, which ReDims a ByRef array inside
		// ShuffleArray (plain ReDim rebinds, so the growth is lost through
		// our by-value args) and then writes past the caller's length.
		// The write must extend for the table to load.
		const scope = {} as any
		const vbs = `On Error GoTo 0\nDim xs\nReDim xs(0)\nSub Grow(a)\nReDim a(UBound(a) + 1)\nEnd Sub\nGrow xs\nxs(1) = 42\nResult = xs(1)\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.Result).to.equal(42)
	})

	it('should take the Else branch for an unread array slot (trough HasSw pattern)', () => {
		// Royal Flush's cvpmBallStack.HasSw does `If mSw(aNo) Then` on slots
		// that were never written (Empty). Empty is falsy in VBScript; raw JS
		// truthiness takes the true branch for the UNDEF sentinel instead.
		const scope = {} as any
		const vbs = `Dim a(10)\nDim x\nIf a(8) Then\nx = 1\nElse\nx = 2\nEnd If\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.x).to.equal(2)
	})

	it('should skip a Do While body guarded by an unread array slot', () => {
		const scope = {} as any
		const vbs = `Dim a(10)\nDim x\nx = 0\nDo While a(8)\nx = 1\nExit Do\nLoop\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.x).to.equal(0)
	})

	it('should keep looping a Do Until guarded by an unread array slot', () => {
		const scope = {} as any
		const vbs = `Dim a(10)\nDim x\nx = 0\nDo\nx = x + 1\nIf x > 3 Then Exit Do\nLoop Until a(8)\n`
		new Transpiler(table, player).execute(vbs, scope, 'global')
		expect(scope.x).to.equal(4)
	})

	it('should throw instead of silently succeeding when the script defines no play function', () => {
		const stalePlay = sinon.spy()
		const prevPlay = (globalThis as any).play
		;(globalThis as any).play = stalePlay
		try {
			const transpiler = new Transpiler(table, player)
			expect(() => (transpiler as any).evalAndPlay('null;', {})).to.throw(Error)
			expect(stalePlay).to.not.have.been.called
		} finally {
			;(globalThis as any).play = prevPlay
		}
	})
})
