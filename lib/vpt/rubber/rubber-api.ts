// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberState } from './rubber-state.js'

/** Rubber API. */
export class RubberApi extends ItemApi<RubberData> {
	private readonly state: RubberState
	private readonly hits: HitObject[]
	private readonly isDynamic: boolean

	constructor(
		state: RubberState,
		hits: HitObject[],
		data: RubberData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.hits = hits
		this.isDynamic = !data.staticRendering
	}

	/** Get Height. */
	get Height() {
		return this.data.height
	}
	set Height(v) {
		if (this.isDynamic) {
			this.state.height = v
		}
		this.data.height = v
	}
	/** Get HitHeight. */
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	/** Get Thickness. */
	get Thickness() {
		return this.data.thickness
	}
	set Thickness(v) {
		this.data.thickness = v
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
	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) {
			this.state.texture = v
		}
		this.data.szImage = v
	}
	/** Get HasHitEvent. */
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
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
		return this.hits[0].isEnabled
	}
	set Collidable(v) {
		if (v !== this.Collidable) {
			for (const hit of this.hits) {
				hit.isEnabled = v
			}
		}
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
	/** Get EnableStaticRendering. */
	get EnableStaticRendering() {
		return this.data.staticRendering
	}
	set EnableStaticRendering(v) {
		this.data.staticRendering = v
	}
	/** Get EnableShowInEditor. */
	get EnableShowInEditor() {
		return this.data.showInEditor
	}
	set EnableShowInEditor(v) {
		this.data.showInEditor = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	/** Get RotX. */
	get RotX() {
		return this.data.rotX
	}
	set RotX(v) {
		if (this.isDynamic) {
			this.state.rotX = v
		}
		this.data.rotX = v
	}
	/** Get RotY. */
	get RotY() {
		return this.data.rotY
	}
	set RotY(v) {
		if (this.isDynamic) {
			this.state.rotY = v
		}
		this.data.rotY = v
	}
	/** Get RotZ. */
	get RotZ() {
		return this.data.rotZ
	}
	set RotZ(v) {
		if (this.isDynamic) {
			this.state.rotZ = v
		}
		this.data.rotZ = v
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

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(RubberApi.prototype)
	}
}
