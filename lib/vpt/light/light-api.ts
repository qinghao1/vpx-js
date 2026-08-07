// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import type { LightAnimation } from './light-animation.js'
import type { LightData } from './light-data.js'
import type { LightState } from './light-state.js'

/** Light API. */
export class LightApi extends ItemApi<LightData> {
	private readonly state: LightState
	private readonly animation: LightAnimation

	constructor(
		state: LightState,
		animation: LightAnimation,
		data: LightData,
		events: EventProxy,
		player: Player,
		table: Table,
	) {
		super(data, events, player, table)
		this.state = state
		this.animation = animation
	}

	/** Get Falloff. */
	get Falloff() {
		return this.data.falloff
	}
	set Falloff(v) {
		if (v > 0) {
			this.data.falloff = v
		}
	}
	/** Get FalloffPower. */
	get FalloffPower() {
		return this.data.falloffPower
	}
	set FalloffPower(v) {
		this.data.falloffPower = v
	}
	/** Get State. */
	get State() {
		return this.animation.lockedByLS ? this.data.state : this.animation.realState
	}
	set State(v) {
		/* istanbul ignore next: No light sequences yet */
		if (!this.animation.lockedByLS) {
			this.animation.setState(v, this.player.getPhysics())
		}
		this.data.state = v
	}
	/** Get Color. */
	get Color() {
		return this.state.color
	}
	set Color(v) {
		this.state.color = v
	}
	/** Get ColorFull. */
	get ColorFull() {
		return this.state.colorFull
	}
	set ColorFull(v) {
		this.state.colorFull = v
	}
	/** Get X. */
	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	/** Get Y. */
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	/** Get BlinkPattern. */
	get BlinkPattern() {
		return this.data.rgBlinkPattern
	}
	set BlinkPattern(v) {
		this.data.rgBlinkPattern = v || '0'
		this.animation.restartBlinker(this.player.getPhysics().timeMsec)
	}
	/** Get BlinkInterval. */
	get BlinkInterval() {
		return this.data.blinkInterval
	}
	set BlinkInterval(v) {
		this.data.blinkInterval = v
		this.animation.timeNextBlink = this.player.getPhysics().timeMsec + this.data.blinkInterval
	}
	/** Get Intensity. */
	get Intensity() {
		return this.data.intensity
	}
	set Intensity(v) {
		this.data.intensity = Math.max(0, v)
		this.animation.updateIntensity()
	}
	/** Get TransmissionScale. */
	get TransmissionScale() {
		return this.data.transmissionScale
	}
	set TransmissionScale(v) {
		this.data.transmissionScale = Math.max(0, v)
	}
	/** Get IntensityScale. */
	get IntensityScale() {
		return this.animation.intensityScale
	}
	set IntensityScale(v) {
		this.animation.intensityScale = v
		this.animation.updateIntensity()
	}
	/** Get Surface. */
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	/** Get Image. */
	get Image() {
		return this.data.szOffImage
	}
	set Image(v) {
		this.data.szOffImage = v
	}
	/** Get DepthBias. */
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(v) {
		this.data.depthBias = v
	}
	/** Get FadeSpeedUp. */
	get FadeSpeedUp() {
		return this.data.fadeSpeedUp
	}
	set FadeSpeedUp(v) {
		this.data.fadeSpeedUp = v
	}
	/** Get FadeSpeedDown. */
	get FadeSpeedDown() {
		return this.data.fadeSpeedDown
	}
	set FadeSpeedDown(v) {
		this.data.fadeSpeedDown = v
	}
	/** Get Bulb. */
	get Bulb() {
		return this.data.bulbLight
	}
	set Bulb(v) {
		this.data.bulbLight = v
	}
	/** Get ImageMode. */
	get ImageMode() {
		return this.data.imageMode
	}
	set ImageMode(v) {
		this.data.imageMode = v
	}
	/** Get ShowBulbMesh. */
	get ShowBulbMesh() {
		return this.data.showBulbMesh
	}
	set ShowBulbMesh(v) {
		this.data.showBulbMesh = v
	}
	/** Get StaticBulbMesh. */
	get StaticBulbMesh() {
		return this.data.staticBulbMesh
	}
	set StaticBulbMesh(v) {
		this.data.staticBulbMesh = v
	}
	/** Get ShowReflectionOnBall. */
	get ShowReflectionOnBall() {
		return this.data.showReflectionOnBall
	}
	set ShowReflectionOnBall(v) {
		this.data.showReflectionOnBall = v
	}
	/** Get ScaleBulbMesh. */
	get ScaleBulbMesh() {
		return this.data.meshRadius
	}
	set ScaleBulbMesh(v) {
		this.data.meshRadius = v
	}
	/** Get BulbModulateVsAdd. */
	get BulbModulateVsAdd() {
		return this.data.bulbModulateVsAdd
	}
	set BulbModulateVsAdd(v) {
		this.data.bulbModulateVsAdd = v
	}
	/** Get BulbHaloHeight. */
	get BulbHaloHeight() {
		return this.data.bulbHaloHeight
	}
	set BulbHaloHeight(v) {
		this.data.bulbHaloHeight = v
	}
	/** Get Visible. */
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}

	public Duration(startState: number, duration: number, endState: number) {
		this.animation.setDuration(startState, duration, endState, this.player.getPhysics().timeMsec)
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(LightApi.prototype)
	}
}
