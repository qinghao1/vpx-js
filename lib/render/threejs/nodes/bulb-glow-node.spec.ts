import { describe, expect, it } from 'vitest'
import { createBulbGlowNodeMaterial, isBulbGlowMaterial, setBulbGlowState } from './bulb-glow-node.js'

describe('bulb glow node material', () => {
	it('should create a flagged additive material', () => {
		const mat = createBulbGlowNodeMaterial({
			color: 0xff6020,
			color2: 0xffffff,
			centerX: 500,
			centerY: 1000,
			falloff: 300,
			falloffPower: 2,
			intensity: 10,
		})
		expect(isBulbGlowMaterial(mat)).toBe(true)
		expect(mat.transparent).toBe(true)
		expect(mat.depthWrite).toBe(false)
		expect(mat.colorNode).toBeDefined()
	})

	it('should scale output by (1 - modulateVsAdd)', () => {
		const additive = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
			modulateVsAdd: 0,
		})
		const modulated = createBulbGlowNodeMaterial({
			color: 0xffffff,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 10,
			modulateVsAdd: 0.9,
		})
		const scaleOf = (mat: unknown): number => (mat as any).userData.__uAddScale.value as number
		expect(scaleOf(additive)).toBeCloseTo(0.9999, 4)
		expect(scaleOf(modulated)).toBeCloseTo(0.1, 4)
		expect(isBulbGlowMaterial(modulated)).toBe(true)
	})

	it('should update live lamp state', () => {
		const mat = createBulbGlowNodeMaterial({
			color: 0xff0000,
			color2: 0xffffff,
			centerX: 0,
			centerY: 0,
			falloff: 100,
			falloffPower: 2,
			intensity: 0,
		})
		setBulbGlowState(mat, { intensity: 12, color: 0x00ff00 })
		expect(isBulbGlowMaterial(mat)).toBe(true)
		setBulbGlowState({}, { intensity: 5 })
	})
})
