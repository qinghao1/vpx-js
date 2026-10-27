// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import { type SinonSpy, spy } from 'sinon'
import sinonChai from 'sinon-chai'
import { ThreeHelper } from '../../../test/three.helper'
import { Player } from '../../game/player.js'
import { VP_VERSION_MAJOR, VP_VERSION_MINOR, VP_VERSION_REV } from '../../index.js'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../../physics/constants.js'
import { Enums } from '../enums.js'
import { Table } from '../table/table.js'
import { BG_DESKTOP, BG_FSS, BG_FULLSCREEN } from './table-data.js'

chai.use((sinonChai as any).default ?? sinonChai)
const three = new ThreeHelper()

describe('The VPinball table API', () => {
	let table: Table
	let _player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
		_player = new Player(table).init()
	})

	it('should read the file name and stereo3D overrides', () => {
		const api = table.getApi()

		expect(api.FileName).to.equal(api.Name)

		api.GlobalStereo3D = false
		expect(api.GlobalStereo3D).to.equal(false)
		api.MaxSeparation = 23
		expect(api.MaxSeparation).to.equal(0.3)
		api.ZPD = 23
		expect(api.ZPD).to.equal(0.5)
		api.Offset = 23
		expect(api.Offset).to.equal(0.0)

		api.GlobalStereo3D = true
		expect(api.GlobalStereo3D).to.equal(true)
		api.MaxSeparation = 1243
		expect(api.MaxSeparation).to.equal(1243)
		api.ZPD = 0.55
		expect(api.ZPD).to.equal(0.55)
		api.Offset = 1.6
		expect(api.Offset).to.equal(1.6)
	})

	it('should read and write playfield image and grid flags', () => {
		const api = table.getApi()

		api.Image = 'test_pattern_png'
		expect(api.Image).to.equal('test_pattern_png')
		api.DisplayGrid = true
		expect(api.DisplayGrid).to.equal(true)
		api.DisplayGrid = false
		expect(api.DisplayGrid).to.equal(false)
		api.DisplayBackdrop = true
		expect(api.DisplayBackdrop).to.equal(true)
		api.DisplayBackdrop = false
		expect(api.DisplayBackdrop).to.equal(false)
	})

	it('should read glass height and dimensions, and no-op TableHeight back to 0', () => {
		const api = table.getApi()

		api.GlassHeight = 55.6
		expect(api.GlassHeight).to.equal(55.6)
		// Deprecated upstream: the setter is a no-op and the getter reads back 0.
		api.TableHeight = 98.1
		expect(api.TableHeight).to.equal(0)
		api.Width = 580
		expect(api.Width).to.equal(580)
		api.Height = 1500
		expect(api.Height).to.equal(1500)
	})

	it('should read and write playfield material and lights', () => {
		const api = table.getApi()

		api.PlayfieldMaterial = 'pfmat'
		expect(api.PlayfieldMaterial).to.equal('pfmat')
		api.LightAmbient = 3.2
		expect(api.LightAmbient).to.equal(3.2)
		api.LightHeight = 995
		expect(api.LightHeight).to.equal(995)
		api.LightRange = 5.4
		expect(api.LightRange).to.equal(5.4)
		api.LightEmissionScale = 0.8
		expect(api.LightEmissionScale).to.equal(0.8)
	})

	it('should read and write night-day and ambient occlusion scales', () => {
		const api = table.getApi()

		api.NightDay = 80
		expect(api.NightDay).to.equal(80)
		api.NightDay = 200
		expect(api.NightDay).to.equal(100)
		api.NightDay = -10
		expect(api.NightDay).to.equal(0)
		api.AOScale = 1.8
		expect(api.AOScale).to.equal(1.8)
		api.SSRScale = 1.6
		expect(api.SSRScale).to.equal(1.6)
		api.EnvironmentEmissionScale = 0.2
		expect(api.EnvironmentEmissionScale).to.equal(0.2)
	})

	it('should read and write ball reflection and trail strengths', () => {
		const api = table.getApi()

		api.BallReflection = 4
		expect(api.BallReflection).to.equal(4)
		api.PlayfieldReflectionStrength = 41
		expect(api.PlayfieldReflectionStrength).to.equal(41)
		api.BallTrail = 1.5
		expect(api.BallTrail).to.equal(1.5)
		api.TrailStrength = 89
		expect(api.TrailStrength).to.equal(89)
		api.BallPlayfieldReflectionScale = 5.12
		expect(api.BallPlayfieldReflectionScale).to.equal(5.12)
	})

	it('should read and write bulb intensity, bloom, and sound volume', () => {
		const api = table.getApi()

		api.DefaultBulbIntensityScale = 2314
		expect(api.DefaultBulbIntensityScale).to.equal(2314)
		api.BloomStrength = 13
		expect(api.BloomStrength).to.equal(13)
		api.TableSoundVolume = 10
		expect(api.TableSoundVolume).to.equal(10)
	})

	it('should toggle detail level through GlobalAlphaAcc', () => {
		const api = table.getApi()

		api.GlobalAlphaAcc = true
		expect(api.GlobalAlphaAcc).to.equal(true)
		api.DetailLevel = 2
		expect(api.DetailLevel).to.equal(2)
		api.GlobalAlphaAcc = false
		expect(api.DetailLevel).to.equal(10)
		api.DetailLevel = 11
		expect(api.DetailLevel).to.equal(10)
	})

	it('should read and write day-night, decals, music, vsync, and backdrop', () => {
		const api = table.getApi()

		api.GlobalDayNight = false
		expect(api.GlobalDayNight).to.equal(false)
		api.GlobalDayNight = true
		expect(api.GlobalDayNight).to.equal(true)
		api.BallDecalMode = false
		expect(api.BallDecalMode).to.equal(false)
		api.BallDecalMode = true
		expect(api.BallDecalMode).to.equal(true)
		api.TableMusicVolume = 16
		expect(api.TableMusicVolume).to.equal(16)
		api.TableAdaptiveVSync = 2314
		expect(api.TableAdaptiveVSync).to.equal(2314)
		api.BackdropColor = 0x4f9a29
		expect(api.BackdropColor).to.equal(0x4f9a29)
		api.BackdropImageApplyNightDay = false
		expect(api.BackdropImageApplyNightDay).to.equal(false)
		api.BackdropImageApplyNightDay = true
		expect(api.BackdropImageApplyNightDay).to.equal(true)
	})

	it('should read and write FSS and backdrop images', () => {
		const api = table.getApi()

		api.ShowFSS = true
		expect(api.ShowFSS).to.equal(true)
		api.ShowFSS = false
		expect(api.ShowFSS).to.equal(false)
		api.BackdropImage_DT = 'bgdt'
		expect(api.BackdropImage_DT).to.equal('bgdt')
		api.BackdropImage_FS = 'bgfs'
		expect(api.BackdropImage_FS).to.equal('bgfs')
		api.BackdropImage_FSS = 'bgfss'
		expect(api.BackdropImage_FSS).to.equal('bgfss')
		expect(() => (api.ColorGradeImage = 'test_pattern_jpg')).to.throw(
			'Wrong image size, needs to be 256x16 resolution',
		)
	})

	it('should read and write gravity and surface physics', () => {
		const api = table.getApi()

		api.Gravity = 1
		expect(api.Gravity).to.equal(1)
		api.Gravity = -5
		expect(api.Gravity).to.equal(0)
		api.Friction = 0.6
		expect(api.Friction).to.equal(0.6)
		api.Friction = -1
		expect(api.Friction).to.equal(0)
		api.Friction = 23
		expect(api.Friction).to.equal(1)
		api.Elasticity = 85.6
		expect(api.Elasticity).to.equal(85.6)
		api.ElasticityFalloff = 65
		expect(api.ElasticityFalloff).to.equal(65)
		api.Scatter = 22.65
		expect(api.Scatter).to.equal(22.65)
		api.DefaultScatter = 2
		expect(api.DefaultScatter).to.equal(2)
	})

	it('should read and write nudge, plunger, and physics loop settings', () => {
		const api = table.getApi()

		api.NudgeTime = 0.22
		expect(api.NudgeTime).to.equal(0.22)
		api.PlungerNormalize = 98165
		expect(api.PlungerNormalize).to.equal(98165)
		api.PlungerFilter = false
		expect(api.PlungerFilter).to.equal(false)
		api.PlungerFilter = true
		expect(api.PlungerFilter).to.equal(true)
		api.PhysicsLoopTime = 120
		expect(api.PhysicsLoopTime).to.equal(120)
	})

	it('should read and write backglass-mode views', () => {
		const api = table.getApi()

		api.BackglassMode = Enums.BackglassIndex.FULL_SINGLE_SCREEN
		expect(api.BackglassMode).to.equal(112)
		api.FieldOfView = 35
		expect(api.FieldOfView).to.equal(35)
		api.Inclination = 21
		expect(api.Inclination).to.equal(21)
		api.Layback = 59
		expect(api.Layback).to.equal(59)
		api.Rotation = 59
		expect(api.Rotation).to.equal(59)
		api.Scalex = 5
		expect(api.Scalex).to.equal(5)
		api.Scaley = 6
		expect(api.Scaley).to.equal(6)
		api.Scalez = 7
		expect(api.Scalez).to.equal(7)
		api.Xlatex = 8
		expect(api.Xlatex).to.equal(8)
		api.Xlatey = 9
		expect(api.Xlatey).to.equal(9)
		api.Xlatez = 4
		expect(api.Xlatez).to.equal(4)

		api.BackglassMode = Enums.BackglassIndex.FULLSCREEN
		api.FieldOfView = 135
		expect(api.FieldOfView).to.equal(135)
		api.Inclination = 121
		expect(api.Inclination).to.equal(121)
		api.Layback = 159
		expect(api.Layback).to.equal(159)
		api.Rotation = 159
		expect(api.Rotation).to.equal(159)
		api.Scalex = 15
		expect(api.Scalex).to.equal(15)
		api.Scaley = 16
		expect(api.Scaley).to.equal(16)
		api.Scalez = 17
		expect(api.Scalez).to.equal(17)
		api.Xlatex = 18
		expect(api.Xlatex).to.equal(18)
		api.Xlatey = 19
		expect(api.Xlatey).to.equal(19)
		api.Xlatez = 14
		expect(api.Xlatez).to.equal(14)

		api.BackglassMode = Enums.BackglassIndex.FULL_SINGLE_SCREEN
		expect(api.FieldOfView).to.equal(35)
		expect(api.Inclination).to.equal(21)
		expect(api.Layback).to.equal(59)
		expect(api.Rotation).to.equal(59)
		expect(api.Scalex).to.equal(5)
		expect(api.Scaley).to.equal(6)
		expect(api.Scalez).to.equal(7)
		expect(api.Xlatex).to.equal(8)
		expect(api.Xlatey).to.equal(9)
		expect(api.Xlatez).to.equal(4)
	})

	it('should read and write slopes, ball images, and reject YieldTime', () => {
		const api = table.getApi()

		api.SlopeMax = 0.2
		expect(api.SlopeMax).to.equal(0.2)
		api.SlopeMin = 0.1
		expect(api.SlopeMin).to.equal(0.1)
		api.BallImage = 'ballimg'
		expect(api.BallImage).to.equal('ballimg')
		api.EnvironmentImage = 'test_pattern_hdr'
		expect(api.EnvironmentImage).to.equal('test_pattern_hdr')
		expect(() => (api.EnvironmentImage = 'test_pattern_jpg')).to.throw(
			'Wrong image size, needs to be 2x width in comparison to height',
		)
		expect(() => (api.YieldTime = 10)).to.throw('Not supported in play.')
		expect(() => api.YieldTime).to.throw('Not supported in play.')
	})

	it('should read and write antialiasing and physics overrides', () => {
		const api = table.getApi()

		api.EnableAntialiasing = 1.335
		expect(api.EnableAntialiasing).to.equal(1.335)
		api.EnableSSR = 12312 as unknown as boolean
		expect(api.EnableSSR).to.equal(12312)
		api.EnableAO = 51 as unknown as boolean
		expect(api.EnableAO).to.equal(51)
		api.EnableFXAA = 521
		expect(api.EnableFXAA).to.equal(521)
		api.OverridePhysics = 2
		expect(api.OverridePhysics).to.equal(2)
		api.OverridePhysicsFlippers = false
		expect(api.OverridePhysicsFlippers).to.equal(false)
		api.OverridePhysicsFlippers = true
		expect(api.OverridePhysicsFlippers).to.equal(true)
	})

	it('should read and write decals, ShowDT, and EM reels', () => {
		const api = table.getApi()

		api.EnableDecals = false
		expect(api.EnableDecals).to.equal(false)
		api.EnableDecals = true
		expect(api.EnableDecals).to.equal(true)
		api.ShowDT = false
		expect(api.ShowDT).to.equal(false)
		api.ShowDT = true
		expect(api.ShowDT).to.equal(true)
		api.ReflectElementsOnPlayfield = false
		expect(api.ReflectElementsOnPlayfield).to.equal(false)
		api.ReflectElementsOnPlayfield = true
		expect(api.ReflectElementsOnPlayfield).to.equal(true)
		api.EnableEMReels = false
		expect(api.EnableEMReels).to.equal(false)
		api.EnableEMReels = true
		expect(api.EnableEMReels).to.equal(true)
	})

	it('should read and write difficulty, accelerometer, and ball decals', () => {
		const api = table.getApi()

		api.GlobalDifficulty = 50
		expect(api.GlobalDifficulty).to.equal(50)
		api.GlobalDifficulty = 200
		expect(api.GlobalDifficulty).to.equal(100)
		api.GlobalDifficulty = -10
		expect(api.GlobalDifficulty).to.equal(0)
		api.Accelerometer = true
		expect(api.Accelerometer).to.equal(false) // no acc/ support
		api.AccelNormalMount = true
		expect(api.AccelNormalMount).to.equal(false)
		api.AccelerometerAngle = 1
		expect(api.AccelerometerAngle).to.equal(0.0)
		api.DeadZone = 1
		expect(api.DeadZone).to.equal(0)
		api.BallFrontDecal = 'test_pattern_xrgb'
		expect(api.BallFrontDecal).to.equal('test_pattern_xrgb')
	})

	it('should report the build version', () => {
		const api = table.getApi()

		const buildVersion = VP_VERSION_MAJOR * 1000 + VP_VERSION_MINOR * 100 + VP_VERSION_REV
		expect(api.Version).to.equal(buildVersion)
		expect(api.VPBuildVersion).to.equal(buildVersion)
		expect(api.VersionMajor).to.equal(VP_VERSION_MAJOR)
		expect(api.VersionMinor).to.equal(VP_VERSION_MINOR)
		expect(api.VersionRevision).to.equal(VP_VERSION_REV)
	})

	it('should use 110-based BackglassIndex values consistent with BackglassMode', () => {
		const api = table.getApi()
		expect(Enums.BackglassIndex.DESKTOP).to.equal(110)
		expect(Enums.BackglassIndex.FULLSCREEN).to.equal(111)
		expect(Enums.BackglassIndex.FULL_SINGLE_SCREEN).to.equal(112)
		api.BackglassMode = Enums.BackglassIndex.DESKTOP
		expect(api.BackglassMode).to.equal(Enums.BackglassIndex.DESKTOP)
		expect(api.FieldOfView).to.equal(table.data?.bgFov[0])
	})

	it('should report desktop and FSS modes as ShowDT', () => {
		const api = table.getApi()
		const data = table.data
		if (!data) throw new Error('table data not loaded')
		data.bgCurrentSet = BG_DESKTOP
		expect(api.ShowDT).to.equal(true)
		data.bgCurrentSet = BG_FSS
		expect(api.ShowDT).to.equal(true)
		data.bgCurrentSet = BG_FULLSCREEN
		expect(api.ShowDT).to.equal(false)
	})

	it('should select the desktop or FSS view when ShowDT is enabled', () => {
		const api = table.getApi()
		const data = table.data
		if (!data) throw new Error('table data not loaded')
		data.bgEnableFss = false
		api.ShowDT = true
		expect(data.bgCurrentSet).to.equal(BG_DESKTOP)
		data.bgEnableFss = true
		api.ShowDT = true
		expect(data.bgCurrentSet).to.equal(BG_FSS)
		expect(api.ShowDT).to.equal(true)
		api.ShowDT = false
		expect(data.bgCurrentSet).to.equal(BG_FULLSCREEN)
		expect(api.ShowDT).to.equal(false)
	})

	it('should clamp negative volumes to silence and oversized ones to full', () => {
		// Upstream converts through unsigned (negatives wrap to full volume); vpx-js clamps instead.
		const api = table.getApi()
		api.TableSoundVolume = -10
		expect(api.TableSoundVolume).to.equal(0)
		api.TableSoundVolume = 250
		expect(api.TableSoundVolume).to.equal(100)
		api.TableMusicVolume = -10
		expect(api.TableMusicVolume).to.equal(0)
		api.TableMusicVolume = 250
		expect(api.TableMusicVolume).to.equal(100)
	})

	it('should reject HDR images but store unknown names as-is', () => {
		const api = table.getApi()
		expect(() => (api.Image = 'test_pattern_hdr')).to.throw('Cannot use a HDR image (.exr/.hdr) here')
		api.Image = 'missing-texture-xyz'
		expect(api.Image).to.equal('missing-texture-xyz')
	})

	it('should not crash when executing unused APIs', () => {
		const api = table.getApi()
		api.ImportPhysics()
		api.ExportPhysics()
		api.FireKnocker(1)
	})

	it('should return the default value from Option, not the step', () => {
		const api = table.getApi()
		expect(api.Option('opt', 0, 100, 10, 80, 0)).to.equal(80)
		expect(api.Option('opt', 0, 100, 10, 80, 0, [0, 50, 100])).to.equal(80)
		expect(api._Option('opt', 0, 100, 10, 80, 0)).to.equal(80)
	})
})

