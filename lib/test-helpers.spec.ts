// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
// Lives under lib/ because vitest only includes lib/**/*.spec.ts.

import { describe, expect, it } from 'vitest'
import { TestRenderApi } from '../test/test-render-api.js'
import { ThreeHelper } from '../test/three.helper.js'
import { Matrix3D } from './math/matrix.js'

describe('TestRenderApi conformance', () => {
	const api = new TestRenderApi()

	it('creates placeholder nodes for every creator', () => {
		expect(api.createMesh({} as any)).toEqual({})
		expect(api.createObjectFromRenderable({} as any, {} as any, {} as any)).toEqual({})
		expect(api.createParentNode('group')).toEqual({})
		expect(api.createPlayfieldGeometry({} as any, {} as any)).toEqual({})
		expect(api.createLightGeometry({} as any, {} as any)).toEqual({})
		expect(api.findInGroup({} as any, 'child')).toEqual({})
	})

	it('creates no point light (headless has no dynamic lights)', () => {
		expect(api.createPointLight({} as any)).toBeUndefined()
	})

	it('never rejects texture preloads', async () => {
		await expect(api.preloadTextures([], {} as any)).resolves.toBeUndefined()
	})

	it('accepts every apply/remove/transform call without throwing', () => {
		const node = {}
		const matrix = new Matrix3D().setTranslation(1, 2, 3)
		expect(() => api.addChildToParent(node, node)).not.toThrow()
		expect(() => api.removeFromParent(node, node)).not.toThrow()
		expect(() => api.removeFromParent(node, undefined)).not.toThrow()
		expect(() => api.removeChildren(node)).not.toThrow()
		expect(() => api.removeChildren(undefined)).not.toThrow()
		expect(() => api.applyMatrixToNode(matrix, node)).not.toThrow()
		expect(() => api.applyMatrixToNode(matrix, undefined)).not.toThrow()
		expect(() => api.applyMeshToNode({} as any, node)).not.toThrow()
		expect(() => api.applyMeshToNode({} as any, undefined)).not.toThrow()
		expect(() => api.applyLighting({} as any, 100, node)).not.toThrow()
		expect(() => api.applyLighting({} as any, 100, undefined)).not.toThrow()
		expect(() => api.applyVisibility(true, node)).not.toThrow()
		expect(() => api.applyVisibility(false, undefined)).not.toThrow()
		expect(() => api.applyMaterial(node, {} as any, 'map')).not.toThrow()
		expect(() => api.applyMaterial(undefined, {} as any, 'map')).not.toThrow()
		expect(() => api.transformScene(node, {} as any)).not.toThrow()
	})
})

describe('ThreeHelper.expectNoObject', () => {
	const three = new ThreeHelper()

	function gltfWith(groupName: string, items: Array<{ name: string; children?: Array<{ name: string }> }>): any {
		return {
			scene: {
				children: [
					{
						name: 'playfield',
						children: [
							{
								name: groupName,
								children: items.map(item => ({
									name: item.name,
									children: (item.children ?? []).map(child => ({ name: child.name, children: [] })),
								})),
							},
						],
					},
				],
			},
		}
	}

	it('passes when the item is absent from its group', () => {
		const gltf = gltfWith('spinners', [{ name: 'Visible' }])
		expect(() => three.expectNoObject(gltf, 'spinners', 'Invisible')).not.toThrow()
	})

	it('throws when the item is present', () => {
		const gltf = gltfWith('spinners', [{ name: 'Visible' }])
		expect(() => three.expectNoObject(gltf, 'spinners', 'Visible')).toThrow(/none was expected/)
	})

	it('passes when the named child object is absent from a present item', () => {
		const gltf = gltfWith('spinners', [{ name: 'Visible', children: [{ name: 'other' }] }])
		expect(() => three.expectNoObject(gltf, 'spinners', 'Visible', 'glow')).not.toThrow()
	})

	it('throws when the named child object is present', () => {
		const gltf = gltfWith('spinners', [{ name: 'Visible', children: [{ name: 'glow' }] }])
		expect(() => three.expectNoObject(gltf, 'spinners', 'Visible', 'glow')).toThrow(/none was expected/)
	})
})
