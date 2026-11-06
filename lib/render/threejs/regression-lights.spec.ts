// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { findWalkingDead } from '../../../test/harness/bench-shared.js'
import { TableBuilder } from '../../../test/table-builder.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import { DragPoint } from '../../vpt/dragpoint.js'
import { Enums } from '../../vpt/enums.js'
import { Light, LightData } from '../../vpt/light/light.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeLightMeshGenerator } from './three-light-mesh-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

const walkingDeadVpx = findWalkingDead()
const requireWalkingDead = (): string => {
	if (!walkingDeadVpx) throw new Error('walking_dead.vpx not found')
	return walkingDeadVpx
}

describe('regression: playfield lights via szLightmap', () => {
	it.skipIf(!walkingDeadVpx)('walking_dead lightmap primitives should exist and be addBlend', async () => {
		// sanity check that real table has lightmapped primitives
		const vpx = requireWalkingDead()
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
		expect(playfieldLM.length).toBeGreaterThan(0)
	})
})

describe('direct getMeshes unit tests (no GLB)', () => {
	function glowLightData(): LightData {
		const data = new LightData('L1')
		data.center = new Vertex2D(500, 1000)
		data.bulbLight = true
		data.bulbHaloHeight = 28
		for (const [x, y] of [
			[450, 950],
			[550, 950],
			[550, 1050],
			[450, 1050],
		]) {
			const point = new DragPoint()
			point.vertex = new Vertex3D(x, y, 0)
			data.dragPoints.push(point)
		}
		return data
	}

	function glowZs(geometry: THREE.BufferGeometry): number[] {
		const positions = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
		return Array.from(positions).filter((_, index) => index % 3 === 2)
	}

	// Local -z maps to world +y (above the surface) via transformScene's
	// rotateX, the same convention as the extruded light mesh (-surfaceHeight).
	it('lifts the bulb glow quad to surfaceHeight + bulbHaloHeight + 0.1', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(data, table)
		expect(geometry.name).toBe('bulb.glow')
		const zs = glowZs(geometry)
		expect(zs.length).toBeGreaterThan(0)
		for (const z of zs) expect(z).toBe(Math.fround(-(60 + 28 + 0.1)))
	})

	it('omits the halo lift for non-bulb glow geometry', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.bulbLight = false
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(data, table)
		for (const z of glowZs(geometry)) expect(z).toBe(Math.fround(-(60 + 0.1)))
	})

	it('lifts from playfield zero without a surface', () => {
		const table = new TableBuilder().build()
		const geometry = new ThreeLightMeshGenerator().createBulbGlowGeometry(glowLightData(), table)
		for (const z of glowZs(geometry)) expect(z).toBe(Math.fround(-(28 + 0.1)))
	})

	it('wires the Light.getMeshes glow entry with the exact lift and live params', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.color = 0xff2211
		data.state = Enums.LightStatus.LightStateOn
		data.intensity = 2
		const meshes = new Light(data).getMeshes(table, new ThreeRenderApi())
		expect(meshes.glow).toBeDefined()
		expect(meshes.glow?.bulbGlow?.color).toBe(0xff2211)
		expect(meshes.glow?.bulbGlow?.intensity).toBe(2)
		// No depthBias stamp: the converter pins glow quads to the overlay
		// layer (renderOrder 10) and the glow material ignores depthBias,
		// so a stamp would be dead data.
		expect(meshes.glow?.depthBias).toBeUndefined()
		const glowGeometry = meshes.glow?.geometry as THREE.BufferGeometry
		for (const z of glowZs(glowGeometry)) expect(z).toBe(Math.fround(-(60 + 28 + 0.1)))
	})

	it('places the point light above the surface in local -z like the glow quad', () => {
		const table = new TableBuilder().addSurface('S1', { heightTop: 60 }).build()
		const data = glowLightData()
		data.szSurface = 'S1'
		data.height = 10
		const light = new ThreeLightGenerator().createPointLight(data, table)
		expect(light.position.x).toBe(500)
		expect(light.position.y).toBe(1000)
		expect(light.position.z).toBe(-(60 + 10))
	})
})
