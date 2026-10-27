// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { BoxGeometry, Group, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex3D } from '../../math/vector.js'
import type { Table } from '../../vpt/table/table.js'
import { batchStaticOpaques } from './three-batched-builder.js'
import { ThreeRenderApi } from './three-render-api.js'

describe('ThreeRenderApi matrix application', () => {
	it('applyMatrixToNode transposes row to col correctly', () => {
		const api = new ThreeRenderApi()
		const row = new Matrix3D()
			.setTranslation(10, 20, 30)
			.multiply(new Matrix3D().rotateZMatrix(MathUtils.degToRad(90)))
		const obj = new Group()
		obj.matrixAutoUpdate = false
		api.applyMatrixToNode(row, obj)
		const v = new Vector3(1, 0, 0)
		v.applyMatrix4(obj.matrix)
		const expected = new Vertex3D(1, 0, 0).multiplyMatrix(row)
		expect(v.x).toBeCloseTo(expected.x, 4)
		expect(v.y).toBeCloseTo(expected.y, 4)
		expect(v.z).toBeCloseTo(expected.z, 4)
		const col = new Matrix4().set(
			row._11,
			row._21,
			row._31,
			row._41,
			row._12,
			row._22,
			row._32,
			row._42,
			row._13,
			row._23,
			row._33,
			row._43,
			row._14,
			row._24,
			row._34,
			row._44,
		)
		obj.matrix.elements.forEach((actual, i) => expect(actual).toBeCloseTo(col.elements[i] ?? Number.NaN, 5))
	})
})

describe('ThreeRenderApi null-node no-ops', () => {
	const api = new ThreeRenderApi()
	const matrix = new Matrix3D().setTranslation(1, 2, 3)

	for (const missing of [undefined, null]) {
		const label = missing === undefined ? 'undefined' : 'null'
		it(`ignores ${label} nodes on every optional-node method`, () => {
			const node = missing as any
			expect(() => api.removeFromParent({} as any, node)).not.toThrow()
			expect(() => api.removeChildren(node)).not.toThrow()
			expect(() => api.applyMatrixToNode(matrix, node)).not.toThrow()
			expect(() => api.applyMeshToNode({} as any, node)).not.toThrow()
			expect(() => api.applyLighting({} as any, node)).not.toThrow()
			expect(() => api.applyVisibility(true, node)).not.toThrow()
			expect(() => api.applyMaterial(node, {} as any, 'map')).not.toThrow()
		})
	}
})

