// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Tungsten filament simulation for incandescent light fading (Fader.Incandescent).
// Faithful port of the #44 bulb model — the only bulb Light::UpdateAnimation uses,
// always with zero serial resistance — from upstream.
// @see https://github.com/vpinball/vpinball/blob/master/src/utils/bulb.cpp

/** Filament temperature of an unlit bulb. @see Light::RenderSetup in src/parts/light.cpp */
export const BULB_AMBIENT_TEMPERATURE = 293

/** Filament temperature of a fully lit bulb. @see Light::RenderSetup in src/parts/light.cpp */
export const BULB_LIT_TEMPERATURE = 2700

const MAX_TEMPERATURE = 3400
const EMISSION_BASE_TEMPERATURE = 1500
const EMISSION_LUT_SIZE = 512
const EMISSION_LUT_SCALE = 255
const EMISSION_LUT_REFERENCE_TEMPERATURE = 2700

// #44 ratings: 6.3V, 0.25A, 2710K stability temperature, fitted filament surface/mass.
const RATING_VOLTAGE = 6.3
const RATING_CURRENT = 0.25
const RATING_TEMPERATURE = 2710
const FILAMENT_SURFACE = 2.2191615654e-6
const FILAMENT_MASS = 0.3117866466e-6

const EMISSIVITY_COIL_FACTOR = 0.6865
const BASE_WIRE_LOSS = 0.07
const STEPHAN_BOLTZMAN = 5.670374419e-8

let initialized = false
let baseResistance = 1
const temperatureToPower: number[] = []
const emissionToTemperature: number[] = new Array(EMISSION_LUT_SIZE)
const coolFactors: number[] = new Array(MAX_TEMPERATURE + 1)
const heatFactors: number[] = new Array(MAX_TEMPERATURE + 1)

/** Filament resistance at a temperature in Kelvin: R0 * (1 + 0.0045 * (T - T0)). */
function resistanceAt(temperature: number): number {
	return baseResistance * (1 + 0.0045 * (temperature - BULB_AMBIENT_TEMPERATURE))
}

function ensureBulbInitialized(): void {
	if (initialized) {
		return
	}
	initialized = true

	baseResistance = 1
	baseResistance = RATING_VOLTAGE / RATING_CURRENT / resistanceAt(RATING_TEMPERATURE)

	for (let index = 0; index <= MAX_TEMPERATURE - EMISSION_BASE_TEMPERATURE; index++) {
		const temperature = EMISSION_BASE_TEMPERATURE + index
		temperatureToPower[index] =
			(1.247 / (1 + 129.05 / temperature) ** 204 +
				0.0678 / (1 + 78.85 / temperature) ** 404 +
				0.0489 / (1 + 23.52 / temperature) ** 1004 +
				0.0406 / (1 + 13.67 / temperature) ** 2004) *
			68493.150685
	}

	// Inverse LUT: emission power back to filament temperature, normalized so the
	// emission at 2700K maps to index 255. @see bulb_init in src/utils/bulb.cpp
	const powerAtReference = temperatureToPower[EMISSION_LUT_REFERENCE_TEMPERATURE - EMISSION_BASE_TEMPERATURE]
	let tempIndex = 0
	for (let index = 0; index < EMISSION_LUT_SIZE; index++) {
		const power = index * (powerAtReference / EMISSION_LUT_SCALE)
		while (temperatureToPower[tempIndex] < power) {
			tempIndex++
		}
		emissionToTemperature[index] = EMISSION_BASE_TEMPERATURE + tempIndex
	}

	for (let temperature = 0; temperature <= MAX_TEMPERATURE; temperature++) {
		const specificHeat =
			3 * 45.2268 * (1 - (310 * 310) / (20 * temperature * temperature)) +
			2 * 4.5549e-3 * temperature +
			4 * 5.77874e-10 * temperature ** 3
		const emissivity = EMISSIVITY_COIL_FACTOR * 0.0000689 * temperature ** 1.0748
		const radiated =
			-STEPHAN_BOLTZMAN * FILAMENT_SURFACE * emissivity * (temperature ** 4 - BULB_AMBIENT_TEMPERATURE ** 4)
		const convection =
			(-BASE_WIRE_LOSS * ((temperature - BULB_AMBIENT_TEMPERATURE) / RATING_TEMPERATURE)) /
			resistanceAt(temperature)
		coolFactors[temperature] = (radiated + convection) / (FILAMENT_MASS * specificHeat)
		heatFactors[temperature] = 1 / resistanceAt(temperature) / (FILAMENT_MASS * specificHeat)
	}
}

/** Relative visible emission (1.0 at the bulb's rated temperature) for a filament temperature in Kelvin. */
export function bulbFilamentTemperatureToEmission(temperature: number): number {
	ensureBulbInitialized()
	if (temperature < EMISSION_BASE_TEMPERATURE) {
		return 0
	}
	if (temperature >= MAX_TEMPERATURE) {
		return temperatureToPower[MAX_TEMPERATURE - EMISSION_BASE_TEMPERATURE]
	}
	return (
		temperatureToPower[Math.trunc(temperature) - EMISSION_BASE_TEMPERATURE] /
		temperatureToPower[RATING_TEMPERATURE - EMISSION_BASE_TEMPERATURE]
	)
}

/** Filament temperature in Kelvin for a relative emission (1.0 at 2700K). @see bulb_emission_to_filament_temperature in src/utils/bulb.cpp */
export function bulbEmissionToFilamentTemperature(emission: number): number {
	ensureBulbInitialized()
	const index = Math.max(0, Math.trunc(emission * EMISSION_LUT_SCALE))
	return index >= EMISSION_LUT_SIZE ? emissionToTemperature[EMISSION_LUT_SIZE - 1] : emissionToTemperature[index]
}

/** Filament temperature in Kelvin after cooling for `duration` seconds. */
export function bulbCoolDown(temperature: number, duration: number): number {
	ensureBulbInitialized()
	while (duration > 0) {
		const step = duration > 0.001 ? 0.001 : duration
		temperature += step * coolFactors[Math.trunc(temperature)]
		if (temperature <= 294) {
			return BULB_AMBIENT_TEMPERATURE
		}
		duration -= step
	}
	return temperature
}

/** Filament temperature in Kelvin after heating at `voltage` volts for `duration` seconds. */
export function bulbHeatUp(temperature: number, duration: number, voltage: number): number {
	ensureBulbInitialized()
	while (duration > 0) {
		temperature = Math.min(MAX_TEMPERATURE, Math.max(BULB_AMBIENT_TEMPERATURE, temperature))
		const energy = voltage * voltage * heatFactors[Math.trunc(temperature)] + coolFactors[Math.trunc(temperature)]
		if (energy > -10 && energy < 10) {
			return temperature
		}
		const step = energy > 1000e3 ? Math.min(duration, 0.0005) : Math.min(duration, 0.001)
		temperature += step * energy
		duration -= step
	}
	return temperature
}
