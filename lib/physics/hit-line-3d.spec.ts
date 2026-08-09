import { describe, expect, it } from 'vitest'
import { Vertex3D } from '../util/math.js'
import { HitLine3D } from './hit-line-3d.js'
import { CollisionEvent } from './collision-event.js'

describe('HitLine3D', () => {
	it('scalar hitTest matches vpinball reference (matrix transpose correct)', async () => {
		const { default: createKernels } = await import('../../wasm/kernels/dist/kernels.js')
		const mod: any = await (createKernels as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const C_CONTACTVEL = 0.099
		function testLineZ(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number) {
			let dx = bx - lx, dy = by - ly, d2 = dx * dx + dy * dy, d = Math.sqrt(d2)
			if (d <= 1e-6) return { t: -1 }
			let b = dx * vx + dy * vy, bnv = b / d
			if (bnv > C_CONTACTVEL) return { t: -1 }
			let bnd = d - br, a = vx * vx + vy * vy
			let t = 0
			if (bnd < 0.05) {
				if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
				else t = -bnd / bnv
			} else {
				if (a < 1e-8) return { t: -1 }
				let disc = 4 * b * b - 4 * a * (d2 - br * br)
				if (disc < 0) return { t: -1 }
				let s = Math.sqrt(disc), inv = -0.5 / a
				let t0 = (2 * b + s) * inv, t1 = (2 * b - s) * inv
				t = t0 * t1 < 0 ? Math.max(t0, t1) : Math.min(t0, t1)
			}
			if (!Number.isFinite(t) || t < 0 || t > dt) return { t: -1 }
			let hz = bz + vz * t
			if (hz < zl || hz > zh) return { t: -1 }
			let hx = bx + vx * t, hy = by + vy * t, nx = hx - lx, ny = hy - ly, len = Math.hypot(nx, ny)
			if (len > 1e-8) { nx /= len; ny /= len } else { nx = 0; ny = 1 }
			return { t, nx, ny, nz: 0 }
		}
		function refHit(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, lx: number, ly: number, zl: number, zh: number, m: number[], dt: number) {
			const m00 = m[0]!, m01 = m[3]!, m02 = m[6]!, m10 = m[1]!, m11 = m[4]!, m12 = m[7]!, m20 = m[2]!, m21 = m[5]!, m22 = m[8]!
			const tbx = m00 * bx + m01 * by + m02 * bz
			const tby = m10 * bx + m11 * by + m12 * bz
			const tbz = m20 * bx + m21 * by + m22 * bz
			const tvx = m00 * vx + m01 * vy + m02 * vz
			const tvy = m10 * vx + m11 * vy + m12 * vz
			const tvz = m20 * vx + m21 * vy + m22 * vz
			const h: any = testLineZ(tbx, tby, tbz, tvx, tvy, tvz, r, lx, ly, zl, zh, dt)
			if (h.t >= 0) {
				const onx = h.nx, ony = h.ny, onz = h.nz
				h.nx = m00 * onx + m10 * ony + m20 * onz
				h.ny = m01 * onx + m11 * ony + m21 * onz
				h.nz = m02 * onx + m12 * ony + m22 * onz
			}
			return h
		}
		for (let iter = 0; iter < 100; iter++) {
			const rand = (a: number, b: number) => Math.random() * (b - a) + a
			const v1 = new Vertex3D(rand(-50, 50), rand(-50, 50), rand(0, 30))
			const v2 = new Vertex3D(rand(-50, 50), rand(-50, 50), rand(0, 30))
			if (v1.clone(true).sub(v2).lengthSq() < 1) { iter--; continue }
			const hit = new HitLine3D(v1, v2)
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			const pos = new Vertex3D(bx, by, bz), vel = new Vertex3D(vx, vy, vz)
			const ball: any = { state: { pos }, hit: { vel, hitBBox: {}, rcHitRadiusSqr: 1e9 }, data: { radius: r } }
			const coll = CollisionEvent.claim()
			coll.hitTime = dt
			const t = hit.hitTest(ball, dt, coll)
			const m = (hit as any).matrix.elements as number[]
			const lx = (hit as any).xy.x, ly = (hit as any).xy.y, zl = (hit as any).zLow, zh = (hit as any).zHigh
			const ref = refHit(bx, by, bz, vx, vy, vz, r, lx, ly, zl, zh, m, dt)
			if (ref.t === -1) expect(t).toBe(-1)
			else {
				expect(t).toBeCloseTo(ref.t, 3)
				expect(coll.hitNormal.x).toBeCloseTo(ref.nx, 2)
				expect(coll.hitNormal.y).toBeCloseTo(ref.ny, 2)
				expect(coll.hitNormal.z).toBeCloseTo(ref.nz, 2)
			}
			CollisionEvent.release(coll)
			const pLx = mod._malloc(4), pLy = mod._malloc(4), pZl = mod._malloc(4), pZh = mod._malloc(4)
			const pM00 = mod._malloc(4), pM01 = mod._malloc(4), pM02 = mod._malloc(4), pM10 = mod._malloc(4), pM11 = mod._malloc(4), pM12 = mod._malloc(4), pM20 = mod._malloc(4), pM21 = mod._malloc(4), pM22 = mod._malloc(4)
			const m00 = m[0]!, m01 = m[3]!, m02 = m[6]!, m10 = m[1]!, m11 = m[4]!, m12 = m[7]!, m20 = m[2]!, m21 = m[5]!, m22 = m[8]!
			new Float32Array(mod.HEAPF32.buffer, pLx, 1)[0] = lx; new Float32Array(mod.HEAPF32.buffer, pLy, 1)[0] = ly; new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl; new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			new Float32Array(mod.HEAPF32.buffer, pM00, 1)[0] = m00; new Float32Array(mod.HEAPF32.buffer, pM01, 1)[0] = m01; new Float32Array(mod.HEAPF32.buffer, pM02, 1)[0] = m02
			new Float32Array(mod.HEAPF32.buffer, pM10, 1)[0] = m10; new Float32Array(mod.HEAPF32.buffer, pM11, 1)[0] = m11; new Float32Array(mod.HEAPF32.buffer, pM12, 1)[0] = m12
			new Float32Array(mod.HEAPF32.buffer, pM20, 1)[0] = m20; new Float32Array(mod.HEAPF32.buffer, pM21, 1)[0] = m21; new Float32Array(mod.HEAPF32.buffer, pM22, 1)[0] = m22
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestLine3D(1, bx, by, bz, vx, vy, vz, r, pLx, pLy, pZl, pZh, pM00, pM01, pM02, pM10, pM11, pM12, pM20, pM21, pM22, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const wt = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (ref.t === -1) expect(wt).toBeCloseTo(-1, 5)
			else expect(wt).toBeCloseTo(ref.t, 3)
			mod._free(pLx); mod._free(pLy); mod._free(pZl); mod._free(pZh); mod._free(pM00); mod._free(pM01); mod._free(pM02); mod._free(pM10); mod._free(pM11); mod._free(pM12); mod._free(pM20); mod._free(pM21); mod._free(pM22); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
			Vertex3D.release(v1, v2, pos, vel)
		}
	})
})
