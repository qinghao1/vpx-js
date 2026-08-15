// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { LightData } from './light-data.js'
import type { LightState } from './light-state.js'

/** Clamps light state according to VPinball rules (0..1, 2 for blinking, -1/255 -> 1). */
export function clampLightState(state: number): number {
	if (state < 0) return 1
	if (state === 2) return 2
	if (state > 1) return 1
	return state
}

/** Light animation. @see https://github.com/vpinball/vpinball/blob/master/light.cpp */
export class LightAnimation implements IAnimation {
	public realState: number = Enums.LightStatus.LightStateOff
	public finalState: number = Enums.LightStatus.LightStateOff
	public lockedByLS = false
	public timeNextBlink = 0
	public intensityScale = 1

	private timeMsec = 0
	private timerDurationEndTime = 0
	private duration = 0
	private iBlinkFrame = 0

	constructor(
		private readonly data: LightData,
		private readonly state: LightState,
	) {
		this.realState = clampLightState(this.data.state)
	}

	public init(timeMsec = 0): void {
		this.timeMsec = timeMsec
		if (this.realState === Enums.LightStatus.LightStateBlinking) {
			this.restartBlinker(timeMsec)
		}
	}

	public setState(newVal: number, physics: PlayerPhysics) {
		newVal = clampLightState(newVal)
		if (newVal !== this.realState) {
			this.realState = newVal
			if (this.realState === Enums.LightStatus.LightStateBlinking) {
				this.timeNextBlink = physics.timeMsec
				this.iBlinkFrame = 0
			}
			if (this.duration > 0) this.duration = 0
		}
	}

	public restartBlinker(timeMsec: number) {
		this.iBlinkFrame = 0
		this.timeNextBlink = timeMsec + this.data.blinkInterval
		this.timerDurationEndTime = timeMsec + this.duration
	}

	public updateAnimation(newTimeMsec: number, _table: Table): void {
		if (!this.data.isVisible) return
		const diff = Math.max(0, newTimeMsec - this.timeMsec)
		this.timeMsec = newTimeMsec
		if (this.duration > 0 && this.timerDurationEndTime < this.timeMsec) {
			this.realState = this.finalState
			this.duration = 0
			if (this.realState === Enums.LightStatus.LightStateBlinking) this.restartBlinker(newTimeMsec)
		}
		if (this.realState === Enums.LightStatus.LightStateBlinking) this.updateBlinker(newTimeMsec)
		const lightState =
			this.realState === Enums.LightStatus.LightStateBlinking ? (this.isBlinkOn() ? 1 : 0) : this.realState
		const safeIntensity =
			Math.max(0, this.data.intensity / Math.max(0.001, this.intensityScale || 1)) *
			Math.max(0.001, this.intensityScale || 1)
		const clampedIntensity = Math.max(0, Math.min(100000, safeIntensity))
		const target = clampedIntensity * Math.max(0, Math.min(1, lightState))
		if (!this.data.fader || this.data.fader === 0) {
			this.state.intensity = target
		} else if (this.state.intensity < target) {
			const s = this.data.fadeSpeedUp > 0 ? this.data.fadeSpeedUp : 0
			if (s <= 0 || diff === 0) {
				this.state.intensity = target
			} else {
				this.state.intensity = Math.min(target, this.state.intensity + s * diff)
			}
		} else if (this.state.intensity > target) {
			const s = this.data.fadeSpeedDown > 0 ? this.data.fadeSpeedDown : 0
			if (s <= 0 || diff === 0) {
				this.state.intensity = target
			} else {
				this.state.intensity = Math.max(target, this.state.intensity - s * diff)
			}
		}
	}

	private updateBlinker(timeMsec: number) {
		if (this.timeNextBlink <= timeMsec) {
			this.iBlinkFrame++
			if (this.iBlinkFrame >= this.data.rgBlinkPattern.length) this.iBlinkFrame = 0
			this.timeNextBlink += this.data.blinkInterval
		}
	}

	public setDuration(startState: number, duration: number, endState: number, timeMsec: number) {
		this.realState = clampLightState(startState)
		this.duration = duration
		this.finalState = clampLightState(endState)
		this.timerDurationEndTime = timeMsec + this.duration
		if (this.realState === Enums.LightStatus.LightStateBlinking) {
			this.iBlinkFrame = 0
			this.timeNextBlink = timeMsec + this.data.blinkInterval
		}
	}

	public updateIntensity() {
		const lightState =
			this.realState === Enums.LightStatus.LightStateBlinking ? (this.isBlinkOn() ? 1 : 0) : this.realState
		const safeIntensity =
			Math.max(0, this.data.intensity / Math.max(0.001, this.intensityScale || 1)) *
			Math.max(0.001, this.intensityScale || 1)
		const clampedIntensity = Math.max(0, Math.min(100000, safeIntensity))
		const target = clampedIntensity * Math.max(0, Math.min(1, lightState))
		this.state.intensity = target
	}

	private isBlinkOn(): boolean {
		return this.data.rgBlinkPattern.substr(this.iBlinkFrame, 1) === '1'
	}
}
