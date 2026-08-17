// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import { UNDEF } from '../../scripting/vbs-undefined.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { TimerHit } from '../timer/timer-hit.js'
import type { Primitive } from './primitive.js'
import type { PrimitiveAnimation } from './primitive-animation.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

function num(v: unknown): number {
	if (typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[UNDEF] === true) return 0
	return Number(v as number) || 0
}

/** Primitive API — VBS surface for `Primitive`. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveApi extends ItemApi<PrimitiveData> {
	constructor(
		private readonly primitive: Primitive,
		private readonly _state: PrimitiveState,
		data: PrimitiveData,
		private readonly hits: HitObject[],
		events: EventProxy,
		player: Player,
		table: Table,
		private readonly animation?: PrimitiveAnimation,
	) {
		super(data, events, player, table)
	}

	get Image() {
		return this._state.map ?? this.data.szImage ?? ''
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this._state.map = v
		this.data.szImage = v
	}
	get NormalMap() {
		return this._state.normalMap ?? this.data.szNormalMap ?? ''
	}
	set NormalMap(v) {
		this._assertNonHdrImage(v)
		this._state.normalMap = v
		this.data.szNormalMap = v
	}
	get Material() {
		return this._state.material ?? this.data.szMaterial ?? ''
	}
	set Material(v) {
		this._state.material = v
		this.data.szMaterial = v
	}
	get MeshFileName() {
		return this.data.meshFileName
	}
	set MeshFileName(v) {
		this.data.meshFileName = v
	}
	get Sides() {
		return this.data.sides
	}
	set Sides(v) {
		this.primitive.setSides(v)
	}
	get SideColor() {
		return this.data.sideColor
	}
	set SideColor(v) {
		this.data.sideColor = v
	}
	get Visible() {
		return this._state.isVisible
	}
	set Visible(v) {
		this._state.isVisible = !!v
		this.data.isVisible = !!v
	}
	get DrawTexturesInside() {
		return this.data.drawTexturesInside
	}
	set DrawTexturesInside(v) {
		this.data.drawTexturesInside = v
	}
	get X() {
		return this._state.position.x
	}
	set X(v) {
		v = num(v)
		this._state.position.x = v
	}
	get Y() {
		return this._state.position.y
	}
	set Y(v) {
		v = num(v)
		this._state.position.y = v
	}
	get Z() {
		return this._state.position.z
	}
	set Z(v) {
		v = num(v)
		this._state.position.z = v
	}
	get Size_X() {
		return this._state.size.x
	}
	set Size_X(v) {
		v = num(v)
		this._state.size.x = v
	}
	get Size_Y() {
		return this._state.size.y
	}
	set Size_Y(v) {
		v = num(v)
		this._state.size.y = v
	}
	get Size_Z() {
		return this._state.size.z
	}
	set Size_Z(v) {
		v = num(v)
		this._state.size.z = v
	}
	get RotAndTra0() {
		return this.RotX
	}
	set RotAndTra0(v) {
		this.RotX = v
	}
	get RotX() {
		return this._state.rotation.x
	}
	set RotX(v) {
		v = num(v)
		this._state.rotation.x = v
	}
	get RotAndTra1() {
		return this.RotY
	}
	set RotAndTra1(v) {
		this.RotY = v
	}
	get RotY() {
		return this._state.rotation.y
	}
	set RotY(v) {
		v = num(v)
		this._state.rotation.y = v
	}
	get RotAndTra2() {
		return this.RotZ
	}
	set RotAndTra2(v) {
		this.RotZ = v
	}
	get RotZ() {
		return this._state.rotation.z
	}
	set RotZ(v) {
		v = num(v)
		this._state.rotation.z = v
	}
	get RotAndTra3() {
		return this.TransX
	}
	set RotAndTra3(v) {
		this.TransX = v
	}
	get TransX() {
		return this._state.translation.x
	}
	set TransX(v) {
		v = num(v)
		this._state.translation.x = v
	}
	get RotAndTra4() {
		return this.TransY
	}
	set RotAndTra4(v) {
		this.TransY = v
	}
	get TransY() {
		return this._state.translation.y
	}
	set TransY(v) {
		v = num(v)
		this._state.translation.y = v
	}
	get RotAndTra5() {
		return this.TransZ
	}
	set RotAndTra5(v) {
		this.TransZ = v
	}
	get TransZ() {
		return this._state.translation.z
	}
	set TransZ(v) {
		v = num(v)
		this._state.translation.z = v
	}
	get RotAndTra6() {
		return this.ObjRotX
	}
	set RotAndTra6(v) {
		this.ObjRotX = v
	}
	get ObjRotX() {
		return this._state.objectRotation.x
	}
	set ObjRotX(v) {
		v = num(v)
		this._state.objectRotation.x = v
	}
	get RotAndTra7() {
		return this.ObjRotY
	}
	set RotAndTra7(v) {
		this.ObjRotY = v
	}
	get ObjRotY() {
		return this._state.objectRotation.y
	}
	set ObjRotY(v) {
		v = num(v)
		this._state.objectRotation.y = v
	}
	get RotAndTra8() {
		return this.ObjRotZ
	}
	set RotAndTra8(v) {
		this.ObjRotZ = v
	}
	get ObjRotZ() {
		return this._state.objectRotation.z
	}
	set ObjRotZ(v) {
		v = num(v)
		this._state.objectRotation.z = v
	}
	get EdgeFactorUI() {
		return this.data.edgeFactorUI
	}
	set EdgeFactorUI(v) {
		this.data.edgeFactorUI = v
	}
	get CollisionReductionFactor() {
		return this.data.collisionReductionFactor
	}
	set CollisionReductionFactor(v) {
		this.data.collisionReductionFactor = v
	}
	get EnableStaticRendering() {
		return this.data.staticRendering
	}
	set EnableStaticRendering(v) {
		this.data.staticRendering = v
	}
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
	}
	get Elasticity() {
		return this.data.elasticity
	}
	set Elasticity(v) {
		this.data.elasticity = v
	}
	get ElasticityFalloff() {
		return this.data.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		this.data.elasticityFalloff = v
	}
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = v
	}
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	get Collidable() {
		return this.hits.length === 0 ? this.data.isCollidable : this.hits[0].isEnabled
	}
	set Collidable(v) {
		this.primitive.setCollidable(v)
	}
	get IsToy() {
		return this.data.isToy
	}
	set IsToy(v) {
		this.data.isToy = v
	}
	get BackfacesEnabled() {
		return this.data.backfacesEnabled
	}
	set BackfacesEnabled(v) {
		this.data.backfacesEnabled = v
	}
	get Opacity() {
		return this._state.alpha ?? this.data.alpha
	}
	set Opacity(v) {
		v = num(v)
		this._state.alpha = v
		this.data.alpha = v
	}
	get Alpha() {
		return this.Opacity
	}
	set Alpha(v) {
		this.Opacity = v
	}
	get Color() {
		return this._state.color ?? this.data.color
	}
	set Color(v) {
		v = num(v)
		this._state.color = v
		this.data.color = v
	}
	get DisableLighting() {
		return this._state.disableLightingTop !== 0
	}
	set DisableLighting(v) {
		const val = v ? 1 : 0
		this._state.disableLightingTop = val
		this.data.disableLightingTop = val
	}
	get BlendDisableLighting() {
		return this._state.disableLightingTop
	}
	set BlendDisableLighting(v) {
		v = num(v)
		this._state.disableLightingTop = v
		this.data.disableLightingTop = v
	}
	get BlendDisableLightingFromBelow() {
		return this._state.disableLightingBelow
	}
	set BlendDisableLightingFromBelow(v) {
		v = num(v)
		this._state.disableLightingBelow = v
		this.data.disableLightingBelow = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get PhysicsMaterial() {
		return this.data.szPhysicsMaterial
	}
	set PhysicsMaterial(v) {
		this.data.szPhysicsMaterial = v
	}
	get OverwritePhysics() {
		return this.data.overwritePhysics
	}
	set OverwritePhysics(v) {
		this.data.overwritePhysics = v
	}
	get HitThreshold() {
		return this.events.currentHitThreshold
	}
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(v) {
		this.data.displayTexture = v
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}

	public PlayAnim(startFrame: number, speed: number): void {
		this.animation?.playAnim(num(startFrame), num(speed))
	}
	public PlayAnimEndless(speed: number): void {
		this.animation?.playAnimEndless(num(speed))
	}
	public StopAnim(): void {
		this.animation?.stopAnim()
	}
	public ContinueAnim(speed: number): void {
		this.animation?.continueAnim(num(speed))
	}
	public ShowFrame(frame: number): void {
		this.animation?.showFrame(num(frame))
	}

	public _getTimers(): TimerHit[] {
		this._beginPlay()
		return []
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(PrimitiveApi.prototype)
	}
}
