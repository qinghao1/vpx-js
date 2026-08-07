// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { VbsNotImplementedError } from '../vbs-api.js'
import { WshShell } from './wsh-shell.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript native windows shell object', () => {
	it('should write and read a value to the registry', () => {
		const ws = new WshShell()
		ws.RegWrite('HKLM\\Whatsup', 'Nothin')
		expect(ws.RegRead('HKLM\\Whatsup')).to.equal('Nothin')
	})

	it('should read a default value from the registry', () => {
		const ws = new WshShell()
		expect(ws.RegRead('HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\CurrentVersion')).to.equal(6.3)
		expect(
			ws.RegRead('HKLM\\SYSTEM\\ControlSet001\\Control\\Session Manager\\Environment\\Processor_Architecture'),
		).to.equal('AMD64')
	})

	it('should throw an exception when using non-implemented APIs', () => {
		const ws = new WshShell()
		expect(() => ws.AppActivate('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.CreateShortcut('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.Exec('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.ExpandEnvironmentStrings('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.LogEvent(1, 'a')).to.throw(VbsNotImplementedError)
		expect(() => ws.Popup('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.RegDelete('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.Run('a')).to.throw(VbsNotImplementedError)
		expect(() => ws.SendKeys('a')).to.throw(VbsNotImplementedError)
	})
})
