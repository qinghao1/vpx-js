// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { DataTexture, Group } from 'three'
import { describe, expect, it } from 'vitest'
import type { Table } from '../../vpt/table/table.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

describe('ThreeRenderApi scene transformation', () => {
	it('transformScene rotates X 90 degrees, centers, and scales to VPX units', () => {
		const api = new ThreeRenderApi()
		const group = new Group()
		const table = {
			getDimensions: () => ({ width: 1000, height: 2000 }),
		} as unknown as Table

		api.transformScene(group, table)

		expect(group.rotation.x).toBeCloseTo(Math.PI / 2, 5)
		expect(group.scale.x).toBeCloseTo(ThreeRenderApi.SCALE, 5)
		expect(group.scale.y).toBeCloseTo(ThreeRenderApi.SCALE, 5)
		expect(group.scale.z).toBeCloseTo(ThreeRenderApi.SCALE, 5)
		expect(group.position.x).toBeCloseTo((-1000 * ThreeRenderApi.SCALE) / 2, 5)
		expect(group.position.z).toBeCloseTo((-2000 * ThreeRenderApi.SCALE) / 2, 5)
	})
})

describe('ThreeRenderApi hierarchy helpers', () => {
	const api = new ThreeRenderApi()

	it('creates parent nodes and manages children', () => {
		const parent = api.createParentNode('playfield')
		expect(parent.name).toBe('playfield')

		const child = new Group()
		child.name = 'flipper'
		api.addChildToParent(parent, child)
		expect(api.findInGroup(parent, 'flipper')).toBe(child)

		api.removeFromParent(parent, child)
		expect(api.findInGroup(parent, 'flipper')).toBeUndefined()

		api.addChildToParent(parent, child)
		api.removeChildren(parent)
		expect(parent.children.length).toBe(0)
	})
})

describe('ThreeRenderApi null-node no-ops', () => {
	const api = new ThreeRenderApi()

	it('ignores null/undefined nodes on every optional-node method', () => {
		for (const node of [undefined, null] as const) {
			const missing = node as any
			expect(() => api.removeFromParent({} as any, missing), `removeFromParent ${String(node)}`).not.toThrow()
			expect(() => api.removeChildren(missing), `removeChildren ${String(node)}`).not.toThrow()
			expect(() => api.applyMaterial(missing, {} as any, 'map'), `applyMaterial ${String(node)}`).not.toThrow()
		}
	})

	it('skips material-less groups such as meshless flasher nodes', () => {
		const tex = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		tex.name = 'd_5'
		;(api as any).nodeMaterialGenerator = new ThreeNodeMaterialGenerator({
			hasTexture: (name: string) => name === 'd_5',
			getTexture: () => tex,
		} as any)
		const group = new Group()
		group.name = 'flasher-ghost'
		expect(() => api.applyMaterial(group, undefined, 'd_5')).not.toThrow()
	})
})
