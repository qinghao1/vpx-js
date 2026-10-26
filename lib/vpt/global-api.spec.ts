// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../test/three.helper'
import {
	DIK_1,
	DIK_4,
	DIK_5,
	DIK_LALT,
	DIK_LCONTROL,
	DIK_LSHIFT,
	DIK_Q,
	DIK_RCONTROL,
	DIK_RETURN,
	DIK_RSHIFT,
	DIK_SLASH,
	DIK_SPACE,
	DIK_T,
	DIK_Z,
} from '../game/key-code.js'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { ERR } from '../scripting/stdlib/err.js'
import { Transpiler } from '../scripting/transpiler.js'
import { GlobalApi } from './global-api.js'
import { ItemApi } from './item-api.js'
import { Table } from './table/table.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball global API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-kicker.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const api = new GlobalApi(table, player)

		expect(api.Name).to.equal('Global')
		expect(api.PlungerKey).to.equal(DIK_RETURN)
		expect(api.LeftFlipperKey).to.equal(DIK_LSHIFT)
		expect(api.RightFlipperKey).to.equal(DIK_RSHIFT)
		expect(api.LeftTiltKey).to.equal(DIK_Z)
		expect(api.RightTiltKey).to.equal(DIK_SLASH)
		expect(api.CenterTiltKey).to.equal(DIK_SPACE)
		expect(api.AddCreditKey).to.equal(DIK_5)
		expect(api.AddCreditKey2).to.equal(DIK_4)
		expect(api.StartGameKey).to.equal(DIK_1)
		expect(api.MechanicalTilt).to.equal(DIK_T)
		expect(api.RightMagnaSave).to.equal(DIK_RCONTROL)
		expect(api.LeftMagnaSave).to.equal(DIK_LCONTROL)
		expect(api.ExitGame).to.equal(DIK_Q)
		expect(api.RightFlipperKey).to.equal(DIK_RSHIFT)
		expect(api.LockbarKey).to.equal(DIK_LALT)
		expect(api.ActiveBall).to.equal(undefined)
		expect(api.GameTime).to.be.equal(0)
		expect(api.SystemTime).to.be.above(0)
		// 0–100 day/night percent from the table-kicker.vpx fixture (globalEmissionScale 0.52; float32 load explains the ...9998 tail).
		expect(api.NightDay).to.be.equal(51.99999809265137)
		expect(api.ShowDT).to.be.equal(true)
		expect(api.ShowFSS).to.be.equal(false)
		expect(api.GetPlayerHWnd).to.be.equal(null)
		expect(api.Version).to.be.at.least(10600)
		expect(api.VPBuildVersion).to.be.at.least(10600)
		expect(api.VersionMajor).to.equal(10)
		expect(api.VersionMinor).to.be.at.least(6)
		expect(api.VersionRevision).to.be.at.least(0)
		player.setDimensions(1920, 1080)
		expect(api.WindowWidth).to.equal(1920)
		expect(api.WindowHeight).to.equal(1080)
		expect(api.GetCustomParam()).to.equal('')
	})

	it('should correctly return the balls in play', () => {
		const api = new GlobalApi(table, player)
		const kicker = table.kickers.Williams.getApi()
		expect(api.GetBalls()).to.have.lengthOf(0)

		kicker.CreateBall()
		kicker.Kick(0, 5)
		player.updatePhysics(100)
		expect(api.GetBalls()).to.have.lengthOf(1)

		const ball = kicker.CreateBall()
		expect(api.GetBalls()).to.have.lengthOf(2)

		player.destroyBall(ball)
		expect(api.GetBalls()).to.have.lengthOf(1)
	})

	it('should correctly return the playfield elements', () => {
		const api = new GlobalApi(table, player)
		const elements = api.GetElements()
		expect(elements.find(e => e.Name === 'Williams')).to.be.ok
		expect(elements).to.have.lengthOf(13)
	})

	it('should correctly return a playfield element', () => {
		const api = new GlobalApi(table, player)
		const element = api.GetElementByName('Williams')
		expect(element).to.be.ok
		expect(element?.Name).to.equal('Williams')
	})

	it('should return script APIs from GetElements', () => {
		const api = new GlobalApi(table, player)
		for (const element of api.GetElements()) {
			expect(element).to.be.instanceOf(ItemApi)
		}
	})

	it('should return the script API from GetElementByName', () => {
		const api = new GlobalApi(table, player)
		expect(api.GetElementByName('Williams')).to.be.instanceOf(ItemApi)
		expect(api.GetElementByName('williams')).to.be.instanceOf(ItemApi)
		expect(api.GetElementByName('WILLIAMS')?.Name).to.equal('Williams')
		expect(api.GetElementByName('NoSuchElement')).to.equal(undefined)
	})

	it('should apply the color of a material', () => {
		const api = new GlobalApi(table, player)
		const material = table.getMaterial('Playfield')
		expect(material).to.be.ok
		expect(material?.baseColor).to.equal(0xb4b4b4)

		// Script colors are OLE_COLOR (BGR); baseColor stores RGB.
		api.MaterialColor('Playfield', 0x0000ff)
		expect(material?.baseColor).to.equal(0xff0000)
		api.MaterialColor('Playfield', 0x123456)
		expect(material?.baseColor).to.equal(0x563412)
	})

	it('should correctly save and load values', () => {
		const api = new GlobalApi(table, player)
		api.SaveValue('myTable', 'myValueName', 'myValue')
		expect(api.LoadValue('myTable', 'myValueName')).to.equal('myValue')
	})

	it('should resolve the serial API names case-insensitively', () => {
		const api = new GlobalApi(table, player)
		expect(api._getPropertyName('openserial')).to.equal('OpenSerial')
		expect(api._getPropertyName('closeserial')).to.equal('CloseSerial')
		expect(api._getPropertyName('flushserial')).to.equal('FlushSerial')
		expect(api._getPropertyName('setupserial')).to.equal('SetupSerial')
		expect(api._getPropertyName('readserial')).to.equal('ReadSerial')
		expect(api._getPropertyName('writeserial')).to.equal('WriteSerial')
		expect(api._getPropertyName('getserialdevices')).to.equal('GetSerialDevices')
	})

	it('should raise a trappable error when opening a serial device', () => {
		const api = new GlobalApi(table, player)
		expect(() => api.OpenSerial('COM1')).to.throw(/COM1/)
		ERR.OnErrorResumeNext()
		try {
			expect(() => api.OpenSerial('COM1')).to.not.throw()
			expect(ERR.Number).to.equal(68)
			expect(ERR.Source).to.equal('OpenSerial')
		} finally {
			ERR.Clear()
			ERR.OnErrorGoto0()
		}
	})

	it('should ignore serial port operations on platforms without serial hardware', () => {
		const api = new GlobalApi(table, player)
		expect(api.CloseSerial()).to.equal(undefined)
		expect(api.FlushSerial()).to.equal(undefined)
		expect(api.SetupSerial(9600, 8, 0, 1, false, false)).to.equal(undefined)
		expect(api.WriteSerial([1, 2, 3])).to.equal(undefined)
		expect(api.ReadSerial(4)).to.equal(undefined)
		expect(api.GetSerialDevices()).to.equal(undefined)
	})

	it('should route serial calls from table scripts to the global API', () => {
		const transpiler = new Transpiler(table, player)
		expect(() => transpiler.execute('OpenSerial "COM1"', {})).to.throw(/COM1/)
		expect(() => transpiler.execute('CloseSerial', {})).to.not.throw()
	})
})
