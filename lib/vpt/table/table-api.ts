// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { VP_VERSION_MAJOR, VP_VERSION_MINOR, VP_VERSION_REV } from '../../index.js'
import { clamp } from '../../math/functions.js'
import {
	DEFAULT_TABLE_GRAVITY,
	DEFAULT_TABLE_MAX_SLOPE,
	DEFAULT_TABLE_MIN_SLOPE,
	GRAVITYCONST,
} from '../../physics/constants.js'
import { Enums } from '../enums.js'
import { dequantizeUnsignedPercent, ItemApi, quantizeUnsignedPercent } from '../item-api.js'
import type { Table } from './table.js'
import { TableData } from './table-data.js'

/** Table API.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
export class TableApi extends ItemApi<TableData> {
	private readonly global3DMaxSeparation = 0.3
	private readonly global3DZPD = 0.5
	private readonly global3DOffset = 0.0
	private readonly globalDetailLevel = 10
	private readonly overrideMinSlope = DEFAULT_TABLE_MIN_SLOPE
	private readonly overrideMaxSlope = DEFAULT_TABLE_MAX_SLOPE
	private readonly overrideGravityConstant = DEFAULT_TABLE_GRAVITY

	private currentBackglassMode: number

	constructor(data: TableData, events: EventProxy, player: Player, table: Table) {
		super(data, events, player, table)
		this.currentBackglassMode = data.bgCurrentSet
	}

	/** Get FileName. */
	get FileName() {
		return this.data.getName()
	}
	/** Get MaxSeparation. */
	get MaxSeparation() {
		return this.data.overwriteGlobalStereo3D ? this.data._3DmaxSeparation : this.global3DMaxSeparation
	}
	/** Set MaxSeparation. */
	set MaxSeparation(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DmaxSeparation = v
		}
	}
	/** Get ZPD. */
	get ZPD() {
		return this.data.overwriteGlobalStereo3D ? this.data._3DZPD : this.global3DZPD
	}
	/** Set ZPD. */
	set ZPD(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DZPD = v
		}
	}
	/** Get Offset. */
	get Offset() {
		return this.data.overwriteGlobalStereo3D ? this.data._3DOffset : this.global3DOffset
	}
	/** Set Offset. */
	set Offset(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DOffset = v
		}
	}
	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	/** Set Image. */
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	/** Get DisplayGrid. */
	get DisplayGrid() {
		return this.data.showGrid
	}
	/** Set DisplayGrid. */
	set DisplayGrid(v) {
		this.data.showGrid = v
	}
	/** Get DisplayBackdrop. */
	get DisplayBackdrop() {
		return this.data.displayBackdrop
	}
	/** Set DisplayBackdrop. */
	set DisplayBackdrop(v) {
		this.data.displayBackdrop = v
	}
	/** Get GlassHeight. */
	get GlassHeight() {
		return this.data.glassHeight
	}
	/** Set GlassHeight. */
	set GlassHeight(v) {
		this.data.glassHeight = v
	}
	/** Get TableHeight. */
	get TableHeight() {
		return this.data.tableHeight
	}
	/** Set TableHeight. */
	set TableHeight(v) {
		this.data.tableHeight = v
	}
	/** Get Width. */
	get Width() {
		return this.data.right - this.data.left
	}
	/** Set Width. */
	set Width(v) {
		this.data.right = v
	}
	/** Get Height. */
	get Height() {
		return this.data.bottom - this.data.top
	}
	/** Set Height. */
	set Height(v) {
		this.data.bottom = v
	}
	/** Get PlayfieldMaterial. */
	get PlayfieldMaterial() {
		return this.data.szPlayfieldMaterial
	}
	/** Set PlayfieldMaterial. */
	set PlayfieldMaterial(v) {
		this.data.szPlayfieldMaterial = v
	}
	/** Get LightAmbient. */
	get LightAmbient() {
		return this.data.lightAmbient
	}
	/** Set LightAmbient. */
	set LightAmbient(v) {
		this.data.lightAmbient = v
	}
	/** Get Light0Emission. */
	get Light0Emission() {
		return 1
	} // TODO https://github.com/vpdb/vpx-js/issues/75
	/** Set Light0Emission. */
	set Light0Emission(v) {
		/* TODO https://github.com/vpdb/vpx-js/issues/75 */
	}
	/** Get LightHeight. */
	get LightHeight() {
		return this.data.lightHeight
	}
	/** Set LightHeight. */
	set LightHeight(v) {
		this.data.lightHeight = v
	}
	/** Get LightRange. */
	get LightRange() {
		return this.data.lightRange
	}
	/** Set LightRange. */
	set LightRange(v) {
		this.data.lightRange = v
	}
	/** Get LightEmissionScale. */
	get LightEmissionScale() {
		return this.data.lightEmissionScale
	}
	/** Set LightEmissionScale. */
	set LightEmissionScale(v) {
		this.data.lightEmissionScale = v
	}
	/** Get NightDay. */
	get NightDay() {
		return quantizeUnsignedPercent(this.data.globalEmissionScale!)
	}
	/** Set NightDay. */
	set NightDay(v) {
		this.data.globalEmissionScale = dequantizeUnsignedPercent(v)
	}
	/** Get AOScale. */
	get AOScale() {
		return this.data.aoScale
	}
	/** Set AOScale. */
	set AOScale(v) {
		this.data.aoScale = v
	}
	/** Get SSRScale. */
	get SSRScale() {
		return this.data.ssrScale
	}
	/** Set SSRScale. */
	set SSRScale(v) {
		this.data.ssrScale = v
	}
	/** Get EnvironmentEmissionScale. */
	get EnvironmentEmissionScale() {
		return this.data.envEmissionScale
	}
	/** Set EnvironmentEmissionScale. */
	set EnvironmentEmissionScale(v) {
		this.data.envEmissionScale = v
	}
	/** Get BallReflection. */
	get BallReflection() {
		return this.data.useReflectionForBalls
	}
	/** Set BallReflection. */
	set BallReflection(v) {
		this.data.useReflectionForBalls = v
	}
	/** Get PlayfieldReflectionStrength. */
	get PlayfieldReflectionStrength() {
		return quantizeUnsignedPercent(this.data.playfieldReflectionStrength)
	}
	/** Set PlayfieldReflectionStrength. */
	set PlayfieldReflectionStrength(v) {
		this.data.playfieldReflectionStrength = dequantizeUnsignedPercent(v)
	}
	/** Get BallTrail. */
	get BallTrail() {
		return this.data.useTrailForBalls
	}
	/** Set BallTrail. */
	set BallTrail(v) {
		this.data.useTrailForBalls = v
	}
	/** Get TrailStrength. */
	get TrailStrength() {
		return quantizeUnsignedPercent(this.data.ballTrailStrength)
	}
	/** Set TrailStrength. */
	set TrailStrength(v) {
		this.data.ballTrailStrength = dequantizeUnsignedPercent(v)
	}
	/** Get BallPlayfieldReflectionScale. */
	get BallPlayfieldReflectionScale() {
		return this.data.ballPlayfieldReflectionStrength
	}
	/** Set BallPlayfieldReflectionScale. */
	set BallPlayfieldReflectionScale(v) {
		this.data.ballPlayfieldReflectionStrength = v
	}
	/** Get DefaultBulbIntensityScale. */
	get DefaultBulbIntensityScale() {
		return this.data.defaultBulbIntensityScaleOnBall
	}
	/** Set DefaultBulbIntensityScale. */
	set DefaultBulbIntensityScale(v) {
		this.data.defaultBulbIntensityScaleOnBall = v
	}
	/** Get BloomStrength. */
	get BloomStrength() {
		return this.data.bloomStrength
	}
	/** Set BloomStrength. */
	set BloomStrength(v) {
		this.data.bloomStrength = v
	}
	/** Get TableSoundVolume. */
	get TableSoundVolume() {
		return quantizeUnsignedPercent(this.data.tableSoundVolume)
	}
	/** Set TableSoundVolume. */
	set TableSoundVolume(v) {
		this.data.tableSoundVolume = dequantizeUnsignedPercent(v)
	}
	/** Get DetailLevel. */
	get DetailLevel() {
		return this.data.overwriteGlobalDetailLevel ? this.data.userDetailLevel : this.globalDetailLevel
	}
	/** Set DetailLevel. */
	set DetailLevel(v) {
		if (this.data.overwriteGlobalDetailLevel) {
			this.data.userDetailLevel = v
		}
	}
	/** Get GlobalAlphaAcc. */
	get GlobalAlphaAcc() {
		return this.data.overwriteGlobalDetailLevel
	}
	/** Set GlobalAlphaAcc. */
	set GlobalAlphaAcc(v) {
		this.data.overwriteGlobalDetailLevel = v
		if (!this.data.overwriteGlobalDetailLevel) {
			this.data.userDetailLevel = this.globalDetailLevel
		}
	}
	/** Get GlobalDayNight. */
	get GlobalDayNight() {
		return this.data.overwriteGlobalDayNight
	}
	/** Set GlobalDayNight. */
	set GlobalDayNight(v) {
		this.data.overwriteGlobalDayNight = v
	}
	/** Get GlobalStereo3D. */
	get GlobalStereo3D() {
		return this.data.overwriteGlobalStereo3D
	}
	/** Set GlobalStereo3D. */
	set GlobalStereo3D(v) {
		this.data.overwriteGlobalStereo3D = v
		if (!this.data.overwriteGlobalStereo3D) {
			this.data._3DmaxSeparation = this.global3DMaxSeparation
			this.data._3DZPD = this.global3DZPD
			this.data._3DOffset = this.global3DOffset
			this.data.userDetailLevel = this.globalDetailLevel
		}
	}
	/** Get BallDecalMode. */
	get BallDecalMode() {
		return this.data.ballDecalMode
	}
	/** Set BallDecalMode. */
	set BallDecalMode(v) {
		this.data.ballDecalMode = v
	}
	/** Get TableMusicVolume. */
	get TableMusicVolume() {
		return quantizeUnsignedPercent(this.data.tableMusicVolume)
	}
	/** Set TableMusicVolume. */
	set TableMusicVolume(v) {
		this.data.tableMusicVolume = dequantizeUnsignedPercent(v)
	}
	/** Get TableAdaptiveVSync. */
	get TableAdaptiveVSync() {
		return this.data.tableAdaptiveVSync
	}
	/** Set TableAdaptiveVSync. */
	set TableAdaptiveVSync(v) {
		this.data.tableAdaptiveVSync = v
	}
	/** Get BackdropColor. */
	get BackdropColor() {
		return this.data.colorBackdrop
	}
	/** Set BackdropColor. */
	set BackdropColor(v) {
		this.data.colorBackdrop = v
	}
	/** Get BackdropImageApplyNightDay. */
	get BackdropImageApplyNightDay() {
		return this.data.imageBackdropNightDay
	}
	/** Set BackdropImageApplyNightDay. */
	set BackdropImageApplyNightDay(v) {
		this.data.imageBackdropNightDay = v
	}
	/** Get ShowFSS. */
	get ShowFSS() {
		return this.data.bgEnableFss
	}
	/** Set ShowFSS. */
	set ShowFSS(v) {
		this.data.bgEnableFss = v
	}
	/** Get BackdropImage_DT. */
	get BackdropImage_DT() {
		return this.data.bgImage[Enums.BackglassIndex.DESKTOP]
	}
	/** Set BackdropImage_DT. */
	set BackdropImage_DT(v) {
		this.data.bgImage[Enums.BackglassIndex.DESKTOP] = v
	}
	/** Get BackdropImage_FS. */
	get BackdropImage_FS() {
		return this.data.bgImage[Enums.BackglassIndex.FULLSCREEN]
	}
	/** Set BackdropImage_FS. */
	set BackdropImage_FS(v) {
		this.data.bgImage[Enums.BackglassIndex.FULLSCREEN] = v
	}
	/** Get BackdropImage_FSS. */
	get BackdropImage_FSS() {
		return this.data.bgImage[Enums.BackglassIndex.FULL_SINGLE_SCREEN]
	}
	/** Set BackdropImage_FSS. */
	set BackdropImage_FSS(v) {
		this.data.bgImage[Enums.BackglassIndex.FULL_SINGLE_SCREEN] = v
	}
	/** Get ColorGradeImage. */
	get ColorGradeImage() {
		return this.data.szImageColorGrade
	}
	/** Set ColorGradeImage. */
	set ColorGradeImage(v) {
		const tex = this.table.getTexture(v)
		if (tex && (tex.width !== 256 || tex.height !== 16)) {
			throw new Error('Wrong image size, needs to be 256x16 resolution')
		}
		this.data.szImageColorGrade = v
	}
	/** Get Gravity. */
	get Gravity() {
		return this.data.gravity / GRAVITYCONST
	}
	/** Set Gravity. */
	set Gravity(v) {
		this.data.gravity = v * GRAVITYCONST
		const minSlope = this.data.overridePhysics ? this.overrideMinSlope : this.data.angletiltMin
		const maxSlope = this.data.overridePhysics ? this.overrideMaxSlope : this.data.angleTiltMax
		const slope = minSlope + (maxSlope - minSlope) * this.data.globalDifficulty
		this.player.setGravity(slope, this.data.overridePhysics ? this.overrideGravityConstant : this.data.gravity)
	}
	/** Get Friction. */
	get Friction() {
		return this.data.friction
	}
	/** Set Friction. */
	set Friction(v) {
		this.data.friction = clamp(v, 0, 1)
	}
	/** Get Elasticity. */
	get Elasticity() {
		return this.data.elasticity
	}
	/** Set Elasticity. */
	set Elasticity(v) {
		this.data.elasticity = v
	}
	/** Get ElasticityFalloff. */
	get ElasticityFalloff() {
		return this.data.elasticityFalloff
	}
	/** Set ElasticityFalloff. */
	set ElasticityFalloff(v) {
		this.data.elasticityFalloff = v
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	/** Set Scatter. */
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get DefaultScatter. */
	get DefaultScatter() {
		return this.data.defaultScatter
	}
	/** Set DefaultScatter. */
	set DefaultScatter(v) {
		this.data.defaultScatter = v
	}
	/** Get NudgeTime. */
	get NudgeTime() {
		return this.data.nudgeTime
	}
	/** Set NudgeTime. */
	set NudgeTime(v) {
		this.data.nudgeTime = v
	}
	/** Get PlungerNormalize. */
	get PlungerNormalize() {
		return this.data.plungerNormalize
	}
	/** Set PlungerNormalize. */
	set PlungerNormalize(v) {
		this.data.plungerNormalize = v
	}
	/** Get PlungerFilter. */
	get PlungerFilter() {
		return this.data.plungerFilter
	}
	/** Set PlungerFilter. */
	set PlungerFilter(v) {
		this.data.plungerFilter = v
	}
	/** Get PhysicsLoopTime. */
	get PhysicsLoopTime() {
		return this.data.physicsMaxLoops
	}
	/** Set PhysicsLoopTime. */
	set PhysicsLoopTime(v) {
		this.data.physicsMaxLoops = v
	}
	/** Get BackglassMode. */
	get BackglassMode() {
		return this.currentBackglassMode + TableData.BGI_DESKTOP
	}
	/** Set BackglassMode. */
	set BackglassMode(v) {
		this.currentBackglassMode = v - TableData.BGI_DESKTOP
	}
	/** Get FieldOfView. */
	get FieldOfView() {
		return this.data.bgFov[this.currentBackglassMode]
	}
	/** Set FieldOfView. */
	set FieldOfView(v) {
		this.data.bgFov[this.currentBackglassMode] = v
	}
	/** Get Inclination. */
	get Inclination() {
		return this.data.bgInclination[this.currentBackglassMode]
	}
	/** Set Inclination. */
	set Inclination(v) {
		this.data.bgInclination[this.currentBackglassMode] = v
	}
	/** Get Layback. */
	get Layback() {
		return this.data.bgLayback[this.currentBackglassMode]
	}
	/** Set Layback. */
	set Layback(v) {
		this.data.bgLayback[this.currentBackglassMode] = v
	}
	/** Get Rotation. */
	get Rotation() {
		return this.data.bgRotation[this.currentBackglassMode]
	}
	/** Set Rotation. */
	set Rotation(v) {
		this.data.bgRotation[this.currentBackglassMode] = v
	}
	/** Get Scalex. */
	get Scalex() {
		return this.data.bgScaleX[this.currentBackglassMode]
	}
	/** Set Scalex. */
	set Scalex(v) {
		this.data.bgScaleX[this.currentBackglassMode] = v
	}
	/** Get Scaley. */
	get Scaley() {
		return this.data.bgScaleY[this.currentBackglassMode]
	}
	/** Set Scaley. */
	set Scaley(v) {
		this.data.bgScaleY[this.currentBackglassMode] = v
	}
	/** Get Scalez. */
	get Scalez() {
		return this.data.bgScaleZ[this.currentBackglassMode]
	}
	/** Set Scalez. */
	set Scalez(v) {
		this.data.bgScaleZ[this.currentBackglassMode] = v
	}
	/** Get Xlatex. */
	get Xlatex() {
		return this.data.bgXlateX[this.currentBackglassMode]
	}
	/** Set Xlatex. */
	set Xlatex(v) {
		this.data.bgXlateX[this.currentBackglassMode] = v
	}
	/** Get Xlatey. */
	get Xlatey() {
		return this.data.bgXlateY[this.currentBackglassMode]
	}
	/** Set Xlatey. */
	set Xlatey(v) {
		this.data.bgXlateY[this.currentBackglassMode] = v
	}
	/** Get Xlatez. */
	get Xlatez() {
		return this.data.bgXlateZ[this.currentBackglassMode]
	}
	/** Set Xlatez. */
	set Xlatez(v) {
		this.data.bgXlateZ[this.currentBackglassMode] = v
	}
	/** Get SlopeMax. */
	get SlopeMax() {
		return this.data.angleTiltMax
	}
	/** Set SlopeMax. */
	set SlopeMax(v) {
		this.data.angleTiltMax = v
		const slope =
			this.data.angletiltMin + (this.data.angleTiltMax - this.data.angletiltMin) * this.data.globalDifficulty
		this.player.setGravity(slope, this.data.overridePhysics ? this.overrideGravityConstant : this.data.gravity)
	}
	/** Get SlopeMin. */
	get SlopeMin() {
		return this.data.angletiltMin
	}
	/** Set SlopeMin. */
	set SlopeMin(v) {
		this.data.angletiltMin = v
		const slope =
			this.data.angletiltMin + (this.data.angleTiltMax - this.data.angletiltMin) * this.data.globalDifficulty
		this.player.setGravity(slope, this.data.overridePhysics ? this.overrideGravityConstant : this.data.gravity)
	}
	/** Get BallImage. */
	get BallImage() {
		return this.data.szBallImage
	}
	/** Set BallImage. */
	set BallImage(v) {
		this.data.szBallImage = v
	}
	/** Get EnvironmentImage. */
	get EnvironmentImage() {
		return this.data.szEnvImage
	}
	/** Set EnvironmentImage. */
	set EnvironmentImage(v) {
		const tex = this.table.getTexture(v)
		if (tex && tex.width !== tex.height * 2) {
			throw new Error('Wrong image size, needs to be 2x width in comparison to height')
		}
		this.data.szEnvImage = v
	}
	get YieldTime(): unknown {
		throw new Error('Not supported in play.')
	}
	/** Set YieldTime. */
	set YieldTime(v: unknown) {
		throw new Error('Not supported in play.')
	}
	/** Get EnableAntialiasing. */
	get EnableAntialiasing() {
		return this.data.useAA
	}
	/** Set EnableAntialiasing. */
	set EnableAntialiasing(v) {
		this.data.useAA = v
	}
	/** Get EnableSSR. */
	get EnableSSR() {
		return this.data.useSSR
	}
	/** Set EnableSSR. */
	set EnableSSR(v) {
		this.data.useSSR = v
	}
	/** Get EnableAO. */
	get EnableAO() {
		return this.data.useAO
	}
	/** Set EnableAO. */
	set EnableAO(v) {
		this.data.useAO = v
	}
	/** Get EnableFXAA. */
	get EnableFXAA() {
		return this.data.useFXAA
	}
	/** Set EnableFXAA. */
	set EnableFXAA(v) {
		this.data.useFXAA = v
	}
	/** Get OverridePhysics. */
	get OverridePhysics() {
		return this.data.overridePhysics
	}
	/** Set OverridePhysics. */
	set OverridePhysics(v) {
		this.data.overridePhysics = v
	}
	/** Get OverridePhysicsFlippers. */
	get OverridePhysicsFlippers() {
		return this.data.overridePhysicsFlipper
	}
	/** Set OverridePhysicsFlippers. */
	set OverridePhysicsFlippers(v) {
		this.data.overridePhysicsFlipper = v
	}
	/** Get EnableDecals. */
	get EnableDecals() {
		return this.data.renderDecals
	}
	/** Set EnableDecals. */
	set EnableDecals(v) {
		this.data.renderDecals = v
	}
	/** Get ShowDT. */
	get ShowDT() {
		return (
			this.data.bgCurrentSet === Enums.BackglassIndex.DESKTOP ||
			this.data.bgCurrentSet === Enums.BackglassIndex.FULL_SINGLE_SCREEN
		)
	}
	/** Set ShowDT. */
	set ShowDT(v) {
		this.data.bgCurrentSet = v
			? this.data.bgEnableFss
				? Enums.BackglassIndex.FULL_SINGLE_SCREEN
				: Enums.BackglassIndex.DESKTOP
			: Enums.BackglassIndex.FULLSCREEN
	}
	/** Get ReflectElementsOnPlayfield. */
	get ReflectElementsOnPlayfield() {
		return this.data.reflectElementsOnPlayfield
	}
	/** Set ReflectElementsOnPlayfield. */
	set ReflectElementsOnPlayfield(v) {
		this.data.reflectElementsOnPlayfield = v
	}
	/** Get EnableEMReels. */
	get EnableEMReels() {
		return this.data.renderEMReels
	}
	/** Set EnableEMReels. */
	set EnableEMReels(v) {
		this.data.renderEMReels = v
	}
	/** Get GlobalDifficulty. */
	get GlobalDifficulty() {
		return this.data.globalDifficulty * 100
	}
	/** Set GlobalDifficulty. */
	set GlobalDifficulty(v) {
		this.data.globalDifficulty = clamp(v, 0, 100) / 100.0
	}
	/** Get Accelerometer. */
	get Accelerometer() {
		return false
	}
	/** Set Accelerometer. */
	set Accelerometer(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get AccelNormalMount. */
	get AccelNormalMount() {
		return false
	}
	/** Set AccelNormalMount. */
	set AccelNormalMount(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get AccelerometerAngle. */
	get AccelerometerAngle() {
		return 0.0
	}
	/** Set AccelerometerAngle. */
	set AccelerometerAngle(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get DeadZone. */
	get DeadZone() {
		return 0
	}
	/** Set DeadZone. */
	set DeadZone(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get BallFrontDecal. */
	get BallFrontDecal() {
		return this.data.szBallImageFront
	}
	/** Set BallFrontDecal. */
	set BallFrontDecal(v) {
		this._assertNonHdrImage(v)
		this.data.szBallImageFront = v
	}
	/** Get Version. */
	get Version() {
		return VP_VERSION_MAJOR * 1000 + VP_VERSION_MINOR * 100 + VP_VERSION_REV
	}
	/** Get VPBuildVersion. */
	get VPBuildVersion() {
		return VP_VERSION_MAJOR * 1000 + VP_VERSION_MINOR * 100 + VP_VERSION_REV
	}
	/** Get VersionMajor. */
	get VersionMajor() {
		return VP_VERSION_MAJOR
	}
	/** Get VersionMinor. */
	get VersionMinor() {
		return VP_VERSION_MINOR
	}
	/** Get VersionRevision. */
	get VersionRevision() {
		return VP_VERSION_REV
	}

	public PlaySound(
		bstr: string,
		loopcount: number,
		volume: number,
		pan: number,
		randompitch: number,
		pitch: number,
		usesame: boolean,
		restart: boolean,
		frontRearFade: number,
	) {
		// TODO implement sound
	}

	public GetPredefinedStrings(dispID: number): any {
		// TODO implement
	}

	public GetPredefinedValue(dispID: number): any {
		// TODO implement
	}

	public ImportPhysics(): void {
		// to implement, or probably not.
	}

	public ExportPhysics(): void {
		// to implement, or probably not.
	}

	public FireKnocker(count: number): void {
		// TODO implement
	}

	public QuitPlayer(closeType: number): void {
		// TODO implement
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TableApi.prototype)
	}
}
