// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IAnimation } from '../../game/ianimatable.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import type { LightData } from './light-data.js'
import type { LightState } from './light-state.js'

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
		this.realState = this.data.state
	}

	public init(): void {}

	public setState(newVal: number, physics: PlayerPhysics) {
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
		const oldTimeMsec = this.timeMsec < newTimeMsec ? this.timeMsec : newTimeMsec
		this.timeMsec = newTimeMsec
		const diffTimeMsec = newTimeMsec - oldTimeMsec
		if (this.duration > 0 && this.timerDurationEndTime < this.timeMsec) {
			this.realState = this.finalState
			this.duration = 0
			if (this.realState === Enums.LightStatus.LightStateBlinking) this.restartBlinker(newTimeMsec)
		}
		if (this.realState === Enums.LightStatus.LightStateBlinking) this.updateBlinker(newTimeMsec)
		if (this.isOn()) {
			if (this.state.intensity < this.data.intensity * this.intensityScale) {
				this.state.intensity += this.data.fadeSpeedUp * diffTimeMsec
				if (this.state.intensity > this.data.intensity * this.intensityScale)
					this.state.intensity = this.data.intensity * this.intensityScale
			}
		} else {
			if (this.state.intensity > 0) {
				this.state.intensity -= this.data.fadeSpeedDown * diffTimeMsec
				if (this.state.intensity < 0) this.state.intensity = 0
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
		this.realState = startState
		this.duration = duration
		this.finalState = endState
		this.timerDurationEndTime = timeMsec + this.duration
		if (this.realState === Enums.LightStatus.LightStateBlinking) {
			this.iBlinkFrame = 0
			this.timeNextBlink = timeMsec + this.data.blinkInterval
		}
	}

	public updateIntensity() {
		if (this.isOn()) this.state.intensity = this.data.intensity * this.intensityScale
	}

	private isOn(): boolean {
		return this.realState === Enums.LightStatus.LightStateBlinking
			? this.isBlinkOn()
			: this.realState !== Enums.LightStatus.LightStateOff
	}

	private isBlinkOn(): boolean {
		return this.data.rgBlinkPattern.substr(this.iBlinkFrame, 1) === '1'
	}
}
