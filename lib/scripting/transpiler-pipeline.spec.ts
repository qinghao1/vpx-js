import { describe, expect, it } from 'vitest'
import { normalizeNewCall } from './transpiler-pipeline.js'

describe('normalizeNewCall', () => {
	it('desugars Set with inline New and arguments', () => {
		expect(normalizeNewCall('Set x = (New Foo)(1, 2)')).to.equal('Set x = New Foo\nx.init 1, 2')
	})

	it('desugars Set with inline New without arguments', () => {
		expect(normalizeNewCall('Set x = (New Foo)()')).to.equal('Set x = New Foo')
	})

	it('keeps nested call parens inside Set New args', () => {
		expect(normalizeNewCall('Set x = (New Foo)(f(1), 2)')).to.equal('Set x = New Foo\nx.init f(1), 2')
	})

	it('keeps parens inside string args of Set New', () => {
		expect(normalizeNewCall('Set x = (New Foo)("a)b")')).to.equal('Set x = New Foo\nx.init "a)b"')
	})

	it('keeps escaped quotes inside string args of Set New', () => {
		expect(normalizeNewCall('Set x = (New Foo)("a""b", 1)')).to.equal('Set x = New Foo\nx.init "a""b", 1')
	})

	it('leaves unbalanced Set New args untouched', () => {
		expect(normalizeNewCall('Set x = (New Foo)(1, 2')).to.equal('Set x = (New Foo)(1, 2')
	})

	it('rewrites bare inline New calls to init', () => {
		expect(normalizeNewCall('y = (New Foo)(3)')).to.equal('y = (New Foo).init(3)')
	})

	it('renames Option member access', () => {
		expect(normalizeNewCall('x = controller.Option')).to.equal('x = controller._Option')
	})

	it('leaves switch identifiers alone (renamed after element lookup instead)', () => {
		// `switch` parses fine; ReferenceTransformer renames it only when no
		// table element (or other namespace) claimed it, so an element named
		// `Switch` keeps resolving.
		expect(normalizeNewCall('Dim switch\nswitch = 1')).to.equal('Dim switch\nswitch = 1')
		expect(normalizeNewCall('x = Switch + SWITCH')).to.equal('x = Switch + SWITCH')
		expect(normalizeNewCall('Switch.Hit')).to.equal('Switch.Hit')
	})

	it('leaves string literals untouched', () => {
		expect(normalizeNewCall('x = "flip the switch now"')).to.equal('x = "flip the switch now"')
		expect(normalizeNewCall('x = "set .Option here"')).to.equal('x = "set .Option here"')
		expect(normalizeNewCall('x = "say ""switch"" ok"')).to.equal('x = "say ""switch"" ok"')
		expect(normalizeNewCall(`x = "it's a switch"`)).to.equal(`x = "it's a switch"`)
	})

	it('rewrites code around string literals', () => {
		expect(normalizeNewCall('Set x = (New Foo)("a switch")')).to.equal('Set x = New Foo\nx.init "a switch"')
		expect(normalizeNewCall('Set x = (New Foo)(switch)')).to.equal('Set x = New Foo\nx.init switch')
		expect(normalizeNewCall('Set x = (New Foo)(mySwitch)')).to.equal('Set x = New Foo\nx.init mySwitch')
	})

	it('leaves inline New forms inside strings untouched', () => {
		expect(normalizeNewCall('x = "Set y = (New Foo)(1)"')).to.equal('x = "Set y = (New Foo)(1)"')
	})

	it('leaves an unterminated string untouched', () => {
		expect(normalizeNewCall('x = "a switch')).to.equal('x = "a switch')
	})

	it('does not let a quote in a comment swallow later lines', () => {
		expect(normalizeNewCall(`' a "quoted remark\nx = controller.Option`)).to.equal(
			`' a "quoted remark\nx = controller._Option`,
		)
	})

	it('leaves scripts without special forms untouched', () => {
		expect(normalizeNewCall('Dim x\nx = 1 + 2\n')).to.equal('Dim x\nx = 1 + 2\n')
		expect(normalizeNewCall('')).to.equal('')
	})
})