describe('Table gravity coupling', () => {
	let table: Table
	let player: Player

	beforeEach(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-texture.vpx')))
		player = new Player(table).init()
		const data = table.data
		if (!data) throw new Error('table data not loaded')
		data.angletiltMin = 2
		data.angleTiltMax = 8
		data.globalDifficulty = 0.25
	})

	function lastGravityCall(setGravity: SinonSpy<[number, number], void>): [number, number] {
		expect(setGravity).to.have.been.calledOnce
		return setGravity.firstCall.args
	}

	it('should push the difficulty-lerped slope and gravity on Gravity set', () => {
		const setGravity = spy(player, 'setGravity')
		try {
			table.getApi().Gravity = 1
			const [slope, strength] = lastGravityCall(setGravity)
			expect(slope).to.be.closeTo(3.5, 1e-9)
			expect(strength).to.be.closeTo(GRAVITYCONST, 1e-9)
		} finally {
			setGravity.restore()
		}
	})

	it('should re-push gravity when a slope bound changes', () => {
		const setGravity = spy(player, 'setGravity')
		try {
			table.getApi().SlopeMax = 10
			expect(lastGravityCall(setGravity)[0]).to.be.closeTo(4, 1e-9)
		} finally {
			setGravity.restore()
		}
		const setGravity2 = spy(player, 'setGravity')
		try {
			table.getApi().SlopeMin = 4
			expect(lastGravityCall(setGravity2)[0]).to.be.closeTo(5.5, 1e-9)
		} finally {
			setGravity2.restore()
		}
	})

	it('should use the override constants when overridePhysics is set', () => {
		const data = table.data
		if (!data) throw new Error('table data not loaded')
		data.overridePhysics = 1
		const setGravity = spy(player, 'setGravity')
		try {
			table.getApi().Gravity = 0.5
			const [slope, strength] = lastGravityCall(setGravity)
			expect(slope).to.be.closeTo(6, 1e-9)
			expect(strength).to.be.closeTo(DEFAULT_TABLE_GRAVITY, 1e-9)
		} finally {
			setGravity.restore()
		}
	})
})
