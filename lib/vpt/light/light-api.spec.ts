// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { Light, LightData } from './light.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball light API', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-light.vpx')))
		player = new Player(table).init()
	})

	it('should correctly read and write the properties', async () => {
		const light = table.lights.Surface.getApi()
		light.Falloff = 23
		expect(light.Falloff).to.equal(23)
		light.FalloffPower = 512
		expect(light.FalloffPower).to.equal(512)
		light.State = Enums.LightStatus.LightStateOn
		expect(light.State).to.equal(Enums.LightStatus.LightStateOn)
		light.State = Enums.LightStatus.LightStateOff
		expect(light.State).to.equal(Enums.LightStatus.LightStateOff)
		light.State = Enums.LightStatus.LightStateBlinking
		expect(light.State).to.equal(Enums.LightStatus.LightStateBlinking)
		light.Color = 0x12ff54
		expect(light.Color).to.equal(0x12ff54)
		light.ColorFull = 0x00de23
		expect(light.ColorFull).to.equal(0x00de23)
		light.X = 12
		expect(light.X).to.equal(12)
		light.Y = 1123
		expect(light.Y).to.equal(1123)
		light.BlinkPattern = '1001'
		expect(light.BlinkPattern).to.equal('1001')
		light.BlinkInterval = 21
		expect(light.BlinkInterval).to.equal(21)
		light.Intensity = 34
		expect(light.Intensity).to.equal(34)
		light.TransmissionScale = 1.2
		expect(light.TransmissionScale).to.equal(1.2)
		light.IntensityScale = 3
		expect(light.IntensityScale).to.equal(3)
		light.Surface = 'surface'
		expect(light.Surface).to.equal('surface')
		light.Image = 'image'
		expect(light.Image).to.equal('image')
		light.DepthBias = 1.5
		expect(light.DepthBias).to.equal(1.5)
		light.FadeSpeedUp = 0.4
		expect(light.FadeSpeedUp).to.equal(0.4)
		light.FadeSpeedDown = 0.2
		expect(light.FadeSpeedDown).to.equal(0.2)
		light.Bulb = false
		expect(light.Bulb).to.equal(false)
		light.Bulb = true
		expect(light.Bulb).to.equal(true)
		light.ImageMode = false
		expect(light.ImageMode).to.equal(false)
		light.ImageMode = true
		expect(light.ImageMode).to.equal(true)
		light.ShowBulbMesh = false
		expect(light.ShowBulbMesh).to.equal(false)
		light.ShowBulbMesh = true
		expect(light.ShowBulbMesh).to.equal(true)
		light.StaticBulbMesh = false
		expect(light.StaticBulbMesh).to.equal(false)
		light.StaticBulbMesh = true
		expect(light.StaticBulbMesh).to.equal(true)
		light.ShowReflectionOnBall = false
		expect(light.ShowReflectionOnBall).to.equal(false)
		light.ShowReflectionOnBall = true
		expect(light.ShowReflectionOnBall).to.equal(true)
		light.ScaleBulbMesh = 40
		expect(light.ScaleBulbMesh).to.equal(40)
		light.BulbModulateVsAdd = 33
		expect(light.BulbModulateVsAdd).to.equal(33)
		light.BulbHaloHeight = 65
		expect(light.BulbHaloHeight).to.equal(65)
		light.Visible = false
		expect(light.Visible).to.equal(false)
		light.Visible = true
		expect(light.Visible).to.equal(true)
	})

	it('should support case-insensitive state and color proxy access from VBScript', async () => {
		const light = table.lights.Surface.getApi() as any
		light.state = 0.5
		expect(light.State).to.equal(0.5)
		light.color = 0xff00ff
		expect(light.Color).to.equal(0xff00ff)
		light.colorfull = 0x00ffff
		expect(light.ColorFull).to.equal(0x00ffff)
	})

	it('should report the live in-play state', async () => {
		const light = table.lights.Surface.getApi()
		light.State = Enums.LightStatus.LightStateOn
		expect(light.GetInPlayState()).to.equal(Enums.LightStatus.LightStateOn)
		expect(light.GetInPlayStateBool()).to.equal(true)
		light.State = 0.5
		expect(light.GetInPlayState()).to.equal(0.5)
		expect(light.GetInPlayStateBool()).to.equal(true)
		light.State = Enums.LightStatus.LightStateOff
		expect(light.GetInPlayState()).to.equal(Enums.LightStatus.LightStateOff)
		expect(light.GetInPlayStateBool()).to.equal(false)
	})

	it('should resolve the in-play bool from the blink pattern', async () => {
		const light = table.lights.Surface.getApi()
		light.BlinkPattern = '01'
		light.State = Enums.LightStatus.LightStateBlinking
		expect(light.GetInPlayState()).to.equal(Enums.LightStatus.LightStateBlinking)
		expect(light.GetInPlayStateBool()).to.equal(false)
		light.BlinkPattern = '10'
		light.State = Enums.LightStatus.LightStateBlinking
		expect(light.GetInPlayStateBool()).to.equal(true)
	})

	it('should report the live in-play intensity', async () => {
		const light = table.lights.Surface.getApi()
		light.Fader = Enums.Fader.None
		light.Intensity = 10
		light.IntensityScale = 2
		light.State = Enums.LightStatus.LightStateOn
		player.simulateTime(20)
		expect(light.GetInPlayIntensity()).to.equal(20)
		light.State = Enums.LightStatus.LightStateOff
		player.simulateTime(40)
		expect(light.GetInPlayIntensity()).to.equal(0)
	})

	it('should report the filament temperature of the live intensity', async () => {
		const light = table.lights.Surface.getApi()
		light.Fader = Enums.Fader.None
		light.Intensity = 10
		light.IntensityScale = 1
		light.State = Enums.LightStatus.LightStateOn
		player.simulateTime(20)
		expect(light.FilamentTemperature).to.be.closeTo(2700, 1)
		light.State = Enums.LightStatus.LightStateOff
		player.simulateTime(40)
		expect(light.FilamentTemperature).to.equal(1500)
		light.Intensity = 0
		player.simulateTime(60)
		expect(light.FilamentTemperature).to.equal(293)
	})

	it('should read and write the shadow mode', async () => {
		const light = table.lights.Surface.getApi()
		expect(light.Shadows).to.equal(Enums.ShadowMode.None)
		light.Shadows = Enums.ShadowMode.RaytracedBallShadows
		expect(light.Shadows).to.equal(Enums.ShadowMode.RaytracedBallShadows)
		expect(table.lights.Surface.data.shadows).to.equal(Enums.ShadowMode.RaytracedBallShadows)
	})
})

