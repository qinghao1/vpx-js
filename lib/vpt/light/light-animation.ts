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
		const target = this.data.intensity * this.intensityScale * Math.max(0, Math.min(1, lightState))
		if (this.data.fader === Enums.Fader.None) {
			this.state.intensity = target
		} else if (this.state.intensity < target) {
			if (diff === 0) {
				const s = this.data.fadeSpeedUp
				if (!Number.isFinite(s)) this.state.intensity = target
				return
			}
			const s = this.data.fadeSpeedUp
			this.state.intensity = !Number.isFinite(s) ? target : Math.min(target, this.state.intensity + s * diff)
		} else if (this.state.intensity > target) {
			if (diff === 0) {
				const s = this.data.fadeSpeedDown
				if (!Number.isFinite(s)) this.state.intensity = target
				return
			}
			const s = this.data.fadeSpeedDown
			this.state.intensity = !Number.isFinite(s) ? target : Math.max(target, this.state.intensity - s * diff)
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
		const lightState =
			this.realState === Enums.LightStatus.LightStateBlinking ? (this.isBlinkOn() ? 1 : 0) : this.realState
		const target = this.data.intensity * this.intensityScale * Math.max(0, Math.min(1, lightState))
		this.state.intensity = target
	}

	private isBlinkOn(): boolean {
		return this.data.rgBlinkPattern.substr(this.iBlinkFrame, 1) === '1'
	}
}
