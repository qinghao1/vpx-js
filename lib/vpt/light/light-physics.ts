// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { tryGetFloatState } from '../../emu/res-uri.js'
import type { IEmulator } from '../../game/iemulator.js'
import type { IAnimation } from '../../game/interfaces.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { Enums } from '../enums.js'
import type { Table } from '../table/table.js'
import {
	BULB_AMBIENT_TEMPERATURE,
	BULB_LIT_TEMPERATURE,
	bulbCoolDown,
	bulbEmissionToFilamentTemperature,
	bulbFilamentTemperatureToEmission,
	bulbHeatUp,
} from './bulb.js'
import type { LightData, LightState } from './light.js'

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
	public filamentTemperature = BULB_AMBIENT_TEMPERATURE

	private timeMsec = 0
	private timerDurationEndTime = 0
	private duration = 0
	private iBlinkFrame = 0

	constructor(
		private readonly data: LightData,
		private readonly state: LightState,
		private readonly emuProvider?: () => IEmulator | undefined,
	) {
		this.realState = clampLightState(this.data.state)
		this.filamentTemperature = this.resolvedLightState() < 0.5 ? BULB_AMBIENT_TEMPERATURE : BULB_LIT_TEMPERATURE
	}

	public init(timeMsec = 0): void {
		this.timeMsec = timeMsec
		if (this.realState === Enums.LightStatus.LightStateBlinking) {
			this.restartBlinker(timeMsec)
		}
	}

	public setState(newVal: number, physics: PlayerPhysics) {
		this.setInPlayState(newVal, physics.timeMsec)
	}

	/** Sets the in-play state, resetting blink pattern and duration on change. @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp (`Light::setInPlayState`) */
	private setInPlayState(newVal: number, timeMsec: number): void {
		newVal = clampLightState(newVal)
		if (newVal !== this.realState) {
			this.realState = newVal
			if (this.realState === Enums.LightStatus.LightStateBlinking) {
				this.timeNextBlink = timeMsec
				this.iBlinkFrame = 0
			}
			if (this.duration > 0) this.duration = 0
		}
	}

	/** Drives the in-play state from the controller link, unless locked by a light sequence. @see https://github.com/vpinball/vpinball/blob/master/src/parts/light.cpp (`Light::UpdateAnimation`) */
	private applyLinkedState(timeMsec: number): void {
		if (!this.data.stateSrcLink || this.lockedByLS || !this.emuProvider) return
		const linked = tryGetFloatState(this.emuProvider(), this.data.stateSrcLink)
		if (linked.ok) this.setInPlayState(linked.value, timeMsec)
	}

	public restartBlinker(timeMsec: number) {
		this.iBlinkFrame = 0
		this.timeNextBlink = timeMsec + this.data.blinkInterval
		this.timerDurationEndTime = timeMsec + this.duration
	}

	public updateAnimation(newTimeMsec: number, _table: Table): boolean {
		this.applyLinkedState(newTimeMsec)
		const prevIntensity = this.state.intensity
		const diff = Math.max(0, newTimeMsec - this.timeMsec)
		this.timeMsec = newTimeMsec
		if (this.duration > 0 && this.timerDurationEndTime < this.timeMsec) {
			this.realState = this.finalState
			this.duration = 0
			if (this.realState === Enums.LightStatus.LightStateBlinking) this.restartBlinker(newTimeMsec)
		}
		if (this.realState === Enums.LightStatus.LightStateBlinking) this.updateBlinker(newTimeMsec)
		const target = this.targetIntensity()
		if (this.state.intensity !== target) {
			if (!this.data.fader || this.data.fader === Enums.Fader.None) {
				this.state.intensity = target
			} else if (this.data.fader === Enums.Fader.Incandescent) {
				this.updateIncandescent(target, diff)
			} else if (this.state.intensity < target) {
				const speed = this.data.fadeSpeedUp
				if (!(speed > 0)) {
					this.state.intensity = target
				} else if (diff > 0) {
					this.state.intensity = Math.min(target, this.state.intensity + speed * diff)
				}
			} else if (this.state.intensity > target) {
				const speed = this.data.fadeSpeedDown
				if (!(speed > 0)) {
					this.state.intensity = target
				} else if (diff > 0) {
					this.state.intensity = Math.max(target, this.state.intensity - speed * diff)
				}
			}
		}
		return this.state.intensity !== prevIntensity
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

	/** Blink-resolved on/off level. @see Light::GetInPlayStateBool in src/parts/light.cpp */
	public isInPlayOn(): boolean {
		return this.realState === Enums.LightStatus.LightStateBlinking ? this.isBlinkOn() : this.realState !== 0
	}

	/**
	 * Filament temperature for the live intensity, by inverting the emission curve.
	 * Upstream derives this from the current intensity rather than the simulated
	 * temperature so non-incandescent faders report a sane value too.
	 * @see Light::get_FilamentTemperature in src/parts/light.cpp
	 */
	public getFilamentTemperature(): number {
		const fullScale = this.fullScaleIntensity()
		if (fullScale <= 0) {
			return BULB_AMBIENT_TEMPERATURE
		}
		return bulbEmissionToFilamentTemperature(this.state.intensity / fullScale)
	}

	public updateIntensity() {
		// Upstream put_Intensity/put_IntensityScale store the value and snap the
		// live intensity unconditionally, for every fader including incandescent.
		// @see Light::put_Intensity/put_IntensityScale in src/parts/light.cpp
		this.state.intensity = this.targetIntensity()
		if (this.data.fader === Enums.Fader.Incandescent) {
			// Keep the filament integrator consistent with the snapped value
			// (as creation does); otherwise the next UpdateAnimation would
			// resume heating/cooling from a stale temperature and jump.
			const fullScale = this.fullScaleIntensity()
			this.filamentTemperature =
				fullScale <= 0
					? BULB_AMBIENT_TEMPERATURE
					: bulbEmissionToFilamentTemperature(this.state.intensity / fullScale)
		}
	}

	/**
	 * Incandescent fade: tungsten filament warm-up/cool-down.
	 * @see Light::UpdateAnimation (FADER_INCANDESCENT) in src/parts/light.cpp
	 */
	private updateIncandescent(target: number, diffMsec: number): void {
		const fullScale = this.fullScaleIntensity()
		if (fullScale <= 0) {
			return
		}
		const fadeSpeed = this.state.intensity < target ? this.data.fadeSpeedUp : this.data.fadeSpeedDown
		const invFadeSpeed = fadeSpeed / fullScale
		// A #44 bulb reaches full power in 30-40ms; clamp at 500ms since the bulb reaches a stable state anyway.
		const remainingTime = Math.min(0.5, diffMsec * 0.001 * 40 * invFadeSpeed)
		const lightState = this.resolvedLightState()
		if (lightState !== 0) {
			// Modulating by emission^0.25 ignores visible/non-visible wavelengths but is an acceptable approximation.
			const voltage = 6.3 * Math.sqrt(Math.sqrt(lightState))
			this.filamentTemperature = bulbHeatUp(this.filamentTemperature, remainingTime, voltage)
		} else {
			this.filamentTemperature = bulbCoolDown(this.filamentTemperature, remainingTime)
		}
		this.state.intensity = bulbFilamentTemperatureToEmission(this.filamentTemperature) * fullScale
	}

	/** Base intensity × scale, the level a fully heated filament emits. */
	private fullScaleIntensity(): number {
		const scaled = Math.max(0, this.data.intensity) * Math.max(0, this.intensityScale)
		return Math.min(100000, scaled)
	}

	/** Blink-aware on/off level in 0..1. */
	private resolvedLightState(): number {
		const rawState =
			this.realState === Enums.LightStatus.LightStateBlinking ? (this.isBlinkOn() ? 1 : 0) : this.realState
		return Math.max(0, Math.min(1, rawState))
	}

	/** Target intensity: base intensity × scale × resolved state. @see Light::UpdateAnimation in src/parts/light.cpp */
	private targetIntensity(): number {
		return this.fullScaleIntensity() * this.resolvedLightState()
	}

	private isBlinkOn(): boolean {
		return this.data.rgBlinkPattern.substr(this.iBlinkFrame, 1) === '1'
	}
}
