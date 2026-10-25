import { expect } from 'chai'
import { DataUtils } from 'three'
import {
	getTransmissionDebug,
	getTransmissionTexture,
	resetTransmissionBuffer,
	TRANSMISSION_HEIGHT,
	TRANSMISSION_INTENSITY_COEFFICIENT,
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

	it('scales bulb splats by the native 0.02 intensity coefficient', () => {
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
		// Native (light.cpp): bulb buffer = level * 0.02 * transmissionScale at the hub.
		expect(peak).to.be.greaterThan(0)
		expect(peak).to.be.lessThan(50 * TRANSMISSION_INTENSITY_COEFFICIENT * 1.5)
		expect(peak).to.be.greaterThan(50 * TRANSMISSION_INTENSITY_COEFFICIENT * 0.5)
	})

	it('tracks debug signatures and allows resetting the buffer state', () => {
		resetTransmissionBuffer()
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
	})
})
