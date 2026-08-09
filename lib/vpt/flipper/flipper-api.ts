// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { clamp } from '../../util/functions.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { FlipperData } from './flipper-data.js'
import type { FlipperHit } from './flipper-hit.js'
import type { FlipperMover } from './flipper-mover.js'
import type { FlipperState } from './flipper-state.js'

/** Flipper API — VBS surface for `Flipper`. @see https://github.com/vpinball/vpinball/blob/master/flipper.cpp */
export class FlipperApi extends ItemApi<FlipperData> {
	constructor(
		data: FlipperData,
		private readonly state: FlipperState,
		private readonly hit: FlipperHit,
		private readonly mover: FlipperMover,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get BaseRadius() {
		return this.data.baseRadius
	}
	set BaseRadius(v) {
		this.data.baseRadius = v
	}
	get EndRadius() {
		return this.data.endRadius
	}
	set EndRadius(v) {
		this.data.endRadius = v
	}
	get Length() {
		return this.data.flipperRadiusMax
	}
	set Length(v) {
		this.data.flipperRadiusMax = v
	}
	get EOSTorque() {
		return this.data.doOverridePhysics(this.table) ? this.data.overrideTorqueDamping : this.data.torqueDamping
	}
	set EOSTorque(v) {
		if (!this.data.doOverridePhysics(this.table)) this.data.torqueDamping = v
	}
	get EOSTorqueAngle() {
		return this.data.doOverridePhysics(this.table)
			? this.data.overrideTorqueDampingAngle
			: this.data.torqueDampingAngle
	}
	set EOSTorqueAngle(v) {
		if (!this.data.doOverridePhysics(this.table)) this.data.torqueDampingAngle = v
	}
	get X() {
		return this.state.center.x
	}
	set X(v) {
		this.state.center.x = v
	}
	get Y() {
		return this.state.center.y
	}
	set Y(v) {
		this.state.center.y = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	set StartAngle(v) {
		this.data.startAngle = v
		this.mover.setStartAngle(MathUtils.degToRad(v))
	}
	get StartAngle() {
		return this.data.startAngle
	}
	set EndAngle(v) {
		this.data.endAngle = v
		this.mover.setEndAngle(MathUtils.degToRad(v))
	}
	get EndAngle() {
		return this.data.endAngle
	}
	get CurrentAngle() {
		return MathUtils.radToDeg(this.state.angle)
	}
	get Material() {
		return this.state.material
	}
	set Material(v) {
		this.state.material = v
	}
	get Mass() {
		return this.mover.getMass()
	}
	set Mass(v) {
		if (!this.data.doOverridePhysics(this.table)) this.mover.setMass(v)
	}
	get OverridePhysics() {
		return this.data.overridePhysics
	}
	set OverridePhysics(v) {
		this.data.overridePhysics = v
		this.data.updatePhysicsSettings(this.table)
		this.hit.updatePhysicsFromFlipper()
	}
	get RubberMaterial() {
		return this.state.rubberMaterial
	}
	set RubberMaterial(v) {
		this.state.rubberMaterial = v
	}
	get RubberThickness() {
		return this.data.rubberThickness
	}
	set RubberThickness(v) {
		this.data.rubberThickness = v
	}
	get RubberWidth() {
		return this.data.rubberWidth
	}
	set RubberWidth(v) {
		this.data.rubberWidth = v
	}
	get RubberHeight() {
		return this.data.rubberHeight
	}
	set RubberHeight(v) {
		this.data.rubberHeight = v
	}
	get Strength() {
		return this.data.strength
	}
	set Strength(v) {
		if (!this.data.doOverridePhysics(this.table)) this.data.strength = v
	}
	get Visible() {
		return this.state.isVisible
	}
	set Visible(v) {
		this.state.isVisible = v
	}
	get Enabled() {
		return this.data.isEnabled
	}
	set Enabled(v) {
		this.data.isEnabled = v
	}
	get Elasticity() {
		return this.hit.elasticity
	}
	set Elasticity(v) {
		if (!this.data.doOverridePhysics(this.table)) this.hit.elasticity = v
	}
	get ElasticityFalloff() {
		return this.hit.elasticityFalloff
	}
	set ElasticityFalloff(v) {
		if (!this.data.doOverridePhysics(this.table)) this.hit.elasticityFalloff = v
	}
	get Scatter() {
		return this.hit.scatter
	}
	set Scatter(v) {
		if (!this.data.doOverridePhysics(this.table)) this.hit.scatter = v
	}
	get Friction() {
		return this.hit.friction
	}
	set Friction(v) {
		this.hit.setFriction(v)
	}
	get RampUp() {
		return this.data.doOverridePhysics(this.table) ? this.data.overrideCoilRampUp : this.data.rampUp
	}
	set RampUp(v) {
		if (!this.data.doOverridePhysics(this.table)) this.data.rampUp = v
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get Return() {
		return this.mover.getReturnRatio()
	}
	set Return(v) {
		if (!this.data.doOverridePhysics(this.table)) this.data.return = clamp(v, 0, 1)
	}
	get FlipperRadiusMin() {
		return this.data.flipperRadiusMin
	}
	set FlipperRadiusMin(v) {
		if (v < 0) v = 0
		this.data.flipperRadiusMin = v
	}
	get Image() {
		return this.state.texture
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.state.texture = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}

	public RotateToEnd(): void {
		this.mover.enableRotateEvent = 1
		this.mover.setSolenoidState(true)
	}

	public RotateToStart(): void {
		this.mover.enableRotateEvent = -1
		this.mover.setSolenoidState(false)
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(FlipperApi.prototype)
	}
}
