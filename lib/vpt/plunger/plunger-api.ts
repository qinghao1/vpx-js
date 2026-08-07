// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { IBallCreationPosition, Player } from '../../game/player.js'
import type { Ball } from '../ball/ball.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { PlungerData } from './plunger-data.js'
import type { PlungerHit } from './plunger-hit.js'

/** Plunger API — VBS surface for `Plunger`. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerApi extends ItemApi<PlungerData> {
	constructor(
		data: PlungerData,
		private readonly hit: PlungerHit,
		events: EventProxy,
		private readonly ballCreator: IBallCreationPosition,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
	}

	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	get Width() {
		return this.data.width
	}
	set Width(v) {
		this.data.width = v
	}
	get ZAdjust() {
		return this.data.zAdjust
	}
	set ZAdjust(v) {
		this.data.zAdjust = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get MechStrength() {
		return this.data.mechStrength
	}
	set MechStrength(v) {
		this.data.mechStrength = v
	}
	get MechPlunger() {
		return this.data.mechPlunger
	}
	set MechPlunger(v) {
		this.data.mechPlunger = v
	}
	get AutoPlunger() {
		return this.data.autoPlunger
	}
	set AutoPlunger(v) {
		this.data.autoPlunger = v
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}
	get ParkPosition() {
		return this.data.parkPosition
	}
	set ParkPosition(v) {
		this.data.parkPosition = v
	}
	get Stroke() {
		return this.data.stroke
	}
	set Stroke(v) {
		this.data.stroke = v
	}
	get ScatterVelocity() {
		return this.data.scatterVelocity
	}
	set ScatterVelocity(v) {
		this.data.scatterVelocity = v
	}
	get MomentumXfer() {
		return this.data.momentumXfer
	}
	set MomentumXfer(v) {
		this.data.momentumXfer = v
	}
	get ReflectionEnabled() {
		return this.data.isReflectionEnabled
	}
	set ReflectionEnabled(v) {
		this.data.isReflectionEnabled = v
	}
	get PullSpeed() {
		return this.data.speedPull
	}
	set PullSpeed(v) {
		this.data.speedPull = v
	}
	get FireSpeed() {
		return this.data.speedFire
	}
	set FireSpeed(v) {
		this.data.speedFire = v
	}
	get Type() {
		return this.data.type
	}
	set Type(v) {
		this.data.type = v
	}
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		this.data.szMaterial = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	get AnimFrames() {
		return this.data.animFrames
	}
	set AnimFrames(v) {
		this.data.animFrames = v
	}
	get TipShape() {
		return this.data.szTipShape
	}
	set TipShape(v) {
		this.data.szTipShape = v
	}
	get RodDiam() {
		return this.data.rodDiam
	}
	set RodDiam(v) {
		this.data.rodDiam = v
	}
	get RingGap() {
		return this.data.ringGap
	}
	set RingGap(v) {
		this.data.ringGap = v
	}
	get RingDiam() {
		return this.data.ringDiam
	}
	set RingDiam(v) {
		this.data.ringDiam = v
	}
	get RingWidth() {
		return this.data.ringWidth
	}
	set RingWidth(v) {
		this.data.ringWidth = v
	}
	get SpringDiam() {
		return this.data.springDiam
	}
	set SpringDiam(v) {
		this.data.springDiam = v
	}
	get SpringGauge() {
		return this.data.springGauge
	}
	set SpringGauge(v) {
		this.data.springGauge = v
	}
	get SpringLoops() {
		return this.data.springLoops
	}
	set SpringLoops(v) {
		this.data.springLoops = v
	}
	get SpringEndLoops() {
		return this.data.springEndLoops
	}
	set SpringEndLoops(v) {
		this.data.springEndLoops = v
	}

	public PullBack(): void {
		this.hit.getMoverObject().pullBack(this.data.speedPull)
	}

	public Fire(): void {
		if (this.data.autoPlunger) this.hit.getMoverObject().fire(1)
		else this.hit.getMoverObject().fire()
	}

	public CreateBall(): Ball {
		return this.player.createBall(this.ballCreator)
	}

	public Position(): number {
		const frame =
			(this.hit.getMoverObject().pos - this.hit.getMoverObject().frameStart) /
			(this.hit.getMoverObject().frameEnd - this.hit.getMoverObject().frameStart)
		return 25 - saturate(frame) * 25
	}

	public MotionDevice(): number {
		return 0
	}

	public InterfaceSupportsErrorInfo(_riid: unknown): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(PlungerApi.prototype)
	}
}

function saturate(n: number) {
	return Math.min(Math.max(n, 0), 1)
}
