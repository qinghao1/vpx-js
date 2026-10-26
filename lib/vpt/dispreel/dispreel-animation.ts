// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { IAnimation } from '../../game/interfaces.js'
import { MAX_REELS } from '../../physics/constants.js'
import type { Table } from '../table/table.js'
import type { DispReelData } from './dispreel.js'

/** Per-reel odometer state. Upstream `DispReel::ReelInfo`. `motorOffset` is a fraction of one digit (upstream pixels need the reel texture, unavailable headless); a renderer scales it by digit height. */
export interface ReelInfo {
	currentValue: number
	motorPulses: number
	motorStepCount: number
	motorCalcStep: number
	motorOffset: number
}

function blankReel(): ReelInfo {
	return { currentValue: 0, motorPulses: 0, motorStepCount: 0, motorCalcStep: 0, motorOffset: 0 }
}

/** EM-reel odometer state machine: queued motor pulses roll each reel one digit per `motorSteps` ticks, carrying into the left neighbor on wrap.
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/dispreel.cpp */
export class DispReelAnimation implements IAnimation {
	private readonly reels: ReelInfo[] = []
	private timeNextUpdate = 0

	constructor(
		private readonly data: DispReelData,
		private readonly events: EventProxy,
	) {
		for (let reelIndex = 0; reelIndex < MAX_REELS; reelIndex++) {
			this.reels.push(blankReel())
		}
	}

	public init(timeMsec: number): void {
		this.resetSchedule(timeMsec)
	}

	public resetSchedule(timeMsec: number): void {
		this.timeNextUpdate = timeMsec + this.data.updateInterval
	}

	public getReelValues(): number[] {
		return this.reels.slice(0, this.data.reelCount).map(reel => reel.currentValue)
	}

	public addValue(value: number): void {
		const isNegative = value < 0
		let remaining = Math.floor(Math.abs(value))
		const base = this.data.digitRange + 1
		let reelIndex = this.data.reelCount - 1
		while (remaining !== 0 && reelIndex >= 0) {
			const digitValue = remaining % base
			remaining = Math.floor(remaining / base)
			if (isNegative) this.reels[reelIndex].motorPulses -= digitValue
			else this.reels[reelIndex].motorPulses += digitValue
			reelIndex--
		}
	}

	public setValue(value: number, timeMsec: number): void {
		let remaining = Math.floor(Math.abs(value))
		const base = this.data.digitRange + 1
		for (let reelIndex = 0; reelIndex < this.data.reelCount; reelIndex++) {
			this.reels[reelIndex] = blankReel()
		}
		let reelIndex = this.data.reelCount - 1
		while (remaining !== 0 && reelIndex >= 0) {
			const digitValue = remaining % base
			remaining = Math.floor(remaining / base)
			this.reels[reelIndex].currentValue = digitValue
			reelIndex--
		}
		this.timeNextUpdate = timeMsec
	}

	public resetToZero(): void {
		let carry = 0
		const overflowValue = this.data.digitRange + 1
		for (let reelIndex = this.data.reelCount - 1; reelIndex >= 0; reelIndex--) {
			const adjust = overflowValue - carry - this.reels[reelIndex].currentValue
			carry = 0
			if (adjust !== overflowValue) {
				this.reels[reelIndex].motorPulses = adjust
				carry = 1
			}
		}
	}

	public spinReel(reelNumber: number, pulseCount: number): void {
		if (reelNumber < 1 || reelNumber > this.data.reelCount) {
			throw new Error(`Reel number ${reelNumber} out of range 1..${this.data.reelCount}.`)
		}
		this.reels[reelNumber - 1].motorPulses += pulseCount
	}

	public updateAnimation(timeMsec: number, table: Table): boolean {
		let animated = false
		while (timeMsec >= this.timeNextUpdate) {
			this.timeNextUpdate += this.data.updateInterval
			const overflowValue = this.data.digitRange
			const adjustValue = overflowValue + 1
			const step = 1 / this.data.motorSteps
			for (let reelIndex = this.data.reelCount - 1; reelIndex >= 0; reelIndex--) {
				const reel = this.reels[reelIndex]
				if (reel.motorPulses !== 0 && reel.motorStepCount === 0) {
					reel.motorStepCount = this.data.motorSteps
					reel.motorCalcStep = reel.motorPulses > 0 ? step : -step
					reel.motorOffset = 0
					if (this.data.szSound) {
						table.getApi().PlaySound(this.data.szSound, 0, 1.0, 0, 0, 0, false, true, 0)
					}
					animated = true
				}
				if (reel.motorStepCount !== 0) {
					reel.motorOffset += reel.motorCalcStep
					reel.motorStepCount--
					if (reel.motorStepCount <= 0) {
						reel.motorStepCount = 0
						reel.motorOffset = 0
						if (reel.motorPulses < 0) {
							reel.motorPulses++
							reel.currentValue--
							if (reel.currentValue < 0) {
								reel.currentValue += adjustValue
								if (reelIndex !== 0) this.reels[reelIndex - 1].motorPulses--
							}
						} else {
							reel.motorPulses--
							reel.currentValue++
							if (reel.currentValue > overflowValue) {
								reel.currentValue -= adjustValue
								if (reelIndex !== 0) this.reels[reelIndex - 1].motorPulses++
							}
						}
					}
					animated = true
				}
			}
		}
		if (animated) this.events.fireGroupEvent(Event.AnimateEventsAnimate)
		return animated
	}
}
