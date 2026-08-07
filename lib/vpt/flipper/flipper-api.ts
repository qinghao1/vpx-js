// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { degToRad, radToDeg } from '../../math/float.js'
import { clamp } from '../../math/functions.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperHit } from './flipper-hit.js'
import type { FlipperMover } from './flipper-mover.js'
import type { FlipperState } from './flipper-state.js'

/** Flipper API. */
export class FlipperApi extends ItemApi<FlipperData> {
	private readonly state: FlipperState
	private readonly hit: FlipperHit
	private readonly mover: FlipperMover

	constructor(
		data: FlipperData,
		state: FlipperState,
		hit: FlipperHit,
		mover: FlipperMover,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.hit = hit
		this.mover = mover
	}

	/** Get BaseRadius. */
	get BaseRadius() {
		return this.data.baseRadius
	}
	set BaseRadius(v) {
		this.data.baseRadius = v
	}
	/** Get EndRadius. */
	get EndRadius() {
		return this.data.endRadius
	}
	set EndRadius(v) {
		this.data.endRadius = v
	}
	/** Get Length. */
	get Length() {
		return this.data.flipperRadiusMax
	}
	set Length(v) {
		this.data.flipperRadiusMax = v
	}
	/** Get EOSTorque. */
	get EOSTorque() {
		return this.data.doOverridePhysics(this.table) ? this.data.overrideTorqueDamping : this.data.torqueDamping
	}
	set EOSTorque(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.data.torqueDamping = v
		}
	}
	/** Get EOSTorqueAngle. */
	get EOSTorqueAngle() {
		return this.data.doOverridePhysics(this.table) ? this.data.overrideTorqueDampingAngle : this.data.torqueDampingAngle
	}
	set EOSTorqueAngle(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.data.torqueDampingAngle = v
		}
	}
	/** Get X. */
	get X() {
		return this.state.center.x
	}
	set X(v) {
		this.state.center.x = v
	}
	/** Get Y. */
	get Y() {
		return this.state.center.y
	}
	set Y(v) {
		this.state.center.y = v
	}
	/** Get Surface. */
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	set StartAngle(v) {
		this.data.startAngle = v
		this.mover.setStartAngle(degToRad(v))
	}
	/** Get StartAngle. */
	get StartAngle() {
		return this.data.startAngle
	}
	set EndAngle(v) {
		this.data.endAngle = v
		this.mover.setEndAngle(degToRad(v))
	}
	/** Get EndAngle. */
	get EndAngle() {
		return this.data.endAngle
	}
	/** Get CurrentAngle. */
	get CurrentAngle() {
		return radToDeg(this.state.angle)
	}
	/** Get Material. */
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}
	/** Get Mass. */
	get Mass() {
		return this.mover.getMass()
	}
	set Mass(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.mover.setMass(v)
		}
	}
	/** Get OverridePhysics. */
	get OverridePhysics() {
		return this.data.overridePhysics
	}
	set OverridePhysics(v) {
		this.data.overridePhysics = v
		this.data.updatePhysicsSettings(this.table)
		this.hit.updatePhysicsFromFlipper()
	}
	/** Get RubberMaterial. */
	get RubberMaterial() {
		return this.state.rubberMaterial
	}
	set RubberMaterial(v) {
		this.state.rubberMaterial = v
	}
	/** Get RubberThickness. */
	get RubberThickness() {
		return this.data.rubberThickness
	}
	set RubberThickness(v) {
		this.data.rubberThickness = v
	}
	/** Get RubberWidth. */
	get RubberWidth() {
		return this.data.rubberWidth
	}
	set RubberWidth(v) {
		this.data.rubberWidth = v
	}
	/** Get RubberHeight. */
	get RubberHeight() {
		return this.data.rubberHeight
	}
	set RubberHeight(v) {
		this.data.rubberHeight = v
	}
	/** Get Strength. */
	get Strength() {
		return this.data.strength
	}
	set Strength(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.data.strength = v
		}
	}
	/** Get Visible. */
	get Visible() {
		return this.state.isVisible
	}
	set Visible(v) {
		this.state.isVisible = v
	}
	/** Get Enabled. */
	get Enabled() {
		return this.data.isEnabled
	}
	set Enabled(v) {
		this.data.isEnabled = v
	}
	/** Get Elasticity. */
	get Elasticity() {
		return this.hit.elasticity
	}
	set Elasticity(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.hit.elasticity = v
		}
	}
	/** Get ElasticityFalloff. */
	get ElasticityFalloff() {
		return this.hit.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.hit.elasticityFalloff = v
		}
	}
	/** Get Scatter. */
	get Scatter() {
		return this.hit.scatter
	}
	set Scatter(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.hit.scatter = v
		}
	}
	/** Get Friction. */
	get Friction() {
		return this.hit.friction
	}
	set Friction(v) {
		this.hit.setFriction(v)
	}
	/** Get RampUp. */
	get RampUp() {
		return this.data.doOverridePhysics(this.table) ? this.data.overrideCoilRampUp : this.data.rampUp
	}
	set RampUp(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.data.rampUp = v
		}
	}
	/** Get Height. */
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	/** Get Return. */
	get Return() {
		return this.mover.getReturnRatio()
	}
	set Return(v) {
		if (!this.data.doOverridePhysics(this.table)) {
			this.data.return = clamp(v, 0.0, 1.0)
		}
	}
	/** Get FlipperRadiusMin. */
	get FlipperRadiusMin() {
		return this.data.flipperRadiusMin
	}
	set FlipperRadiusMin(v) {
		if (v < 0) {
			v = 0
		}
		this.data.flipperRadiusMin = v
	}
	/** Get Image. */
	get Image() {
		return this.state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.state.texture = v
	}
	/** Get ReflectionEnabled. */
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}

	/**
	 * Power stroke to hit ball, key/button down/pressed
	 */
	public RotateToEnd(): void {
		this.mover.enableRotateEvent = 1
		this.mover.setSolenoidState(true)
	}

	/**
	 * Return to park, key/button up/released
	 */
	public RotateToStart() {
		this.mover.enableRotateEvent = -1
		this.mover.setSolenoidState(false)
	}

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(FlipperApi.prototype)
	}
}
