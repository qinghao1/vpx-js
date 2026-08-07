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

/** Table API. */
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
	set MaxSeparation(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DmaxSeparation = v
		}
	}
	/** Get ZPD. */
	get ZPD() {
		return this.data.overwriteGlobalStereo3D ? this.data._3DZPD : this.global3DZPD
	}
	set ZPD(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DZPD = v
		}
	}
	/** Get Offset. */
	get Offset() {
		return this.data.overwriteGlobalStereo3D ? this.data._3DOffset : this.global3DOffset
	}
	set Offset(v) {
		if (this.data.overwriteGlobalStereo3D) {
			this.data._3DOffset = v
		}
	}
	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	/** Get DisplayGrid. */
	get DisplayGrid() {
		return this.data.showGrid
	}
	set DisplayGrid(v) {
		this.data.showGrid = v
	}
	/** Get DisplayBackdrop. */
	get DisplayBackdrop() {
		return this.data.displayBackdrop
	}
	set DisplayBackdrop(v) {
		this.data.displayBackdrop = v
	}
	/** Get GlassHeight. */
	get GlassHeight() {
		return this.data.glassHeight
	}
	set GlassHeight(v) {
		this.data.glassHeight = v
	}
	/** Get TableHeight. */
	get TableHeight() {
		return this.data.tableHeight
	}
	set TableHeight(v) {
		this.data.tableHeight = v
	}
	/** Get Width. */
	get Width() {
		return this.data.right - this.data.left
	}
	set Width(v) {
		this.data.right = v
	}
	/** Get Height. */
	get Height() {
		return this.data.bottom - this.data.top
	}
	set Height(v) {
		this.data.bottom = v
	}
	/** Get PlayfieldMaterial. */
	get PlayfieldMaterial() {
		return this.data.szPlayfieldMaterial
	}
	set PlayfieldMaterial(v) {
		this.data.szPlayfieldMaterial = v
	}
	/** Get LightAmbient. */
	get LightAmbient() {
		return this.data.lightAmbient
	}
	set LightAmbient(v) {
		this.data.lightAmbient = v
	}
	/** Get Light0Emission. */
	get Light0Emission() {
		return 1
	} // TODO https://github.com/vpdb/vpx-js/issues/75
	set Light0Emission(v) {
		/* TODO https://github.com/vpdb/vpx-js/issues/75 */
	}
	/** Get LightHeight. */
	get LightHeight() {
		return this.data.lightHeight
	}
	set LightHeight(v) {
		this.data.lightHeight = v
	}
	/** Get LightRange. */
	get LightRange() {
		return this.data.lightRange
	}
	set LightRange(v) {
		this.data.lightRange = v
	}
	/** Get LightEmissionScale. */
	get LightEmissionScale() {
		return this.data.lightEmissionScale
	}
	set LightEmissionScale(v) {
		this.data.lightEmissionScale = v
	}
	/** Get NightDay. */
	get NightDay() {
		return quantizeUnsignedPercent(this.data.globalEmissionScale!)
	}
	set NightDay(v) {
		this.data.globalEmissionScale = dequantizeUnsignedPercent(v)
	}
	/** Get AOScale. */
	get AOScale() {
		return this.data.aoScale
	}
	set AOScale(v) {
		this.data.aoScale = v
	}
	/** Get SSRScale. */
	get SSRScale() {
		return this.data.ssrScale
	}
	set SSRScale(v) {
		this.data.ssrScale = v
	}
	/** Get EnvironmentEmissionScale. */
	get EnvironmentEmissionScale() {
		return this.data.envEmissionScale
	}
	set EnvironmentEmissionScale(v) {
		this.data.envEmissionScale = v
	}
	/** Get BallReflection. */
	get BallReflection() {
		return this.data.useReflectionForBalls
	}
	set BallReflection(v) {
		this.data.useReflectionForBalls = v
	}
	/** Get PlayfieldReflectionStrength. */
	get PlayfieldReflectionStrength() {
		return quantizeUnsignedPercent(this.data.playfieldReflectionStrength)
	}
	set PlayfieldReflectionStrength(v) {
		this.data.playfieldReflectionStrength = dequantizeUnsignedPercent(v)
	}
	/** Get BallTrail. */
	get BallTrail() {
		return this.data.useTrailForBalls
	}
	set BallTrail(v) {
		this.data.useTrailForBalls = v
	}
	/** Get TrailStrength. */
	get TrailStrength() {
		return quantizeUnsignedPercent(this.data.ballTrailStrength)
	}
	set TrailStrength(v) {
		this.data.ballTrailStrength = dequantizeUnsignedPercent(v)
	}
	/** Get BallPlayfieldReflectionScale. */
	get BallPlayfieldReflectionScale() {
		return this.data.ballPlayfieldReflectionStrength
	}
	set BallPlayfieldReflectionScale(v) {
		this.data.ballPlayfieldReflectionStrength = v
	}
	/** Get DefaultBulbIntensityScale. */
	get DefaultBulbIntensityScale() {
		return this.data.defaultBulbIntensityScaleOnBall
	}
	set DefaultBulbIntensityScale(v) {
		this.data.defaultBulbIntensityScaleOnBall = v
	}
	/** Get BloomStrength. */
	get BloomStrength() {
		return this.data.bloomStrength
	}
	set BloomStrength(v) {
		this.data.bloomStrength = v
	}
	/** Get TableSoundVolume. */
	get TableSoundVolume() {
		return quantizeUnsignedPercent(this.data.tableSoundVolume)
	}
	set TableSoundVolume(v) {
		this.data.tableSoundVolume = dequantizeUnsignedPercent(v)
	}
	/** Get DetailLevel. */
	get DetailLevel() {
		return this.data.overwriteGlobalDetailLevel ? this.data.userDetailLevel : this.globalDetailLevel
	}
	set DetailLevel(v) {
		if (this.data.overwriteGlobalDetailLevel) {
			this.data.userDetailLevel = v
		}
	}
	/** Get GlobalAlphaAcc. */
	get GlobalAlphaAcc() {
		return this.data.overwriteGlobalDetailLevel
	}
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
	set GlobalDayNight(v) {
		this.data.overwriteGlobalDayNight = v
	}
	/** Get GlobalStereo3D. */
	get GlobalStereo3D() {
		return this.data.overwriteGlobalStereo3D
	}
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
	set BallDecalMode(v) {
		this.data.ballDecalMode = v
	}
	/** Get TableMusicVolume. */
	get TableMusicVolume() {
		return quantizeUnsignedPercent(this.data.tableMusicVolume)
	}
	set TableMusicVolume(v) {
		this.data.tableMusicVolume = dequantizeUnsignedPercent(v)
	}
	/** Get TableAdaptiveVSync. */
	get TableAdaptiveVSync() {
		return this.data.tableAdaptiveVSync
	}
	set TableAdaptiveVSync(v) {
		this.data.tableAdaptiveVSync = v
	}
	/** Get BackdropColor. */
	get BackdropColor() {
		return this.data.colorBackdrop
	}
	set BackdropColor(v) {
		this.data.colorBackdrop = v
	}
	/** Get BackdropImageApplyNightDay. */
	get BackdropImageApplyNightDay() {
		return this.data.imageBackdropNightDay
	}
	set BackdropImageApplyNightDay(v) {
		this.data.imageBackdropNightDay = v
	}
	/** Get ShowFSS. */
	get ShowFSS() {
		return this.data.bgEnableFss
	}
	set ShowFSS(v) {
		this.data.bgEnableFss = v
	}
	/** Get BackdropImage_DT. */
	get BackdropImage_DT() {
		return this.data.bgImage[Enums.BackglassIndex.DESKTOP]
	}
	set BackdropImage_DT(v) {
		this.data.bgImage[Enums.BackglassIndex.DESKTOP] = v
	}
	/** Get BackdropImage_FS. */
	get BackdropImage_FS() {
		return this.data.bgImage[Enums.BackglassIndex.FULLSCREEN]
	}
	set BackdropImage_FS(v) {
		this.data.bgImage[Enums.BackglassIndex.FULLSCREEN] = v
	}
	/** Get BackdropImage_FSS. */
	get BackdropImage_FSS() {
		return this.data.bgImage[Enums.BackglassIndex.FULL_SINGLE_SCREEN]
	}
	set BackdropImage_FSS(v) {
		this.data.bgImage[Enums.BackglassIndex.FULL_SINGLE_SCREEN] = v
	}
	/** Get ColorGradeImage. */
	get ColorGradeImage() {
		return this.data.szImageColorGrade
	}
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
	set Friction(v) {
		this.data.friction = clamp(v, 0, 1)
	}
	/** Get Elasticity. */
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	/** Get ElasticityFalloff. */
	get ElasticityFalloff() {
		return this.data.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		this.data.elasticityFalloff = v
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get DefaultScatter. */
	get DefaultScatter() {
		return this.data.defaultScatter
	}
	set DefaultScatter(v) {
		this.data.defaultScatter = v
	}
	/** Get NudgeTime. */
	get NudgeTime() {
		return this.data.nudgeTime
	}
	set NudgeTime(v) {
		this.data.nudgeTime = v
	}
	/** Get PlungerNormalize. */
	get PlungerNormalize() {
		return this.data.plungerNormalize
	}
	set PlungerNormalize(v) {
		this.data.plungerNormalize = v
	}
	/** Get PlungerFilter. */
	get PlungerFilter() {
		return this.data.plungerFilter
	}
	set PlungerFilter(v) {
		this.data.plungerFilter = v
	}
	/** Get PhysicsLoopTime. */
	get PhysicsLoopTime() {
		return this.data.physicsMaxLoops
	}
	set PhysicsLoopTime(v) {
		this.data.physicsMaxLoops = v
	}
	/** Get BackglassMode. */
	get BackglassMode() {
		return this.currentBackglassMode + TableData.BGI_DESKTOP
	}
	set BackglassMode(v) {
		this.currentBackglassMode = v - TableData.BGI_DESKTOP
	}
	/** Get FieldOfView. */
	get FieldOfView() {
		return this.data.bgFov[this.currentBackglassMode]
	}
	set FieldOfView(v) {
		this.data.bgFov[this.currentBackglassMode] = v
	}
	/** Get Inclination. */
	get Inclination() {
		return this.data.bgInclination[this.currentBackglassMode]
	}
	set Inclination(v) {
		this.data.bgInclination[this.currentBackglassMode] = v
	}
	/** Get Layback. */
	get Layback() {
		return this.data.bgLayback[this.currentBackglassMode]
	}
	set Layback(v) {
		this.data.bgLayback[this.currentBackglassMode] = v
	}
	/** Get Rotation. */
	get Rotation() {
		return this.data.bgRotation[this.currentBackglassMode]
	}
	set Rotation(v) {
		this.data.bgRotation[this.currentBackglassMode] = v
	}
	/** Get Scalex. */
	get Scalex() {
		return this.data.bgScaleX[this.currentBackglassMode]
	}
	set Scalex(v) {
		this.data.bgScaleX[this.currentBackglassMode] = v
	}
	/** Get Scaley. */
	get Scaley() {
		return this.data.bgScaleY[this.currentBackglassMode]
	}
	set Scaley(v) {
		this.data.bgScaleY[this.currentBackglassMode] = v
	}
	/** Get Scalez. */
	get Scalez() {
		return this.data.bgScaleZ[this.currentBackglassMode]
	}
	set Scalez(v) {
		this.data.bgScaleZ[this.currentBackglassMode] = v
	}
	/** Get Xlatex. */
	get Xlatex() {
		return this.data.bgXlateX[this.currentBackglassMode]
	}
	set Xlatex(v) {
		this.data.bgXlateX[this.currentBackglassMode] = v
	}
	/** Get Xlatey. */
	get Xlatey() {
		return this.data.bgXlateY[this.currentBackglassMode]
	}
	set Xlatey(v) {
		this.data.bgXlateY[this.currentBackglassMode] = v
	}
	/** Get Xlatez. */
	get Xlatez() {
		return this.data.bgXlateZ[this.currentBackglassMode]
	}
	set Xlatez(v) {
		this.data.bgXlateZ[this.currentBackglassMode] = v
	}
	/** Get SlopeMax. */
	get SlopeMax() {
		return this.data.angleTiltMax
	}
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
	set BallImage(v) {
		this.data.szBallImage = v
	}
	/** Get EnvironmentImage. */
	get EnvironmentImage() {
		return this.data.szEnvImage
	}
	set EnvironmentImage(v) {
		const tex = this.table.getTexture(v)
		if (tex && tex.width !== tex.height * 2) {
			throw new Error('Wrong image size, needs to be 2x width in comparison to height')
		}
		this.data.szEnvImage = v
	}
	get YieldTime(): any {
		throw new Error('Not supported in play.')
	}
	set YieldTime(v: any) {
		throw new Error('Not supported in play.')
	}
	/** Get EnableAntialiasing. */
	get EnableAntialiasing() {
		return this.data.useAA
	}
	set EnableAntialiasing(v) {
		this.data.useAA = v
	}
	/** Get EnableSSR. */
	get EnableSSR() {
		return this.data.useSSR
	}
	set EnableSSR(v) {
		this.data.useSSR = v
	}
	/** Get EnableAO. */
	get EnableAO() {
		return this.data.useAO
	}
	set EnableAO(v) {
		this.data.useAO = v
	}
	/** Get EnableFXAA. */
	get EnableFXAA() {
		return this.data.useFXAA
	}
	set EnableFXAA(v) {
		this.data.useFXAA = v
	}
	/** Get OverridePhysics. */
	get OverridePhysics() {
		return this.data.overridePhysics
	}
	set OverridePhysics(v) {
		this.data.overridePhysics = v
	}
	/** Get OverridePhysicsFlippers. */
	get OverridePhysicsFlippers() {
		return this.data.overridePhysicsFlipper
	}
	set OverridePhysicsFlippers(v) {
		this.data.overridePhysicsFlipper = v
	}
	/** Get EnableDecals. */
	get EnableDecals() {
		return this.data.renderDecals
	}
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
	set ReflectElementsOnPlayfield(v) {
		this.data.reflectElementsOnPlayfield = v
	}
	/** Get EnableEMReels. */
	get EnableEMReels() {
		return this.data.renderEMReels
	}
	set EnableEMReels(v) {
		this.data.renderEMReels = v
	}
	/** Get GlobalDifficulty. */
	get GlobalDifficulty() {
		return this.data.globalDifficulty * 100
	}
	set GlobalDifficulty(v) {
		this.data.globalDifficulty = clamp(v, 0, 100) / 100.0
	}
	/** Get Accelerometer. */
	get Accelerometer() {
		return false
	}
	set Accelerometer(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get AccelNormalMount. */
	get AccelNormalMount() {
		return false
	}
	set AccelNormalMount(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get AccelerometerAngle. */
	get AccelerometerAngle() {
		return 0.0
	}
	set AccelerometerAngle(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get DeadZone. */
	get DeadZone() {
		return 0
	}
	set DeadZone(v) {
		/* do nothing, we don't have accelerometers on the web. */
	}
	/** Get BallFrontDecal. */
	get BallFrontDecal() {
		return this.data.szBallImageFront
	}
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
