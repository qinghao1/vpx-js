// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ScriptHelper } from '../../../test/script.helper'
import { ErrorTransformer } from './error-transformer.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The scripting error transformer', () => {
	it('should update Err when used in an "If" statement', () => {
		const vbs = `If Err Then MsgBox "Can't start Game" & cGameName & vbNewLine & Err.Description:Exit Sub`
		const js = transform(vbs)
		expect(js).to.equal(
			`if (Err.Number) {\n    MsgBox('Can\\'t start Game' + cGameName + vbNewLine + Err.Description);\n    return;\n}`,
		)
	})

	it('should update Err when used in a logical expression', () => {
		const vbs = `If aSw = 0 Or Err Then x = 5 End If`
		const js = transform(vbs)
		expect(js).to.equal(`if (__vbs.equals(aSw, 0) || Err.Number) {\n    x = 5;\n}`)
	})
})

function transform(vbs: string): string {
	const scriptHelper = new ScriptHelper()
	let ast = scriptHelper.vbsToAst(vbs)
	ast = new ErrorTransformer(ast).transform()
	return scriptHelper.astToVbs(ast)
}
