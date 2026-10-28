// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { resolveWpcEmu } from './wpc-emu-interop.js'

describe('wpc-emu interop', () => {
	it('resolves WpcEmuApi with the emulator entry points', () => {
		const api = resolveWpcEmu<{ initVMwithRom: unknown; getVersion: unknown }>('WpcEmuApi')
		expect(api).to.have.property('initVMwithRom')
		expect(api).to.have.property('getVersion')
	})

	it('resolves GamelistDB with the game lookup', () => {
		const db = resolveWpcEmu<{ getByPinmameName: unknown }>('GamelistDB')
		expect(db).to.have.property('getByPinmameName')
	})
})