describe('The VPinball light state clamping', () => {
	function makeApi() {
		const table = new TableBuilder().build()
		const light = new Light(new LightData('Light1'))
		light.setupPlayer({ getPhysics: () => ({ timeMsec: 0 }) } as unknown as Player, table)
		return { light, api: light.getApi() }
	}

	it('should clamp legacy script states to on while preserving blinking', async () => {
		const { light, api } = makeApi()
		api.State = 255
		expect(api.State).to.equal(Enums.LightStatus.LightStateOn)
		expect(light.data.state).to.equal(Enums.LightStatus.LightStateOn)
		api.State = -1
		expect(api.State).to.equal(Enums.LightStatus.LightStateOn)
		api.State = Enums.LightStatus.LightStateBlinking
		expect(api.State).to.equal(Enums.LightStatus.LightStateBlinking)
		api.State = 0.5
		expect(api.State).to.equal(0.5)
	})

	it('should clamp the loaded state', async () => {
		async function loadWith(tag: string, write: (view: DataView) => void): Promise<LightData> {
			const record = new Uint8Array(20)
			const view = new DataView(record.buffer)
			view.setInt32(0, 8, true)
			record.set(
				Array.from(tag).map(c => c.charCodeAt(0)),
				4,
			)
			write(view)
			view.setInt32(12, 4, true)
			record.set([0x45, 0x4e, 0x44, 0x42], 16) // ENDB
			const storage = {
				async streamFiltered(
					_name: string,
					_offset: number,
					next: (result: ReadResult) => Promise<number | null>,
				): Promise<void> {
					let pos = 0
					while (pos < record.length) {
						const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
						if (consumed === null) break
						pos += consumed
					}
				},
			}
			return LightData.fromStorage(storage as unknown as Storage, 'Light1')
		}
		expect((await loadWith('STAT', view => view.setInt32(8, 255, true))).state).to.equal(1)
		expect((await loadWith('STTF', view => view.setFloat32(8, -1, true))).state).to.equal(1)
		expect((await loadWith('STTF', view => view.setFloat32(8, 2, true))).state).to.equal(2)
	})
})
