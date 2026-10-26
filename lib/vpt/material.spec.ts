import { describe, expect, it } from 'vitest'
import { Material, SaveMaterial, SavePhysicsMaterial } from './material.js'

function makeSavedBuffer(fields: { glossy: number; thick: number; edgeAlphaByte: number }): Uint8Array {
	const buffer = new Uint8Array(SaveMaterial.size)
	const view = new DataView(buffer.buffer)
	const name = 'TestMat'
	for (let index = 0; index < name.length; index++) buffer[index] = name.charCodeAt(index)
	view.setInt32(32, 0x0000ff, true)
	view.setFloat32(44, 0.5, true)
	view.setFloat32(52, 0.3, true)
	view.setUint8(56, fields.glossy)
	view.setFloat32(60, 0.9, true)
	view.setUint8(64, fields.thick)
	view.setFloat32(68, 0.8, true)
	view.setUint8(72, fields.edgeAlphaByte)
	return buffer
}

function loadMaterial(fields: { glossy: number; thick: number; edgeAlphaByte: number }): Material {
	return Material.fromSaved(new SaveMaterial(makeSavedBuffer(fields), 0))
}

describe('Material.fromSaved legacy dequantization', () => {
	it('uncomplements the 8-bit glossy lerp (stored 0 means full lerp)', () => {
		expect(loadMaterial({ glossy: 0, thick: 10, edgeAlphaByte: 3 }).glossyImageLerp).toBeCloseTo(1, 6)
		expect(loadMaterial({ glossy: 255, thick: 10, edgeAlphaByte: 3 }).glossyImageLerp).toBeCloseTo(0, 6)
		expect(loadMaterial({ glossy: 128, thick: 10, edgeAlphaByte: 3 }).glossyImageLerp).toBeCloseTo(1 - 128 / 255, 6)
	})

	it('maps a zero thickness byte to the legacy paper default instead of zero', () => {
		expect(loadMaterial({ glossy: 0, thick: 0, edgeAlphaByte: 3 }).thickness).toBeCloseTo(0.05, 6)
		expect(loadMaterial({ glossy: 0, thick: 255, edgeAlphaByte: 3 }).thickness).toBeCloseTo(1, 6)
		expect(loadMaterial({ glossy: 0, thick: 128, edgeAlphaByte: 3 }).thickness).toBeCloseTo(128 / 255, 6)
	})

	it('unpacks edge alpha from the upper 7 bits and the active flag from the low bit', () => {
		const active = loadMaterial({ glossy: 0, thick: 10, edgeAlphaByte: (100 << 1) | 1 })
		expect(active.edgeAlpha).toBeCloseTo(100 / 127, 6)
		expect(active.isOpacityActive).toBe(true)
		const inactive = loadMaterial({ glossy: 0, thick: 10, edgeAlphaByte: 64 << 1 })
		expect(inactive.edgeAlpha).toBeCloseTo(64 / 127, 6)
		expect(inactive.isOpacityActive).toBe(false)
	})

	it('keeps mapping the plain float fields', () => {
		const material = loadMaterial({ glossy: 0, thick: 0, edgeAlphaByte: 3 })
		expect(material.name).toBe('TestMat')
		expect(material.wrapLighting).toBeCloseTo(0.5, 6)
		expect(material.roughness).toBeCloseTo(0.3, 6)
		expect(material.edge).toBeCloseTo(0.9, 6)
		expect(material.opacity).toBeCloseTo(0.8, 6)
	})
})

function writeSavedRecord(
	buffer: Uint8Array,
	index: number,
	fields: {
		name: string
		baseColor: number
		glossiness: number
		clearCoat: number
		wrapLighting: number
		isMetal: number
		roughness: number
		edge: number
		opacity: number
	},
): void {
	const off = index * SaveMaterial.size
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
	for (let i = 0; i < fields.name.length; i++) buffer[off + i] = fields.name.charCodeAt(i)
	view.setInt32(off + 32, fields.baseColor, true)
	view.setInt32(off + 36, fields.glossiness, true)
	view.setInt32(off + 40, fields.clearCoat, true)
	view.setFloat32(off + 44, fields.wrapLighting, true)
	view.setInt8(off + 48, fields.isMetal)
	view.setFloat32(off + 52, fields.roughness, true)
	view.setFloat32(off + 60, fields.edge, true)
	view.setFloat32(off + 68, fields.opacity, true)
}