describe('ThreeRenderApi batched visibility', () => {
	const stubApi = {
		getMapGenerator: () => ({ getCache: () => new Map() }),
		getMaterialGenerator: () => ({}),
	} as unknown as ThreeRenderApi
	const mockTable = {
		getMovables: () => [],
		getAnimatables: () => [],
		getSurfaceHeight: () => 0,
		getScaleZ: () => 1,
		primitives: {},
		rubbers: {},
		lights: {},
		flashers: {},
		textboxes: {},
		getDimensions: () => ({ width: 100, height: 100 }),
	} as unknown as Table

	function batchPair(): { root: Group; groupB: Group; meshB: Mesh; batched: any } {
		const root = new Group()
		root.name = 'table'
		const base = new MeshStandardMaterial({ color: 0x112233 })
		base.name = 'material:shared'
		const groups: Group[] = []
		for (let i = 0; i < 2; i++) {
			const mat = base.clone()
			mat.name = 'material:shared'
			const mesh = new Mesh(new BoxGeometry(10, 10, 1, 4, 4, 4), mat)
			mesh.name = `kicker-k${i}`
			const group = new Group()
			group.name = `kick${i}`
			group.add(mesh)
			root.add(group)
			groups.push(group)
		}
		root.updateMatrixWorld(true)
		expect(batchStaticOpaques(root, mockTable, stubApi)).toBe(1)
		const groupB = groups[1]!
		const meshB = groupB.children[0] as Mesh
		expect(meshB.visible).toBe(false)
		let batched: any
		root.traverse(o => {
			if ((o as any).isBatchedMesh) batched = o
		})
		expect(batched).not.toBe(undefined)
		return { root, groupB, meshB, batched }
	}

	function batchInstancedTriple(): { groups: Group[]; instanced: any } {
		const root = new Group()
		root.name = 'table'
		const shared = new BoxGeometry(10, 10, 1, 4, 4, 4)
		const groups: Group[] = []
		for (let i = 0; i < 3; i++) {
			const mat = new MeshStandardMaterial({ color: 0x112233 })
			mat.name = 'material:shared'
			const mesh = new Mesh(shared, mat)
			mesh.name = `kicker-k${i}`
			mesh.position.set(i * 50, 0, 0)
			const group = new Group()
			group.name = `kick${i}`
			group.add(mesh)
			root.add(group)
			groups.push(group)
		}
		root.updateMatrixWorld(true)
		expect(batchStaticOpaques(root, mockTable, stubApi)).toBe(1)
		let instanced: any
		root.traverse(o => {
			if ((o as any).isInstancedMesh) instanced = o
		})
		expect(instanced).not.toBe(undefined)
		return { groups, instanced }
	}

	it('round-trips a BatchedMesh slot without double-rendering the original', () => {
		const { groupB, meshB, batched } = batchPair()
		const slot = (meshB.userData as any).__batched.instanceId as number
		const api = new ThreeRenderApi()
		api.applyVisibility(false, groupB)
		expect(groupB.visible).toBe(false)
		expect(meshB.visible).toBe(false)
		expect(batched.getVisibleAt(slot)).toBe(false)
		api.applyVisibility(true, groupB)
		expect(groupB.visible).toBe(true)
		expect(batched.getVisibleAt(slot)).toBe(true)
		expect(meshB.visible, 'batched original must stay hidden or it double-renders').toBe(false)
	})

	it('restores an InstancedMesh slot after a zero-scale hide', () => {
		const { groups, instanced } = batchInstancedTriple()
		const group = groups[1]!
		const mesh = group.children[0] as Mesh
		const slot = (mesh.userData as any).__batched.instanceId as number
		const before = new Matrix4()
		instanced.getMatrixAt(slot, before)
		const api = new ThreeRenderApi()
		api.applyVisibility(false, group)
		const hidden = new Matrix4()
		instanced.getMatrixAt(slot, hidden)
		expect(new Vector3().setFromMatrixScale(hidden).length()).toBe(0)
		api.applyVisibility(true, group)
		const restored = new Matrix4()
		instanced.getMatrixAt(slot, restored)
		expect(restored.elements[12]).toBeCloseTo(before.elements[12] ?? 0, 5)
		expect(group.visible).toBe(true)
		expect(mesh.visible, 'batched original must stay hidden or it double-renders').toBe(false)
	})

	it('unbatches the mesh when the saved instance matrix is missing', () => {
		const { groups, instanced } = batchInstancedTriple()
		const group = groups[1]!
		const mesh = group.children[0] as Mesh
		const slot = (mesh.userData as any).__batched.instanceId as number
		delete (mesh.userData as any).__batched.matrix
		const api = new ThreeRenderApi()
		api.applyVisibility(false, group)
		api.applyVisibility(true, group)
		// The mesh must never disappear: without a matrix to restore, the
		// original renders and the stale instance stays hidden.
		expect(mesh.visible).toBe(true)
		expect((mesh.userData as any).__batched).toBe(undefined)
		const m4 = new Matrix4()
		instanced.getMatrixAt(slot, m4)
		expect(new Vector3().setFromMatrixScale(m4).length()).toBe(0)
	})

	it('keeps authored-invisible children hidden on the show path', () => {
		const api = new ThreeRenderApi()
		const group = new Group()
		const authoredHidden = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
		authoredHidden.name = 'bulb.glow'
		authoredHidden.userData.__authoredVisible = false
		const normal = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
		group.add(authoredHidden, normal)
		api.applyVisibility(false, group)
		expect(group.visible).toBe(false)
		expect(authoredHidden.visible).toBe(false)
		expect(normal.visible).toBe(false)
		api.applyVisibility(true, group)
		expect(group.visible).toBe(true)
		expect(normal.visible).toBe(true)
		expect(authoredHidden.visible, 'authored-invisible child must survive the show path').toBe(false)
	})

	it('still toggles non-batched children normally', () => {
		const { groupB, meshB, batched } = batchPair()
		const glassMat = new MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 })
		glassMat.name = 'glass'
		const glass = new Mesh(new BoxGeometry(1, 1, 1), glassMat)
		glass.name = 'kicker-glass'
		groupB.add(glass)
		const slot = (meshB.userData as any).__batched.instanceId as number
		const api = new ThreeRenderApi()
		api.applyVisibility(false, groupB)
		expect(glass.visible).toBe(false)
		expect(batched.getVisibleAt(slot)).toBe(false)
		api.applyVisibility(true, groupB)
		expect(glass.visible).toBe(true)
		expect(batched.getVisibleAt(slot)).toBe(true)
		expect(meshB.visible).toBe(false)
	})

	it('counts failed batched-visibility writes into a debug stat instead of warning', () => {
		const api = new ThreeRenderApi()
		const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
		const userData = mesh.userData as any
		userData.__batched = {
			batched: {
				setMatrixAt: () => {
					throw new Error('lost context')
				},
				setVisibleAt: () => {
					throw new Error('lost context')
				},
			},
			instanceId: 0,
			isInstanced: true,
			matrix: new Matrix4(),
		}
		mesh.name = 'kicker-k0'
		expect(() => api.applyVisibility(false, mesh)).not.toThrow()
		expect(api.batchVisibilityStats.hideFailed).to.equal(1)
		expect(() => api.applyVisibility(true, mesh)).not.toThrow()
		expect(api.batchVisibilityStats.restoreFailed).to.equal(1)
	})

	it('syncs batched slots from an ancestor without unhiding nested originals', () => {
		// batchPair nests originals one level below the table root; hiding
		// and showing from the root must drive the batch slot while the
		// nested original stays hidden (or it double-renders).
		const { root, groupB, meshB, batched } = batchPair()
		const slot = (meshB.userData as any).__batched.instanceId as number
		const api = new ThreeRenderApi()
		api.applyVisibility(false, root)
		expect(root.visible).toBe(false)
		expect(groupB.visible).toBe(false)
		expect(meshB.visible).toBe(false)
		expect(batched.getVisibleAt(slot)).toBe(false)
		api.applyVisibility(true, root)
		expect(root.visible).toBe(true)
		expect(groupB.visible).toBe(true)
		expect(batched.getVisibleAt(slot)).toBe(true)
		expect(meshB.visible, 'nested batched original must stay hidden or it double-renders').toBe(false)
	})
})

