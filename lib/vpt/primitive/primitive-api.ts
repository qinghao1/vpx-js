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

/** Primitive API. */
export class PrimitiveApi extends ItemApi<PrimitiveData> {
	private readonly primitive: Primitive
	private readonly state: PrimitiveState
	private readonly hits: HitObject[]
	private readonly isDynamic: boolean

	constructor(
		primitive: Primitive,
		state: PrimitiveState,
		data: PrimitiveData,
		hits: HitObject[],
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.primitive = primitive
		this.state = state
		this.hits = hits
		this.isDynamic = !data.staticRendering
	}

	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) {
			this.state.map = v
		}
		this.data.szImage = v
	}
	/** Get NormalMap. */
	get NormalMap() {
		return this.data.szNormalMap
	}
	set NormalMap(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) {
			this.state.normalMap = v
		}
		this.data.szNormalMap = v
	}
	/** Get Material. */
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		if (this.isDynamic) {
			this.state.material = v
		}
		this.data.szMaterial = v
	}
	/** Get MeshFileName. */
	get MeshFileName() {
		return this.data.meshFileName
	}
	set MeshFileName(v) {
		this.data.meshFileName = v
	}
	/** Get Sides. */
	get Sides() {
		return this.data.sides
	}
	set Sides(v) {
		this.primitive.setSides(v)
	}
	/** Get SideColor. */
	get SideColor() {
		return this.data.sideColor
	}
	set SideColor(v) {
		this.data.sideColor = v
	}
	/** Get Visible. */
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		if (this.isDynamic) {
			this.state.isVisible = v
		}
		this.data.isVisible = v
	}
	/** Get DrawTexturesInside. */
	get DrawTexturesInside() {
		return this.data.drawTexturesInside
	} // TODO test
	set DrawTexturesInside(v) {
		this.data.drawTexturesInside = v
	}
	/** Get X. */
	get X() {
		return this.state.position.x
	}
	set X(v) {
		this.state.position.x = v
	}
	/** Get Y. */
	get Y() {
		return this.state.position.y
	}
	set Y(v) {
		this.state.position.y = v
	}
	/** Get Z. */
	get Z() {
		return this.state.position.z
	}
	set Z(v) {
		this.state.position.z = v
	}
	/** Get Size_X. */
	get Size_X() {
		return this.data.size.x
	} // TODO make sure it doesn't conflict with event callbacks
	set Size_X(v) {
		if (this.isDynamic) {
			this.state.size.x = v
		}
		this.data.size.x = v
	}
	/** Get Size_Y. */
	get Size_Y() {
		return this.data.size.y
	}
	set Size_Y(v) {
		if (this.isDynamic) {
			this.state.size.y = v
		}
		this.data.size.y = v
	}
	/** Get Size_Z. */
	get Size_Z() {
		return this.data.size.z
	}
	set Size_Z(v) {
		if (this.isDynamic) {
			this.state.size.z = v
		}
		this.data.size.z = v
	}
	/** Get RotAndTra0. */
	get RotAndTra0() {
		return this.RotX
	}
	set RotAndTra0(v) {
		this.RotX = v
	}
	/** Get RotX. */
	get RotX() {
		return this.data.rotAndTra[0]
	}
	set RotX(v) {
		if (this.isDynamic) {
			this.state.rotation.x = v
		}
		this.data.rotAndTra[0] = v
	}
	/** Get RotAndTra1. */
	get RotAndTra1() {
		return this.RotY
	}
	set RotAndTra1(v) {
		this.RotY = v
	}
	/** Get RotY. */
	get RotY() {
		return this.data.rotAndTra[1]
	}
	set RotY(v) {
		if (this.isDynamic) {
			this.state.rotation.y = v
		}
		this.data.rotAndTra[1] = v
	}
	/** Get RotAndTra2. */
	get RotAndTra2() {
		return this.RotZ
	}
	set RotAndTra2(v) {
		this.RotZ = v
	}
	/** Get RotZ. */
	get RotZ() {
		return this.data.rotAndTra[2]
	}
	set RotZ(v) {
		if (this.isDynamic) {
			this.state.rotation.z = v
		}
		this.data.rotAndTra[2] = v
	}
	/** Get RotAndTra3. */
	get RotAndTra3() {
		return this.TransX
	}
	set RotAndTra3(v) {
		this.TransX = v
	}
	/** Get TransX. */
	get TransX() {
		return this.data.rotAndTra[3]
	}
	set TransX(v) {
		if (this.isDynamic) {
			this.state.translation.x = v
		}
		this.data.rotAndTra[3] = v
	}
	/** Get RotAndTra4. */
	get RotAndTra4() {
		return this.TransY
	}
	set RotAndTra4(v) {
		this.TransY = v
	}
	/** Get TransY. */
	get TransY() {
		return this.data.rotAndTra[4]
	}
	set TransY(v) {
		if (this.isDynamic) {
			this.state.translation.y = v
		}
		this.data.rotAndTra[4] = v
	}
	/** Get RotAndTra5. */
	get RotAndTra5() {
		return this.TransZ
	}
	set RotAndTra5(v) {
		this.TransZ = v
	}
	/** Get TransZ. */
	get TransZ() {
		return this.data.rotAndTra[5]
	}
	set TransZ(v) {
		if (this.isDynamic) {
			this.state.translation.z = v
		}
		this.data.rotAndTra[5] = v
	}
	/** Get RotAndTra6. */
	get RotAndTra6() {
		return this.ObjRotX
	}
	set RotAndTra6(v) {
		this.ObjRotX = v
	}
	/** Get ObjRotX. */
	get ObjRotX() {
		return this.data.rotAndTra[6]
	}
	set ObjRotX(v) {
		if (this.isDynamic) {
			this.state.objectRotation.x = v
		}
		this.data.rotAndTra[6] = v
	}
	/** Get RotAndTra7. */
	get RotAndTra7() {
		return this.ObjRotY
	}
	set RotAndTra7(v) {
		this.ObjRotY = v
	}
	/** Get ObjRotY. */
	get ObjRotY() {
		return this.data.rotAndTra[7]
	}
	set ObjRotY(v) {
		if (this.isDynamic) {
			this.state.objectRotation.y = v
		}
		this.data.rotAndTra[7] = v
	}
	/** Get RotAndTra8. */
	get RotAndTra8() {
		return this.ObjRotZ
	}
	set RotAndTra8(v) {
		this.ObjRotZ = v
	}
	/** Get ObjRotZ. */
	get ObjRotZ() {
		return this.data.rotAndTra[8]
	}
	set ObjRotZ(v) {
		if (this.isDynamic) {
			this.state.objectRotation.z = v
		}
		this.data.rotAndTra[8] = v
	}
	/** Get EdgeFactorUI. */
	get EdgeFactorUI() {
		return this.data.edgeFactorUI
	}
	set EdgeFactorUI(v) {
		this.data.edgeFactorUI = v
	}
	/** Get CollisionReductionFactor. */
	get CollisionReductionFactor() {
		return this.data.collisionReductionFactor
	}
	set CollisionReductionFactor(v) {
		this.data.collisionReductionFactor = v
	}
	/** Get EnableStaticRendering. */
	get EnableStaticRendering() {
		return this.data.staticRendering
	}
	set EnableStaticRendering(v) {
		this.data.staticRendering = v
	}
	/** Get HasHitEvent. */
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
	}
	/** Get Threshold. */
	get Threshold() {
		return this.data.threshold
	}
	set Threshold(v) {
		this.data.threshold = v
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
	/** Get Friction. */
	get Friction() {
		return this.data.friction
	}
	set Friction(v) {
		this.data.friction = v
	}
	/** Get Scatter. */
	get Scatter() {
		return this.data.scatter
	}
	set Scatter(v) {
		this.data.scatter = v
	}
	/** Get Collidable. */
	get Collidable() {
		return this.hits.length === 0 ? this.data.isCollidable : this.hits[0].isEnabled
	}
	set Collidable(v) {
		this.primitive.setCollidable(v)
	}
	/** Get IsToy. */
	get IsToy() {
		return this.data.isToy
	}
	set IsToy(v) {
		this.data.isToy = v
	}
	/** Get BackfacesEnabled. */
	get BackfacesEnabled() {
		return this.data.backfacesEnabled
	}
	set BackfacesEnabled(v) {
		this.data.backfacesEnabled = v
	}
	/** Get DisableLighting. */
	get DisableLighting() {
		return this.data.disableLightingTop !== 0
	}
	set DisableLighting(v) {
		this.data.disableLightingTop = v ? 1 : 0
	}
	/** Get BlendDisableLighting. */
	get BlendDisableLighting() {
		return this.data.disableLightingTop
	}
	set BlendDisableLighting(v) {
		this.data.disableLightingTop = v
	}
	/** Get BlendDisableLightingFromBelow. */
	get BlendDisableLightingFromBelow() {
		return this.data.disableLightingBelow
	}
	set BlendDisableLightingFromBelow(v) {
		this.data.disableLightingBelow = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get PhysicsMaterial. */
	get PhysicsMaterial() {
		return this.data.szPhysicsMaterial
	}
	set PhysicsMaterial(v) {
		this.data.szPhysicsMaterial = v
	}
	/** Get OverwritePhysics. */
	get OverwritePhysics() {
		return this.data.overwritePhysics
	}
	set OverwritePhysics(v) {
		this.data.overwritePhysics = v
	}
	/** Get HitThreshold. */
	get HitThreshold() {
		return this.events.currentHitThreshold
	}
	/** Get DisplayTexture. */
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(v) {
		this.data.displayTexture = v
	}
	/** Get DepthBias. */
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}

	/* istanbul ignore next: remove ignore when implemented */
	public PlayAnim(startFrame: number, speed: number): void {
		// TODO: primitive animation
	}

	/* istanbul ignore next: remove ignore when implemented */
	public PlayAnimEndless(speed: number): void {
		// TODO: primitive animation
	}

	/* istanbul ignore next: remove ignore when implemented */
	public StopAnim(): void {
		// TODO: primitive animation
	}

	/* istanbul ignore next: remove ignore when implemented */
	public ContinueAnim(speed: number): void {
		// TODO: primitive animation
	}

	/* istanbul ignore next: remove ignore when implemented */
	public ShowFrame(frame: number): void {
		// TODO: primitive animation
	}

	public _getTimers(): TimerHit[] {
		this._beginPlay()
		return []
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(PrimitiveApi.prototype)
	}
}
