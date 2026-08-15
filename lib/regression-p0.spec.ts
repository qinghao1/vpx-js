import * as fs from 'node:fs'
import { MathUtils } from 'three'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../test/table-builder.js'
import { Player } from './game/player.js'
import { HitKD } from './physics/hit-kd.js'
import { Vertex2D, Vertex3D } from './util/vector.js'
import { GlobalApi } from './vpt/global-api.js'
import { Mesh } from './vpt/mesh.js'
import type { RenderVertex } from './vpt/render-vertex.js'

describe('regression: P0 critical fixes', () => {
	describe('slingshot threshold', () => {
		it('line-seg-slingshot must check dot <= -slingshotThreshold not this.threshold', () => {
			const src = fs.readFileSync('lib/physics/line-seg-slingshot.ts', 'utf-8')
			expect(src, 'must use dot threshold check').toContain('dot <= -this.surfaceData.slingshotThreshold')
			expect(src, 'must not use falsy this.threshold').not.toMatch(/&&\s*this\.threshold\s*\)/)
			expect(src, 'must not check this.threshold alone').not.toContain('this.threshold)')
			// file should contain both force and event paths with dot check
			const matches = src.match(/dot <= -this\.surfaceData\.slingshotThreshold/g) ?? []
			expect(
				matches.length,
				'should have at least 2 dot checks (force + event) or 1 event',
			).toBeGreaterThanOrEqual(1)
		})

		it('slingshot event fires when threshold 0 and dot negative', async () => {
			const { LineSegSlingshot } = await import('./physics/line-seg-slingshot.js')
			const { SurfaceData } = await import('./vpt/surface/surface-data.js')
			const { Event } = await import('./game/event.js')
			// mock player physics
			const physics: any = { timeMsec: 1000 }
			const surfaceData: any = { isDisabled: false, slingshotThreshold: 0 }
			const mockSurface: any = {}
			const sling = new LineSegSlingshot(
				mockSurface,
				surfaceData as any,
				new Vertex2D(0, 0),
				new Vertex2D(100, 0),
				0,
				100,
				physics,
			)
			// need to set obj/fe
			let fired = false
			;(sling as any).obj = {
				fireGroupEvent: (e: any) => {
					if (e === Event.SurfaceEventsSlingshot) fired = true
				},
			}
			;(sling as any).fe = true
			;(sling as any).threshold = 0 // old buggy field, should be ignored now
			// mock ball with vel dot negative
			const ball: any = {
				data: { radius: 25 },
				state: { pos: new Vertex3D(50, -1, 0) },
				hit: {
					vel: new Vertex3D(0, -10, 0), // moving towards slingshot, dot with normal?
					eventPos: new Vertex3D(50, 20, 0),
					collide3DWall: () => {},
				},
			}
			// hitNormal is (0,1,0) for horizontal segment from (0,0)-(100,0) normal should be?
			// For LineSegSlingshot, normal is computed from segment, but we override hitNormal via coll
			const n = new Vertex3D(0, 1, 0) // normal pointing up, dot = n·vel = -10
			const coll: any = { ball, hitNormal: n }
			// should fire because dot -10 <= -0 true
			sling.collide(coll as any)
			expect(fired, 'slingshot must fire when dot <= -threshold (threshold 0)').toEqual(true)
			// test not firing when dot is positive (moving away)
			fired = false
			ball.hit.vel.set(0, 10, 0) // dot 10
			ball.state.pos.set(50, -1, 0)
			ball.hit.eventPos.set(50, 20, 0)
			sling.collide(coll as any)
			expect(fired, 'should not fire when dot > -threshold').toEqual(false)
		})
	})

	describe('HitKD allocTwoNodes', () => {
		it('must return exactly 2 nodes not slice to end', () => {
			const src = fs.readFileSync('lib/physics/hit-kd.ts', 'utf-8')
			expect(src, 'must not use slice without end').not.toMatch(/\.slice\(this\.numNodes - 2\)\s*\)/)
			expect(src, 'must return 2-element array').toMatch(/return \[.*this\.nodes\[idx\]/)
		})

		it('allocTwoNodes returns exactly 2 and increments correctly', () => {
			const kd = new (HitKD as any)() as HitKD
			// manually set up nodes array with 10 nodes
			const nodes: any[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))
			;(kd as any).nodes = nodes
			;(kd as any).numNodes = 0
			const a = kd.allocTwoNodes()
			expect(a.length).toEqual(2)
			expect(a[0].id).toEqual(0)
			expect(a[1].id).toEqual(1)
			expect((kd as any).numNodes).toEqual(2)
			const b = kd.allocTwoNodes()
			expect(b.length).toEqual(2)
			expect(b[0].id).toEqual(2)
			expect((kd as any).numNodes).toEqual(4)
			// ensure not returning slice to end (which would be 8 elements)
			expect(b.length).not.toBeGreaterThan(2)
			// exhaust
			;(kd as any).numNodes = 9
			const c = kd.allocTwoNodes()
			expect(c.length).toEqual(0) // out of space
		})
	})

	describe('mesh polygon triangulation', () => {
		it('pre/post indices must use modulo, not buggy ternary', () => {
			const src = fs.readFileSync('lib/vpt/mesh.ts', 'utf-8')
			expect(src, 'must use modulo for pre').toContain('(i - 1 + s) % s')
			expect(src, 'must use modulo for post').toContain('(i + 3) % s')
			expect(src, 'must not contain old buggy pre').not.toContain('i < s - 1 ? i - 1 + s')
			expect(src, 'bounding box must use c2.x not c2.y').not.toMatch(/c2\.y <= maxx/)
			expect(src).toContain('c2.x <= maxx')
		})

		it('polygonToTriangles triangulates square correctly', () => {
			const rgv: RenderVertex[] = [
				{ x: 0, y: 0 } as any,
				{ x: 10, y: 0 } as any,
				{ x: 10, y: 10 } as any,
				{ x: 0, y: 10 } as any,
			]
			const pvpoly = [0, 1, 2, 3]
			const tris = Mesh.polygonToTriangles(rgv as any, [...pvpoly])
			expect(tris.length).toEqual(6) // 2 triangles *3 indices
			// should be 2 triangles covering square, no duplicate or missing
			expect(tris).toHaveLength(6)
			// check that indices are within 0-3
			for (const idx of tris) expect(idx).toBeGreaterThanOrEqual(0), expect(idx).toBeLessThan(4)
		})

		it('advancePoint bounding box check uses correct axis', () => {
			// create a case where old bug (c2.y <= maxx) would incorrectly pass
			const rgv: RenderVertex[] = [
				{ x: 0, y: 0 } as any, // 0
				{ x: 10, y: 0 } as any, //1
				{ x: 10, y: 10 } as any, //2
				{ x: 0, y: 10 } as any, //3
				{ x: 5, y: 20 } as any, //4 far outside
			]
			// simple square should still triangulate without being blocked by far point
			const tris = Mesh.polygonToTriangles(rgv as any, [0, 1, 2, 3])
			expect(tris.length).toEqual(6)
		})
	})

	describe('bumper scatter radians', () => {
		it('bumper-hit must convert scatter degrees to radians', () => {
			const file = fs.existsSync('lib/vpt/bumper/bumper-physics.ts')
				? 'lib/vpt/bumper/bumper-physics.ts'
				: 'lib/vpt/bumper/bumper-hit.ts'
			const src = fs.readFileSync(file, 'utf-8')
			expect(src).toContain('degToRad')
			expect(src).toMatch(/MathUtils\.degToRad\(data\.scatter/)
		})

		it('bumper scatter 90deg becomes pi/2 radians', async () => {
			const { BumperHit } = await import('./vpt/bumper/bumper-hit.js')
			const { BumperData } = await import('./vpt/bumper/bumper-data.js')
			const data: any = new (BumperData as any)('test')
			data.center = new Vertex2D(0, 0)
			data.radius = 10
			data.scatter = 90 // degrees
			data.isCollidable = true
			data.heightScale = 10
			data.threshold = 1
			data.force = 1
			const hit = new (BumperHit as any)(
				data,
				{},
				{ hitEvent: false, ballHitPosition: { setAndRelease: () => {} } },
				{ fireGroupEvent: () => {} },
				0,
			)
			expect((hit as any).scatter).toBeCloseTo(MathUtils.degToRad(90), 1e-6)
			expect((hit as any).scatter).toBeCloseTo(Math.PI / 2, 1e-6)
			// 0 degrees stays 0
			data.scatter = 0
			const hit2 = new (BumperHit as any)(
				data,
				{},
				{ hitEvent: false, ballHitPosition: { setAndRelease: () => {} } },
				{ fireGroupEvent: () => {} },
				0,
			)
			expect((hit2 as any).scatter).toEqual(0)
		})
	})

	describe('ActiveBall', () => {
		it('global-api must return BallApi not Ball', () => {
			const src = fs.readFileSync('lib/vpt/global-api.ts', 'utf-8')
			expect(src).toContain('getActiveBall()?.getApi()')
			expect(src).not.toMatch(/return this\.player\.getActiveBall\(\)\s*$/m)
		})

		it('ActiveBall returns api when ball exists', async () => {
			const { Table } = await import('./vpt/table/table.js')
			const { NodeBinaryReader } = await import('./io/binary-reader.node.js')
			const three = (await import('../test/three.helper.js')).ThreeHelper
				? new (await import('../test/three.helper.js')).ThreeHelper()
				: null
			// fallback: use TableBuilder
			const table = new TableBuilder().build()
			const player = new Player(table).init()
			const api = new GlobalApi(table, player)
			expect(api.ActiveBall).toBeUndefined() // no ball yet -> undefined
			// create ball via kicker? use direct player API
			// Instead mock player.getActiveBall to return Ball with getApi
			const mockBallApi = { name: 'ballApi' }
			const mockBall: any = { getApi: () => mockBallApi }
			;(player as any).getActiveBall = () => mockBall
			expect(api.ActiveBall).toBe(mockBallApi)
			;(player as any).getActiveBall = () => null
			expect(api.ActiveBall).toBeUndefined()
		})
	})

	describe('WASM kernels C_TOL_ENDPNTS', () => {
		it('kernels.cpp must define C_TOL_ENDPNTS and use it', () => {
			const src = fs.readFileSync('wasm/modules/kernels/src/kernels.cpp', 'utf-8')
			expect(src).toContain('C_TOL_ENDPNTS')
			expect(src).toMatch(/constexpr float C_TOL_ENDPNTS/)
			expect(src).toMatch(/btd < -C_TOL_ENDPNTS \|\| btd > len \+ C_TOL_ENDPNTS/)
			expect(src, 'must not have bare btd <0 without tolerance').not.toMatch(/if \(btd < 0 \|\| btd > len\)/)
		})
	})
})
