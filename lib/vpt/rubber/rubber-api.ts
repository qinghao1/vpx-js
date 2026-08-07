// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { HitObject } from '../../physics/hit-object.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { RubberData } from './rubber-data.js'
import type { RubberState } from './rubber-state.js'

/** Rubber API — VBS surface for `Rubber`. @see https://github.com/vpinball/vpinball/blob/master/rubber.cpp */
export class RubberApi extends ItemApi<RubberData> {
	private readonly isDynamic: boolean

	constructor(
		private readonly state: RubberState,
		private readonly hits: HitObject[],
		data: RubberData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.isDynamic = !data.staticRendering
	}

	get Height() {
		return this.data.height
	}
	set Height(v) {
		if (this.isDynamic) this.state.height = v
		this.data.height = v
	}
	get HitHeight() {
		return this.data.hitHeight
	}
	set HitHeight(v) {
		this.data.hitHeight = v
	}
	get Thickness() {
		return this.data.thickness
	}
	set Thickness(v) {
		this.data.thickness = v
	}
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		if (this.isDynamic) this.state.material = v
		this.data.szMaterial = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		if (this.isDynamic) this.state.texture = v
		this.data.szImage = v
	}
	get HasHitEvent() {
		return this.data.hitEvent
	}
	set HasHitEvent(v) {
		this.data.hitEvent = v
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
		return this.hits[0].isEnabled
	}
	set Collidable(v) {
		if (v !== this.Collidable) for (const hit of this.hits) hit.isEnabled = v
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		if (this.isDynamic) this.state.isVisible = v
		this.data.isVisible = v
	}
	get EnableStaticRendering() {
		return this.data.staticRendering
	}
	set EnableStaticRendering(v) {
		this.data.staticRendering = v
	}
	get EnableShowInEditor() {
		return this.data.showInEditor
	}
	set EnableShowInEditor(v) {
		this.data.showInEditor = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get RotX() {
		return this.data.rotX
	}
	set RotX(v) {
		if (this.isDynamic) this.state.rotX = v
		this.data.rotX = v
	}
	get RotY() {
		return this.data.rotY
	}
	set RotY(v) {
		if (this.isDynamic) this.state.rotY = v
		this.data.rotY = v
	}
	get RotZ() {
		return this.data.rotZ
	}
	set RotZ(v) {
		if (this.isDynamic) this.state.rotZ = v
		this.data.rotZ = v
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

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(RubberApi.prototype)
	}
}
