// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { GlobalRegistry } from './global-registry.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The global registry emulator', () => {
	it('should correctly deal with abbreviations', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('HKEY_CLASSES_ROOT\\test1', 'test1')
		reg.regWrite('HKEY_CURRENT_USER\\test2', 'test2')
		reg.regWrite('HKEY_LOCAL_MACHINE\\test3', 'test3')
		reg.regWrite('HKEY_USERS\\test4', 'test4')
		reg.regWrite('HKEY_CURRENT_CONFIG\\test5', 'test5')

		expect(reg.regRead('HKCR\\test1')).to.equal('test1')
		expect(reg.regRead('HKCU\\test2')).to.equal('test2')
		expect(reg.regRead('HKLM\\test3')).to.equal('test3')
		expect(reg.regRead('HKU\\test4')).to.equal('test4')
		expect(reg.regRead('HKCC\\test5')).to.equal('test5')
	})

	it('should correctly deal with upper / lower case', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('HKEY_CLASSES_ROOT\\TEST\\dUh', 'test1')
		expect(reg.regRead('HKEY_CLASSES_ROOT\\test\\duh')).to.equal('test1')
	})

	it('should return all default values', () => {
		const reg = new GlobalRegistry()
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\ForceDisableB2S')).to.equal(0)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFContactors')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFKnocker')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFChimes')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFBell')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFGear')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFShaker')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFFlippers')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFTargets')).to.equal(2)
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\DOFDropTargets')).to.equal(2)
		expect(reg.regRead('HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\CurrentVersion')).to.equal(6.3)
		expect(
			reg.regRead('HKLM\\SYSTEM\\ControlSet001\\Control\\Session Manager\\Environment\\Processor_Architecture'),
		).to.equal('AMD64')
	})
})
