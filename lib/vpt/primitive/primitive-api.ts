// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { TimerHit } from '../timer/timer-hit.js'
import type { Primitive } from './primitive.js'
import type { PrimitiveData } from './primitive-data.js'
import type { PrimitiveState } from './primitive-state.js'

function num(v: unknown): number {
	return (v as any)?.__isUndefined ? 0 : Number(v as number) || 0
}

/** Primitive API — VBS surface for `Primitive`. @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveApi extends ItemApi<PrimitiveData> {
	private readonly isDynamic: boolean

	constructor(
		private readonly primitive: Primitive,
		private readonly state: PrimitiveState,
		data: PrimitiveData,
		private readonly hits: HitObject[],
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.isDynamic = !data.staticRendering
	}

	get Image() {
		return this.isDynamic ? this.state.map! : this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) this.state.map = v
		else this.data.szImage = v
	}
	get NormalMap() {
		return this.isDynamic ? this.state.normalMap! : this.data.szNormalMap
	}
	set NormalMap(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) this.state.normalMap = v
		else this.data.szNormalMap = v
	}
	get Material() {
		return this.isDynamic ? this.state.material! : this.data.szMaterial
	}
	set Material(v) {
		if (this.isDynamic) this.state.material = v
		else this.data.szMaterial = v
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
		return this.isDynamic ? this.state.isVisible : this.data.isVisible
	}
	set Visible(v) {
		if (this.isDynamic) this.state.isVisible = v
		else this.data.isVisible = v
	}
	get DrawTexturesInside() {
		return this.data.drawTexturesInside
	}
	set DrawTexturesInside(v) {
		this.data.drawTexturesInside = v
	}
	get X() {
		return this.isDynamic ? this.state.position.x : this.data.position.x
	}
	set X(v) {
		v = num(v)
		if (this.isDynamic) this.state.position.x = v
		else this.data.position.x = v
	}
	get Y() {
		return this.isDynamic ? this.state.position.y : this.data.position.y
	}
	set Y(v) {
		v = num(v)
		if (this.isDynamic) this.state.position.y = v
		else this.data.position.y = v
	}
	get Z() {
		return this.isDynamic ? this.state.position.z : this.data.position.z
	}
	set Z(v) {
		v = num(v)
		if (this.isDynamic) this.state.position.z = v
		else this.data.position.z = v
	}
	get Size_X() {
		return this.isDynamic ? this.state.size.x : this.data.size.x
	}
	set Size_X(v) {
		v = num(v)
		if (this.isDynamic) this.state.size.x = v
		else this.data.size.x = v
	}
	get Size_Y() {
		return this.isDynamic ? this.state.size.y : this.data.size.y
	}
	set Size_Y(v) {
		v = num(v)
		if (this.isDynamic) this.state.size.y = v
		else this.data.size.y = v
	}
	get Size_Z() {
		return this.isDynamic ? this.state.size.z : this.data.size.z
	}
	set Size_Z(v) {
		v = num(v)
		if (this.isDynamic) this.state.size.z = v
		else this.data.size.z = v
	}
	get RotAndTra0() {
		return this.RotX
	}
	set RotAndTra0(v) {
		this.RotX = v
	}
	get RotX() {
		return this.isDynamic ? this.state.rotation.x : this.data.rotAndTra[0]
	}
	set RotX(v) {
		v = num(v)
		if (this.isDynamic) this.state.rotation.x = v
		else this.data.rotAndTra[0] = v
	}
	get RotAndTra1() {
		return this.RotY
	}
	set RotAndTra1(v) {
		this.RotY = v
	}
	get RotY() {
		return this.isDynamic ? this.state.rotation.y : this.data.rotAndTra[1]
	}
	set RotY(v) {
		v = num(v)
		if (this.isDynamic) this.state.rotation.y = v
		else this.data.rotAndTra[1] = v
	}
	get RotAndTra2() {
		return this.RotZ
	}
	set RotAndTra2(v) {
		this.RotZ = v
	}
	get RotZ() {
		return this.isDynamic ? this.state.rotation.z : this.data.rotAndTra[2]
	}
	set RotZ(v) {
		v = num(v)
		if (this.isDynamic) this.state.rotation.z = v
		else this.data.rotAndTra[2] = v
	}
	get RotAndTra3() {
		return this.TransX
	}
	set RotAndTra3(v) {
		this.TransX = v
	}
	get TransX() {
		return this.isDynamic ? this.state.translation.x : this.data.rotAndTra[3]
	}
	set TransX(v) {
		v = num(v)
		if (this.isDynamic) this.state.translation.x = v
		else this.data.rotAndTra[3] = v
	}
	get RotAndTra4() {
		return this.TransY
	}
	set RotAndTra4(v) {
		this.TransY = v
	}
	get TransY() {
		return this.isDynamic ? this.state.translation.y : this.data.rotAndTra[4]
	}
	set TransY(v) {
		v = num(v)
		if (this.isDynamic) this.state.translation.y = v
		else this.data.rotAndTra[4] = v
	}
	get RotAndTra5() {
		return this.TransZ
	}
	set RotAndTra5(v) {
		this.TransZ = v
	}
	get TransZ() {
		return this.isDynamic ? this.state.translation.z : this.data.rotAndTra[5]
	}
	set TransZ(v) {
		v = num(v)
		if (this.isDynamic) this.state.translation.z = v
		else this.data.rotAndTra[5] = v
	}
	get RotAndTra6() {
		return this.ObjRotX
	}
	set RotAndTra6(v) {
		this.ObjRotX = v
	}
	get ObjRotX() {
		return this.isDynamic ? this.state.objectRotation.x : this.data.rotAndTra[6]
	}
	set ObjRotX(v) {
		v = num(v)
		if (this.isDynamic) this.state.objectRotation.x = v
		else this.data.rotAndTra[6] = v
	}
	get RotAndTra7() {
		return this.ObjRotY
	}
	set RotAndTra7(v) {
		this.ObjRotY = v
	}
	get ObjRotY() {
		return this.isDynamic ? this.state.objectRotation.y : this.data.rotAndTra[7]
	}
	set ObjRotY(v) {
		v = num(v)
		if (this.isDynamic) this.state.objectRotation.y = v
		else this.data.rotAndTra[7] = v
	}
	get RotAndTra8() {
		return this.ObjRotZ
	}
	set RotAndTra8(v) {
		this.ObjRotZ = v
	}
	get ObjRotZ() {
		return this.isDynamic ? this.state.objectRotation.z : this.data.rotAndTra[8]
	}
	set ObjRotZ(v) {
		v = num(v)
		if (this.isDynamic) this.state.objectRotation.z = v
		else this.data.rotAndTra[8] = v
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
	get DisableLighting() {
		return this.data.disableLightingTop !== 0
	}
	set DisableLighting(v) {
		this.data.disableLightingTop = v ? 1 : 0
	}
	get BlendDisableLighting() {
		return this.data.disableLightingTop
	}
	set BlendDisableLighting(v) {
		this.data.disableLightingTop = v
	}
	get BlendDisableLightingFromBelow() {
		return this.data.disableLightingBelow
	}
	set BlendDisableLightingFromBelow(v) {
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

	/* istanbul ignore next */
	public PlayAnim(_startFrame: number, _speed: number): void {}
	/* istanbul ignore next */
	public PlayAnimEndless(_speed: number): void {}
	/* istanbul ignore next */
	public StopAnim(): void {}
	/* istanbul ignore next */
	public ContinueAnim(_speed: number): void {}
	/* istanbul ignore next */
	public ShowFrame(_frame: number): void {}

	public _getTimers(): TimerHit[] {
		this._beginPlay()
		return []
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(PrimitiveApi.prototype)
	}
}
