// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { GlobalRegistry } from './global-registry.js'

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

	it('should pin representative default values', () => {
		const reg = new GlobalRegistry()
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\Visual Pinball\\Controller\\ForceDisableB2S')).to.equal(0)
		expect(reg.regRead('HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\CurrentVersion')).to.equal(6.3)
		expect(
			reg.regRead('HKLM\\SYSTEM\\ControlSet001\\Control\\Session Manager\\Environment\\Processor_Architecture'),
		).to.equal('AMD64')
	})

	it('should prefer writes over defaults', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('HKCU\\Software\\Visual Pinball\\Controller\\ForceDisableB2S', 1)
		expect(reg.regRead('HKCU\\Software\\Visual Pinball\\Controller\\ForceDisableB2S')).to.equal(1)
	})

	it('should round-trip writes case-insensitively', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('HKCU\\Software\\MyKey\\VaL', 'x')
		expect(reg.regRead('HKEY_CURRENT_USER\\software\\MYKEY\\val')).to.equal('x')
	})

	it('should return undefined for unknown keys', () => {
		expect(new GlobalRegistry().regRead('HKCU\\Software\\Nope\\Missing')).to.equal(undefined)
	})

	it('should not rewrite a hive name that appears mid-path', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('HKCU\\Software\\hkey_current_user\\Val', 'x')
		expect(reg.regRead('HKCU\\Software\\hkey_current_user\\Val')).to.equal('x')
		// The mid-path component is a literal subkey, not a hive abbreviation.
		expect(reg.regRead('HKCU\\Software\\hkcu\\Val')).to.equal(undefined)
	})

	it('should read stored values as float with fallback', () => {
		const reg = new GlobalRegistry()
		expect(reg.getRegStringAsFloat('Player', 'FlipperPhysicsMass0', 1)).to.equal(1)
		reg.regWrite('HKCU\\Software\\Visual Pinball\\Player\\FlipperPhysicsMass0', 3.5)
		expect(reg.getRegStringAsFloat('Player', 'FlipperPhysicsMass0', 1)).to.equal(3.5)
		reg.regWrite('HKCU\\Software\\Visual Pinball\\Player\\FlipperPhysicsMass1', '2.5')
		expect(reg.getRegStringAsFloat('Player', 'FlipperPhysicsMass1', 1)).to.equal(2.5)
		reg.regWrite('HKCU\\Software\\Visual Pinball\\Player\\FlipperPhysicsMass2', 'not-a-number')
		expect(reg.getRegStringAsFloat('Player', 'FlipperPhysicsMass2', 1)).to.equal(1)
	})

	it('should match long-form hives regardless of case', () => {
		const reg = new GlobalRegistry()
		reg.regWrite('hkey_current_user\\software\\mykey\\val', 'x')
		expect(reg.regRead('HKCU\\software\\mykey\\val')).to.equal('x')
		expect(reg.regRead('HKEY_CURRENT_USER\\SOFTWARE\\MYKEY\\VAL')).to.equal('x')
	})
})