function writePhysicsRecord(
	buffer: Uint8Array,
	index: number,
	fields: { name: string; elasticity: number; elasticityFallOff: number; friction: number; scatterAngle: number },
): void {
	const off = index * SavePhysicsMaterial.size
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
	for (let i = 0; i < fields.name.length; i++) buffer[off + i] = fields.name.charCodeAt(i)
	view.setFloat32(off + 32, fields.elasticity, true)
	view.setFloat32(off + 36, fields.elasticityFallOff, true)
	view.setFloat32(off + 40, fields.friction, true)
	view.setFloat32(off + 44, fields.scatterAngle, true)
}

describe('SaveMaterial/SavePhysicsMaterial binary layout', () => {
	it('should use the upstream 76/48-byte record sizes', () => {
		expect(SaveMaterial.size).toBe(76)
		expect(SavePhysicsMaterial.size).toBe(48)
	})

	it('should read every field at its upstream offset', () => {
		const buffer = new Uint8Array(SaveMaterial.size * 2)
		writeSavedRecord(buffer, 0, {
			name: 'First',
			baseColor: 0x808080,
			glossiness: 0x404040,
			clearCoat: 0xc0c0c0,
			wrapLighting: 0.25,
			isMetal: 1,
			roughness: 0.75,
			edge: 0.5,
			opacity: 0.9,
		})
		writeSavedRecord(buffer, 1, {
			name: 'Second',
			baseColor: 0x101010,
			glossiness: 0x202020,
			clearCoat: 0x303030,
			wrapLighting: 0.5,
			isMetal: 0,
			roughness: 0.125,
			edge: 0.875,
			opacity: 0.1,
		})
		// Gray colors are channel-swap invariant, so these pin the offsets, not the BGR mapping.
		const first = Material.fromSaved(new SaveMaterial(buffer, 0))
		expect(first.name).toBe('First')
		expect(first.baseColor).toBe(0x808080)
		expect(first.glossiness).toBe(0x404040)
		expect(first.clearCoat).toBe(0xc0c0c0)
		expect(first.wrapLighting).toBeCloseTo(0.25, 6)
		expect(first.isMetal).toBe(true)
		expect(first.roughness).toBeCloseTo(0.75, 6)
		expect(first.edge).toBeCloseTo(0.5, 6)
		expect(first.opacity).toBeCloseTo(0.9, 6)
		const second = Material.fromSaved(new SaveMaterial(buffer, 1))
		expect(second.name).toBe('Second')
		expect(second.baseColor).toBe(0x101010)
		expect(second.glossiness).toBe(0x202020)
		expect(second.clearCoat).toBe(0x303030)
		expect(second.wrapLighting).toBeCloseTo(0.5, 6)
		expect(second.isMetal).toBe(false)
		expect(second.roughness).toBeCloseTo(0.125, 6)
		expect(second.edge).toBeCloseTo(0.875, 6)
		expect(second.opacity).toBeCloseTo(0.1, 6)
	})

	it('should read physics fields at their upstream offsets', () => {
		const buffer = new Uint8Array(SavePhysicsMaterial.size * 2)
		writePhysicsRecord(buffer, 0, {
			name: 'Steel',
			elasticity: 0.42,
			elasticityFallOff: 0.5,
			friction: 0.3,
			scatterAngle: 1.5,
		})
		writePhysicsRecord(buffer, 1, {
			name: 'Rubber',
			elasticity: 0.9,
			elasticityFallOff: 0.1,
			friction: 0.8,
			scatterAngle: 0,
		})
		const first = new SavePhysicsMaterial(buffer, 0)
		expect(first.name).toBe('Steel')
		expect(first.elasticity).toBeCloseTo(0.42, 6)
		expect(first.elasticityFallOff).toBeCloseTo(0.5, 6)
		expect(first.friction).toBeCloseTo(0.3, 6)
		expect(first.scatterAngle).toBeCloseTo(1.5, 6)
		const second = new SavePhysicsMaterial(buffer, 1)
		expect(second.name).toBe('Rubber')
		expect(second.elasticity).toBeCloseTo(0.9, 6)
		expect(second.elasticityFallOff).toBeCloseTo(0.1, 6)
		expect(second.friction).toBeCloseTo(0.8, 6)
		expect(second.scatterAngle).toBeCloseTo(0, 6)
	})
})
