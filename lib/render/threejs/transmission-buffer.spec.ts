import { expect } from 'chai'
import { DataUtils } from 'three'
import * as transmissionBufferModule from './transmission-buffer.js'
import {
	getTransmissionDebug,
	getTransmissionTexture,
	resetTransmissionBuffer,
	TRANSMISSION_HEIGHT,
	TRANSMISSION_OPAQUE_CUTOFF,
	TRANSMISSION_WIDTH,
	updateTransmissionBuffer,
} from './transmission-buffer.js'

describe('transmission light buffer', () => {
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
		expect(updateTransmissionBuffer(plain)).to.equal(true)
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
		// Native (light.cpp:698-700): halo buffer = level * transmissionScale at
		// the hub. The peak never exceeds the hub amount (attenuation <= 1, hub
		// and rim share the amount), and the hub texel center lands within ~22
		// units of the lamp, so attenuation there stays above (1-22/200)^2.
		expect(peak).to.be.lessThan(51)
		expect(peak).to.be.greaterThan(30)
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
})
