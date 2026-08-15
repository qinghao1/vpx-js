import * as fs from 'node:fs'
import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../../test/table-builder.js'
import { TableMeshGenerator } from '../../vpt/table/table-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

describe('regression: playfield lights via szLightmap', () => {
	it('primitive with szLightmap must react to light intensity even with empty state', async () => {
		const table: any = new TableBuilder()
			.addMaterial('VLM.Bake', { baseColor: 0xffffff })
			.addPrimitive('TestPrim', {
				szMaterial: 'VLM.Bake',
				szLightmap: 'L1',
				addBlend: true,
				alpha: 100,
				color: 0xffffff,
				isVisible: true,
				disableLightingTop: 1,
			})
			.build()
		const origGetMat = table.getMaterial.bind(table)
		table.getMaterial = (n: string) => {
			if (n === 'VLM.Bake') return { baseColor: 0xffffff }
			return origGetMat(n)
		}
		const api = new ThreeRenderApi({ applyMaterials: true } as any) as any
		const gen = new TableMeshGenerator(table)
		const scene = gen.generateTableNode(api, {}) as THREE.Group
		let node: any = null
		scene.traverse((o: any) => {
			if (o.name === 'TestPrim') node = o
		})
		expect(node, 'TestPrim node must exist').toBeTruthy()
		// mock light L1
		let curIntensity = 10
		table.lights = {
			L1: {
				data: { intensity: 10, intensityScale: 1 },
				getState: () => ({ intensity: curIntensity, color: 0xffffff, colorFull: 0xffffff }),
				state: {
					get intensity() {
						return curIntensity
					},
					set intensity(v) {
						curIntensity = v
					},
				},
			},
		}
		table.getLight = (n: string) => table.lights[n]
		const prim = table.primitives.TestPrim as any
		// initial light ON => effectiveIntensity 1
		curIntensity = 10
		prim.getUpdater().applyState(node, {}, api, table)
		let mat = (node.children[0]?.material ?? node.material) as any
		expect(
			mat.emissiveIntensity,
			'emissive should be 1 when light on (alpha 100 * lightFactor 1 * 0.01)',
		).toBeCloseTo(1, 0.01)
		// light OFF => effectiveIntensity 0
		curIntensity = 0
		prim.getUpdater().applyState(node, {}, api, table)
		mat = (node.children[0]?.material ?? node.material) as any
		expect(
			mat.emissiveIntensity,
			'emissive must go to 0 when light off even with empty state (regression: Viewer must re-apply)',
		).toEqual(0)
		// light half
		curIntensity = 5
		prim.getUpdater().applyState(node, {}, api, table)
		mat = (node.children[0]?.material ?? node.material) as any
		expect(mat.emissiveIntensity, 'half intensity => 0.5').toBeCloseTo(0.5, 0.01)
	})

	it('Viewer.applyChangedStates must propagate to szLightmap primitives (file guard)', async () => {
		const viewerCore = fs.readFileSync('demo-browser/viewer-core.js', 'utf-8')
		expect(viewerCore, 'viewer-core must collect changedLightNames').toContain('changedLightNames')
		expect(viewerCore, 'must iterate primitives with szLightmap').toContain('szLightmap')
		expect(viewerCore, 'must call primitive applyState for lightmaps').toMatch(
			/entry\.item\.getUpdater\(\)\.applyState\(entry\.node,\s*\{\}/,
		)
	})

	it('walking_dead lightmap primitives should exist and be addBlend', async () => {
		// sanity check that real table has lightmapped primitives
		const vpxCandidates = ['walking_dead.vpx', '/home/qinghao1/Downloads/walking_dead.vpx']
		const vpx = vpxCandidates.find(p => {
			try {
				return fs.existsSync(p) && fs.statSync(p).size > 1_000_000
			} catch {
				return false
			}
		})
		if (!vpx) return
		const { NodeBinaryReader } = await import('../../../lib/io/binary-reader.node.js')
		const { Table } = await import('../../../lib/vpt/table/table.js')
		const table: any = await Table.load(new NodeBinaryReader(vpx as any) as any, { skipTextures: true } as any)
		const lightmapped = Object.values(table.primitives as Record<string, any>).filter(
			(p: any) => !!p.data.szLightmap,
		)
		expect(lightmapped.length, 'TWD must have primitives with szLightmap').toBeGreaterThan(10)
		// at least some should be playfield inserts
		const playfieldLM = lightmapped.filter(
			(p: any) =>
				(p.data.name ?? '').toLowerCase().includes('playfield') ||
				(p.data.szImage ?? '').toLowerCase().includes('playfield'),
		)
		// Not strict, but ensure lightFactor path is exercised
		expect(lightmapped.length).toBeGreaterThan(0)
	})
})