describe('ThreeRenderApi deep visibility', () => {
	function nestedGroup(): { root: Group; mid: Group; leaf: Mesh; authoredHidden: Mesh } {
		const root = new Group()
		const mid = new Group()
		mid.name = 'mid'
		const leaf = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
		leaf.name = 'leaf'
		const authoredHidden = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
		authoredHidden.name = 'bulb.glow'
		authoredHidden.userData.__authoredVisible = false
		mid.add(leaf, authoredHidden)
		root.add(mid)
		return { root, mid, leaf, authoredHidden }
	}

	it('toggles nested descendants, not just direct children', () => {
		// Nested item groups (light groups, ramp assemblies) keep meshes
		// below the first level; a shallow hide left their flags stale, so
		// the subtree rendered against intent once an ancestor toggled.
		const api = new ThreeRenderApi()
		const { root, mid, leaf } = nestedGroup()
		api.applyVisibility(false, root)
		expect(root.visible).toBe(false)
		expect(mid.visible).toBe(false)
		expect(leaf.visible, 'grandchild mesh hides with its ancestor').toBe(false)
		api.applyVisibility(true, root)
		expect(root.visible).toBe(true)
		expect(mid.visible).toBe(true)
		expect(leaf.visible, 'grandchild mesh shows with its ancestor').toBe(true)
	})

	it('keeps authored-invisible descendants hidden on the deep show path', () => {
		const api = new ThreeRenderApi()
		const { root, leaf, authoredHidden } = nestedGroup()
		api.applyVisibility(false, root)
		expect(authoredHidden.visible).toBe(false)
		api.applyVisibility(true, root)
		expect(root.visible).toBe(true)
		expect(leaf.visible).toBe(true)
		expect(authoredHidden.visible, 'authored-invisible grandchild must survive the show path').toBe(false)
	})
})
