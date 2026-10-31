// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { stripVbsComments } from './vbs-comments.js'

describe('stripVbsComments', () => {
	it('drops full-line apostrophe comments', () => {
		expect(stripVbsComments(`'Const cGameName = "mm_10"\nConst cGameName="mm_109b"`)).toBe(
			`\nConst cGameName="mm_109b"`,
		)
	})

	it('strips trailing comments but keeps the code', () => {
		expect(stripVbsComments(`Const cGameName="mm_109b" ' was "mm_10"`)).toBe(`Const cGameName="mm_109b" `)
	})

	it('drops REM lines regardless of case or indentation', () => {
		expect(stripVbsComments(`REM cGameName = "mm_10"\n\treM:cGameName="mm_10"\nConst cGameName="mm_109b"`)).toBe(
			`\n\nConst cGameName="mm_109b"`,
		)
	})

	it('strips colon-separated trailing REM comments', () => {
		expect(stripVbsComments(`x = 1 : REM cGameName = "olddead"\nConst cGameName="mm_109b"`)).toBe(
			`x = 1 \nConst cGameName="mm_109b"`,
		)
	})

	it('keeps REMARK identifiers as code', () => {
		expect(stripVbsComments(`REMARK = 1`)).toBe(`REMARK = 1`)
		expect(stripVbsComments(`x = REM(1)`)).toBe(`x = REM(1)`)
	})

	it('keeps apostrophes inside string literals', () => {
		const line = `If Err Then MsgBox "Can't start Game" & cGameName`
		expect(stripVbsComments(line)).toBe(line)
	})

	it('keeps doubled quotes inside strings intact', () => {
		const line = `x = "say ""can't"" ok" ' tail`
		expect(stripVbsComments(line)).toBe(`x = "say ""can't"" ok" `)
	})
})
