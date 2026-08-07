// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { ClassTransformer } from './class-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting class transformer', () => {
	it('should return the proxy in the constructor', () => {
		const vbs = `Class Foo\nEnd Class\n`
		const js = transform(vbs)
		expect(js).to.equal(
			`class Foo {\n    constructor() {\n        return new Proxy(this, { get: (t, p, r) => Reflect.get(t, p.toLowerCase(), r) });\n    }\n}`,
		)
	})

	it('should convert member properties to lower case', () => {
		const vbs = `Class Foo\nPublic LagCompensation\nEnd Class\n`
		const js = transform(vbs)
		expect(js).to.equal(
			`class Foo {\n    constructor() {\n        this.lagcompensation = undefined;\n        return new Proxy(this, { get: (t, p, r) => Reflect.get(t, p.toLowerCase(), r) });\n    }\n}`,
		)
	})

	it.skip('should convert getters to lower case', () => {
		const vbs = `Class Foo\nPublic Property Get Bar : Bar = 1 : End Property\nEnd Class\n`
		const js = transform(vbs)
		expect(js).to.equal(``)
		//expect(js).to.equal(`class Foo {\n    constructor() {\n        return new Proxy(this, { get: (t, p, r) => Reflect.get(t, p.toLowerCase(), r) });\n    }\n    bar() {\n        let Bar = undefined;\n        Bar = 1;\n        return Bar;\n    }\n}`);
	})

	it('should convert methods to lower case', () => {
		const vbs = `Class Foo\nPublic Sub Bar()\nEnd Sub\nEnd Class\n`
		const js = transform(vbs)
		expect(js).to.equal(
			`class Foo {\n    constructor() {\n        return new Proxy(this, { get: (t, p, r) => Reflect.get(t, p.toLowerCase(), r) });\n    }\n    bar() {\n    }\n}`,
		)
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	let ast = scriptHelper.vbsToAst(vbs)
	ast = new ClassTransformer(ast).transform()
	ast = new ClassTransformer(ast).transformThisIdentifiers()
	return scriptHelper.astToVbs(ast)
}
