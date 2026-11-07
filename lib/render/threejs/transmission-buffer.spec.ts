// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { DataUtils } from 'three'
import * as transmissionBufferModule from './transmission-buffer.js'
import {
	getTransmissionDebug,
	getTransmissionTexture,
	resetTransmissionBuffer,
	setTransmissionRebuildThrottle,
	TRANSMISSION_HEIGHT,
	TRANSMISSION_OPAQUE_CUTOFF,
	TRANSMISSION_WIDTH,
	updateTransmissionBuffer,
} from './transmission-buffer.js'

describe('transmission light buffer', () => {
	beforeEach(() => {
		setTransmissionRebuildThrottle(0)
	})

	it('gates the bulb lift to non-opaque pixels just below native strict 1.0', () => {
		expect(TRANSMISSION_OPAQUE_CUTOFF).to.be.lessThan(1)
		expect(TRANSMISSION_OPAQUE_CUTOFF).to.be.greaterThan(0.99)
	})

	it('starts empty and splats lamp states in playfield-UV space', () => {
		resetTransmissionBuffer()
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				a: { data: { center: { x: 500, y: 1000 }, intensity: 0 }, getState: () => ({ intensity: 0 }) },
			},
		} as never
		expect(updateTransmissionBuffer(table)).to.equal(true)
		const tex = getTransmissionTexture()
		expect(tex.image.width).to.equal(TRANSMISSION_WIDTH)
		expect(tex.image.height).to.equal(TRANSMISSION_HEIGHT)
		const data = tex.image.data as Uint16Array
		expect(data[0]).to.equal(0)

		// Native (Light::Render LIGHT_BUFFER): only bulb lights with a nonzero
		// transmission scale join the bulb buffer; plain lamps never do.
		// Upstream keeps exactly one such buffer (the bloom target reused by
		// DrawBulbLightBuffer): the baked/BDL lifts model its single use, the
		// fs_basic.sc additive sqrt(diffuse) tail, from the gated buffer, so
		// no second full-field buffer exists here.
		expect('getLightBufferTexture' in transmissionBufferModule, 'dead second buffer removed').to.equal(false)
		const plain = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				a: {
					data: {
						center: { x: 500, y: 1000 },
						intensity: 100,
						color: 0xff0000,
						bulbLight: true,
						transmissionScale: 0,
					},
					getState: () => ({ intensity: 200, color: 0xff0000 }),
				},
			},
		} as never
		// A zero-scale lamp stays out of the signature entirely, so with
		// nothing else changed there is nothing to rebuild or present.
		expect(updateTransmissionBuffer(plain)).to.equal(false)
		let peak = 0
		for (let index = 0; index < data.length; index += 4) peak = Math.max(peak, data[index] ?? 0)
		expect(peak, 'zero transmission scale contributes nothing').to.equal(0)

		const lit = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				a: {
					data: {
						center: { x: 500, y: 1000 },
						intensity: 100,
						color: 0xff0000,
						bulbLight: true,
						transmissionScale: 1,
						falloff: 200,
						falloffPower: 2,
					},
					getState: () => ({ intensity: 8, color: 0xff0000 }),
				},
			},
		} as never
		expect(updateTransmissionBuffer(lit)).to.equal(true)
		expect(updateTransmissionBuffer(lit)).to.equal(false)
		let litPeak = 0
		for (let index = 0; index < data.length; index += 4) litPeak = Math.max(litPeak, data[index] ?? 0)
		expect(litPeak, 'bulb splat registers above zero').to.be.greaterThan(0)
		// Finite native support: the corner stays black (no infinite Gaussian tail).
		expect(data[0], 'outside the falloff radius the buffer stays black').to.equal(0)
	})

	it('leaves backglass lamps out of the playfield buffer', () => {
		const tableWith = (isBackglass: boolean) =>
			({
				data: { right: 1000, bottom: 2000 },
				lights: {
					a: {
						data: {
							center: { x: 500, y: 1000 },
							intensity: 100,
							color: 0xff0000,
							bulbLight: true,
							isBackglass,
							transmissionScale: 1,
							falloff: 200,
							falloffPower: 2,
						},
						getState: () => ({ intensity: 8, color: 0xff0000 }),
					},
				},
			}) as never
		resetTransmissionBuffer()
		updateTransmissionBuffer(tableWith(true))
		const data = getTransmissionTexture().image.data as Uint16Array
		expect(Math.max(...data), 'backglass lamp contributes nothing').to.equal(0)
		resetTransmissionBuffer()
		updateTransmissionBuffer(tableWith(false))
		expect(
			Math.max(...(getTransmissionTexture().image.data as Uint16Array)),
			'playfield twin does',
		).to.be.greaterThan(0)
	})

	it('splats bulb halos at full native intensity (no 0.02 hull coefficient)', () => {
		resetTransmissionBuffer()
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				a: {
					data: {
						center: { x: 500, y: 1000 },
						intensity: 100,
						color: 0xffffff,
						bulbLight: true,
						transmissionScale: 1,
						falloff: 200,
						falloffPower: 2,
					},
					getState: () => ({ intensity: 50, color: 0xffffff }),
				},
			},
		} as never
		expect(updateTransmissionBuffer(table)).to.equal(true)
		const data = (getTransmissionTexture().image.data as Uint16Array) ?? new Uint16Array(0)
		let peak = 0
		for (let index = 0; index < data.length; index += 4) {
			peak = Math.max(peak, DataUtils.fromHalfFloat(data[index] ?? 0))
		}
		// Native (Light::Render LIGHT_BUFFER halo block): halo buffer = level *
		// transmissionScale at the hub. The peak never exceeds the hub amount
		// (attenuation <= 1, hub and rim share the amount), and the hub texel
		// center lands within ~22 units of the lamp, so attenuation there
		// stays above (1-22/200)^2.
		expect(peak).to.be.lessThan(51)
		expect(peak).to.be.greaterThan(30)
	})

	it('skips sub-quantum lamps entirely', () => {
		resetTransmissionBuffer()
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				a: {
					data: {
						center: { x: 500, y: 1000 },
						intensity: 100,
						color: 0xffffff,
						bulbLight: true,
						transmissionScale: 1,
						falloff: 200,
						falloffPower: 2,
					},
					getState: () => ({ intensity: 0.04, color: 0xffffff }),
				},
			},
		} as never
		expect(updateTransmissionBuffer(table)).to.equal(true)
		expect(getTransmissionDebug().splats, 'invisible lamp splats nothing').to.equal(0)
		// Stable across frames: no rebuild churn from invisible flicker.
		expect(updateTransmissionBuffer(table)).to.equal(false)
	})

	it('rebuilds when falloff, falloff power, or rim color change', () => {
		resetTransmissionBuffer()
		const lampData = {
			center: { x: 500, y: 1000 },
			intensity: 100,
			color: 0xff0000,
			color2: 0x0000ff,
			bulbLight: true,
			transmissionScale: 1,
			falloff: 200,
			falloffPower: 2,
		}
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: { a: { data: lampData, getState: () => ({ intensity: 8, color: 0xff0000 }) } },
		} as never
		expect(updateTransmissionBuffer(table)).to.equal(true)
		expect(updateTransmissionBuffer(table)).to.equal(false)
		lampData.falloff = 400
		expect(updateTransmissionBuffer(table), 'falloff change rebuilds').to.equal(true)
		expect(updateTransmissionBuffer(table)).to.equal(false)
		lampData.falloffPower = 5
		expect(updateTransmissionBuffer(table), 'falloffPower change rebuilds').to.equal(true)
		lampData.color2 = 0x00ff00
		expect(updateTransmissionBuffer(table), 'color2 change rebuilds').to.equal(true)
	})

	it('maps table-top lamps to high buffer rows and table-bottom lamps to low rows (no vertical mirror)', () => {
		const lampAt = (x: number, y: number) =>
			({
				data: { right: 1000, bottom: 2000 },
				lights: {
					a: {
						data: {
							center: { x, y },
							intensity: 100,
							color: 0xffffff,
							color2: 0xffffff,
							bulbLight: true,
							transmissionScale: 1,
							falloff: 200,
							falloffPower: 2,
						},
						getState: () => ({ intensity: 8, color: 0xffffff }),
					},
				},
			}) as never
		const peakCell = (): { px: number; py: number } => {
			const data = getTransmissionTexture().image.data as Uint16Array
			let best = -1
			let bestPx = 0
			let bestPy = 0
			for (let py = 0; py < TRANSMISSION_HEIGHT; py++) {
				for (let px = 0; px < TRANSMISSION_WIDTH; px++) {
					const v = DataUtils.fromHalfFloat(data[(py * TRANSMISSION_WIDTH + px) * 4] ?? 0)
					if (v > best) {
						best = v
						bestPx = px
						bestPy = py
					}
				}
			}
			return { px: bestPx, py: bestPy }
		}
		// Buffer rows run top-down (row 0 is table y=bottom), matching the shader
		// v = 0.5 - z/(h*s) sampling; a flipped mapping would mirror these peaks.
		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(500, 100))).to.equal(true)
		const topPeak = peakCell()
		expect(topPeak.py, 'table-top lamp peaks in upper rows').to.be.greaterThan((TRANSMISSION_HEIGHT * 3) / 4)
		expect(topPeak.px, 'centered lamp peaks mid-buffer').to.be.greaterThan(TRANSMISSION_WIDTH / 4)
		expect(topPeak.px, 'centered lamp peaks mid-buffer').to.be.lessThan((TRANSMISSION_WIDTH * 3) / 4)

		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(500, 1900))).to.equal(true)
		const bottomPeak = peakCell()
		expect(bottomPeak.py, 'table-bottom lamp peaks in low rows').to.be.lessThan(TRANSMISSION_HEIGHT / 4)

		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(100, 1000))).to.equal(true)
		const leftPeak = peakCell()
		expect(leftPeak.px, 'table-left lamp peaks in left columns').to.be.lessThan(TRANSMISSION_WIDTH / 4)
	})

	it('tracks debug signatures and allows resetting the buffer state', () => {
		resetTransmissionBuffer()
		expect(getTransmissionDebug().splats, 'fresh state reports no splats').to.equal(0)
		const table = {
			data: { right: 1000, bottom: 2000 },
			lights: {
				testBulb: {
					data: {
						center: { x: 400, y: 800 },
						bulbLight: true,
						transmissionScale: 1.5,
						falloff: 150,
						falloffPower: 2,
					},
					getState: () => ({ intensity: 10, color: 0x00ff00 }),
				},
			},
		} as never
		expect(updateTransmissionBuffer(table)).to.equal(true)
		const debug = getTransmissionDebug()
		expect(debug.splats).to.equal(1)
		expect(debug.peak).to.be.greaterThan(0)
		expect(debug.signature).to.include('400,800')

		// Calling again without changes returns false
		expect(updateTransmissionBuffer(table)).to.equal(false)

		// Resetting permits re-processing identical frame
		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(table)).to.equal(true)

		// An empty signature reports zero splats, never one from ''.split(';')
		resetTransmissionBuffer()
		const empty = { data: { right: 1000, bottom: 2000 }, lights: {} } as never
		expect(updateTransmissionBuffer(empty)).to.equal(true)
		expect(getTransmissionDebug().splats, 'empty signature reports no splats').to.equal(0)
	})

	it('coalesces rapid rebuilds under throttle and converges once lamps settle', () => {
		const lampAt = (intensity: number) =>
			({
				data: { right: 1000, bottom: 2000 },
				lights: {
					a: {
						data: {
							center: { x: 500, y: 1000 },
							color: 0xffffff,
							bulbLight: true,
							transmissionScale: 1,
							falloff: 200,
							falloffPower: 2,
						},
						getState: () => ({ intensity, color: 0xffffff }),
					},
				},
			}) as never
		const snapshot = (): number[] => Array.from(getTransmissionTexture().image.data as Uint16Array)
		setTransmissionRebuildThrottle(50)
		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(8))).to.equal(true)
		// Same-tick change is pending, not rebuilt: the stale signature retries.
		expect(updateTransmissionBuffer(lampAt(4))).to.equal(false)
		// Once the lamps settle, the very next pass rebuilds to the exact
		// unthrottled buffer.
		setTransmissionRebuildThrottle(0)
		expect(updateTransmissionBuffer(lampAt(4))).to.equal(true)
		const throttled = snapshot()

		setTransmissionRebuildThrottle(0)
		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(8))).to.equal(true)
		expect(updateTransmissionBuffer(lampAt(4))).to.equal(true)
		expect(snapshot(), 'throttled buffer converges bit-exact').to.deep.equal(throttled)

		// Disabling the throttle restores back-to-back rebuilds.
		resetTransmissionBuffer()
		expect(updateTransmissionBuffer(lampAt(8))).to.equal(true)
		expect(updateTransmissionBuffer(lampAt(4))).to.equal(true)
	})

	it('matches the analytic radial profile away from the hub', () => {
		// The hub texel (attenuation 1) cannot catch a domain error in the
		// falloff lookup: every wrong-domain table agrees there. Sample the
		// mid-slope, where indexing by squared radius inflates the glow ~2x.
		for (const power of [1, 2, 3]) {
			resetTransmissionBuffer()
			const table = {
				data: { right: 1000, bottom: 2000 },
				lights: {
					a: {
						data: {
							center: { x: 500, y: 1000 },
							intensity: 100,
							color: 0xffffff,
							color2: 0xffffff,
							bulbLight: true,
							transmissionScale: 1,
							falloff: 200,
							falloffPower: power,
						},
						getState: () => ({ intensity: 50, color: 0xffffff, colorFull: 0xffffff }),
					},
				},
			} as never
			expect(updateTransmissionBuffer(table)).to.equal(true)
			const data = getTransmissionTexture().image.data as Uint16Array
			// Texel (57, 23); white/white kills the hub color morph, isolating
			// attenuation. Analytic oracle from the documented profile —
			// finite disc with (1-r/falloff)^power — independent of the LUT.
			const px = 57
			const py = 23
			const tx = ((px + 0.5) / TRANSMISSION_WIDTH) * 1000
			const ty = (1 - (py + 0.5) / TRANSMISSION_HEIGHT) * 2000
			const dist = Math.sqrt((tx - 500) ** 2 + (ty - 1000) ** 2)
			const normDist = dist / 200
			expect(normDist, 'probe texel must sit mid-slope').to.be.greaterThan(0.3)
			expect(normDist, 'probe texel must sit mid-slope').to.be.lessThan(0.7)
			const expected = 50 * (1 - normDist) ** power
			// Tolerance ±1 covers LUT quantization plus half-float rounding:
			// worst case ≈ (power/255)*level + half-ulp ≈ 0.6+0.03 < 1
			// at level 50/power 3.
			const actual = DataUtils.fromHalfFloat(data[(py * TRANSMISSION_WIDTH + px) * 4] ?? 0)
			expect(actual, `power ${power} mid-slope glow matches the analytic profile`).to.be.closeTo(expected, 1)
		}
	})
})
