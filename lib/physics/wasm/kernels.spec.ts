import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import type { Ball } from '../../vpt/ball/ball.js'
import { CollisionEvent } from '../collision-event.js'
import { CollisionType } from '../collision-type.js'
import { Hit3DPoly } from '../hit-3dpoly.js'
import { HitKind } from '../hit-object.js'
import { HitPlane } from '../hit-plane.js'
import { LineSeg } from '../line-seg.js'
import { BatchCollector, countBatchables } from './batched-hittest.js'
import type { LineSegViews } from './kernels.js'
import {
	getWasmBatchHitViewsOutCircle,
	getWasmBatchHitViewsOutPoly,
	getWasmKernels,
	getWasmModSync,
	isWasmReady,
	POLY_MAX_VERTS,
	tryGetWasmBatchHitViewsOutCircle,
	tryGetWasmBatchHitViewsOutLine3D,
	tryGetWasmBatchHitViewsOutLineSeg,
	tryGetWasmBatchHitViewsOutLineZ,
	tryGetWasmBatchHitViewsOutPlane,
	tryGetWasmBatchHitViewsOutPoint,
	tryGetWasmBatchHitViewsOutPoly,
	tryGetWasmBatchHitViewsOutTriangle,
	warmWasmPools,
} from './kernels.js'

/** Hermetic guard: every suite that loads the built kernels skips when dist is absent. */
const hasWasmDist =
	existsSync(new URL('../../../wasm/dist/kernels.js', import.meta.url)) &&
	existsSync(new URL('../../../wasm/dist/kernels.wasm', import.meta.url))

const C_CONTACTVEL = 0.099,
	C_LOWNORMVEL = 0.0001,
	PHYS_TOUCH = 0.05
function pickTime(a: number, b: number) {
	return a * b < 0 ? Math.max(a, b) : Math.min(a, b)
}

function refPlane(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	nx: number,
	ny: number,
	nz: number,
	d: number,
	dt: number,
) {
	const bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return -1
	const bnd = nx * bx + ny * by + nz * bz - r - d
	if (bnd < r * -2) return -1
	// FIX_PHYSICS (upstream collideex.cpp HitPlane::HitTest): a slow touch is
	// a contact at time 0; a slow ball embedded deeper than PHYS_TOUCH
	// collides at time 0 instead of sinking through.
	let t = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL && bnd >= -PHYS_TOUCH) t = 0
		else if (bnd <= 0) t = 0
		else t = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return -1
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	return t
}
function refCircle(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	br: number,
	cx: number,
	cy: number,
	cr: number,
	zl: number,
	zh: number,
	dt: number,
) {
	const dx = bx - cx,
		dy = by - cy,
		d2 = dx * dx + dy * dy,
		d = Math.sqrt(d2)
	if (d <= 1e-6) return -1
	const b = dx * vx + dy * vy,
		bnv = b / d
	if (bnv > C_LOWNORMVEL) return -1
	const bnd = d - (cr + br),
		a = vx * vx + vy * vy
	let t = 0,
		contact = 0
	if (bnd < PHYS_TOUCH) {
		if (bnd < -br) return -1
		if (Math.abs(bnv) <= C_CONTACTVEL) contact = 1
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return -1
		const disc = 4 * b * b - 4 * a * (d2 - (cr + br) * (cr + br))
		if (disc < 0) return -1
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	const hz = bz + vz * t
	if (hz + br * 0.5 < zl || hz - br * 0.5 > zh) return -1
	return t
}
function refLineZ(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	br: number,
	lx: number,
	ly: number,
	zl: number,
	zh: number,
	dt: number,
) {
	const dx = bx - lx,
		dy = by - ly,
		d2 = dx * dx + dy * dy,
		d = Math.sqrt(d2)
	if (d <= 1e-6) return -1
	const b = dx * vx + dy * vy,
		bnv = b / d
	if (bnv > C_CONTACTVEL) return -1
	const bnd = d - br,
		a = vx * vx + vy * vy
	let t = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else t = -bnd / bnv
	} else {
		if (a < 1e-8) return -1
		const disc = 4 * b * b - 4 * a * (d2 - br * br)
		if (disc < 0) return -1
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	const hz = bz + vz * t
	if (hz < zl || hz > zh) return -1
	return t
}
function refPoint(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	px: number,
	py: number,
	pz: number,
	dt: number,
) {
	const dx = bx - px,
		dy = by - py,
		dz = bz - pz,
		bcddsq = dx * dx + dy * dy + dz * dz,
		bcdd = Math.sqrt(bcddsq)
	if (bcdd <= 1e-6) return -1
	const b = dx * vx + dy * vy + dz * vz,
		bnv = b / bcdd
	if (bnv > C_CONTACTVEL) return -1
	const bnd = bcdd - r,
		a = vx * vx + vy * vy + vz * vz
	let t = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return -1
		const disc = 4 * b * b - 4 * a * (bcddsq - r * r)
		if (disc < 0) return -1
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		const t0 = (2 * b + s) * inv,
			t1 = (2 * b - s) * inv
		t = t0 * t1 < 0 ? Math.max(t0, t1) : Math.min(t0, t1)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	return t
}
function refTriangle(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	r0x: number,
	r0y: number,
	r0z: number,
	r1x: number,
	r1y: number,
	r1z: number,
	r2x: number,
	r2y: number,
	r2z: number,
	nx: number,
	ny: number,
	nz: number,
	dt: number,
) {
	const bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return -1
	const hx = bx - nx * r,
		hy = by - ny * r,
		hz = bz - nz * r
	const bnd = nx * (hx - r0x) + ny * (hy - r0y) + nz * (hz - r0z)
	if (bnd < -r) return -1
	let t = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else if (bnd <= 0) t = 0
		else t = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return -1
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	const hpx = hx + vx * t,
		hpy = hy + vy * t,
		hpz = hz + vz * t
	const v0x = r2x - r0x,
		v0y = r2y - r0y,
		v0z = r2z - r0z
	const v1x = r1x - r0x,
		v1y = r1y - r0y,
		v1z = r1z - r0z
	const v2x = hpx - r0x,
		v2y = hpy - r0y,
		v2z = hpz - r0z
	const dot00 = v0x * v0x + v0y * v0y + v0z * v0z
	const dot01 = v0x * v1x + v0y * v1y + v0z * v1z
	const dot02 = v0x * v2x + v0y * v2y + v0z * v2z
	const dot11 = v1x * v1x + v1y * v1y + v1z * v1z
	const dot12 = v1x * v2x + v1y * v2y + v1z * v2z
	const denom = dot00 * dot11 - dot01 * dot01
	const inv = 1 / denom
	const u = (dot11 * dot02 - dot01 * dot12) * inv
	const v_ = (dot00 * dot12 - dot01 * dot02) * inv
	if (u < 0 || v_ < 0 || u + v_ > 1) return -1
	return t
}
function refLineSeg(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	v1x: number,
	v1y: number,
	v2x: number,
	v2y: number,
	nx: number,
	ny: number,
	len: number,
	zl: number,
	zh: number,
	dt: number,
) {
	const bnv = vx * nx + vy * ny
	if (bnv > C_LOWNORMVEL) return -1
	const bcpd = (bx - v1x) * nx + (by - v1y) * ny
	const bnd = bcpd - r
	if (bnd < -r || bcpd < 0) return -1
	// FIX_PHYSICS (upstream collide.cpp LineSeg::HitTestBasic): the whole
	// touch band reports time 0.
	let t = 0
	if (bnd <= PHYS_TOUCH) t = 0
	else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return -1
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	const btv = vx * ny - vy * nx
	const btd = (bx - v1x) * ny - (by - v1y) * nx + btv * t
	if (btd < 0 || btd > len) return -1
	const hz = bz + vz * t
	if (hz + r * 0.5 < zl || hz - r * 0.5 > zh) return -1
	return t
}
function refLine3D(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	lx: number,
	ly: number,
	zl: number,
	zh: number,
	m00: number,
	m01: number,
	m02: number,
	m10: number,
	m11: number,
	m12: number,
	m20: number,
	m21: number,
	m22: number,
	dt: number,
) {
	const tbx = m00 * bx + m01 * by + m02 * bz
	const tby = m10 * bx + m11 * by + m12 * bz
	const tbz = m20 * bx + m21 * by + m22 * bz
	const tvx = m00 * vx + m01 * vy + m02 * vz
	const tvy = m10 * vx + m11 * vy + m12 * vz
	const tvz = m20 * vx + m21 * vy + m22 * vz
	const h = refLineZ(tbx, tby, tbz, tvx, tvy, tvz, r, lx, ly, zl, zh, dt)
	return h
}

/** Deterministic PRNG (mulberry32): all differential fuzz in this file is seeded. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
function seededRange(rng: () => number, a: number, b: number): number {
	return a + rng() * (b - a)
}

type KernelMod = {
	_malloc(n: number): number
	_free(p: number): void
	HEAPF32: Float32Array
	HEAP32: Int32Array
	[fn: string]: unknown
}
let sharedMod: KernelMod | undefined
async function getKernelMod(): Promise<KernelMod> {
	if (!sharedMod) {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		sharedMod = (await (create as (o?: unknown) => Promise<KernelMod>)({
			locateFile: (p: string) => `wasm/dist/${p}`,
		})) as KernelMod
	}
	return sharedMod
}
function callBatch(mod: KernelMod, fn: string, ...args: number[]): void {
	;(mod[fn] as (...a: number[]) => void)(...args)
}
function mallocF32(mod: KernelMod, values: ArrayLike<number>): number {
	const ptr = mod._malloc(values.length * 4)
	new Float32Array(mod.HEAPF32.buffer, ptr, values.length).set(values)
	return ptr
}
function mallocI32(mod: KernelMod, values: ArrayLike<number>): number {
	const ptr = mod._malloc(values.length * 4)
	new Int32Array(mod.HEAP32.buffer, ptr, values.length).set(values)
	return ptr
}
function readF32(mod: KernelMod, ptr: number, n: number): Float32Array {
	return new Float32Array(mod.HEAPF32.buffer, ptr, n).slice()
}
function readI32(mod: KernelMod, ptr: number, n: number): Int32Array {
	return new Int32Array(mod.HEAP32.buffer, ptr, n).slice()
}
type KernelOut = {
	t: Float32Array
	c: Int32Array
	nx: Float32Array
	ny: Float32Array
	nz: Float32Array
	dist: Float32Array
	bnv: Float32Array
}
/** Full Hit struct mirror of kernels.cpp (`Hit{t,contact,nx,ny,nz,dist,bnv}`). */
type FullHit = { t: number; contact: number; nx: number; ny: number; nz: number; dist: number; bnv: number }
function missHit(): FullHit {
	return { t: -1, contact: 0, nx: 0, ny: 0, nz: 0, dist: 0, bnv: 0 }
}
function refFullPlane(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	nx: number,
	ny: number,
	nz: number,
	d: number,
	dt: number,
): FullHit {
	const bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return missHit()
	const bnd = nx * bx + ny * by + nz * bz - r - d
	if (bnd < r * -2) return missHit()
	// FIX_PHYSICS (upstream collideex.cpp HitPlane::HitTest).
	let t = 0,
		contact = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL && bnd >= -PHYS_TOUCH) contact = 1
		else if (bnd <= 0) t = 0
		else t = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return missHit()
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	return { t, contact, nx, ny, nz, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullCircle(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	br: number,
	cx: number,
	cy: number,
	cr: number,
	zl: number,
	zh: number,
	dt: number,
): FullHit {
	const dx = bx - cx,
		dy = by - cy,
		d2 = dx * dx + dy * dy,
		d = Math.sqrt(d2)
	if (d <= 1e-6) return missHit()
	const b = dx * vx + dy * vy,
		bnv = b / d
	if (bnv > C_LOWNORMVEL) return missHit()
	const bnd = d - (cr + br),
		a = vx * vx + vy * vy
	let t = 0,
		contact = 0
	if (bnd < PHYS_TOUCH) {
		if (bnd < -br) return missHit()
		if (Math.abs(bnv) <= C_CONTACTVEL) contact = 1
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return missHit()
		const disc = 4 * b * b - 4 * a * (d2 - (cr + br) * (cr + br))
		if (disc < 0) return missHit()
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	const hz = bz + vz * t
	if (hz + br * 0.5 < zl || hz - br * 0.5 > zh) return missHit()
	const hx = bx + vx * t,
		hy = by + vy * t
	const s2 = (hx - cx) * (hx - cx) + (hy - cy) * (hy - cy)
	let nx: number, ny: number
	if (s2 > 1e-8) {
		const inv = 1 / Math.sqrt(s2)
		nx = (hx - cx) * inv
		ny = (hy - cy) * inv
	} else {
		nx = 0
		ny = 1
	}
	return { t, contact, nx, ny, nz: 0, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullLineZ(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	br: number,
	lx: number,
	ly: number,
	zl: number,
	zh: number,
	dt: number,
): FullHit {
	const dx = bx - lx,
		dy = by - ly,
		d2 = dx * dx + dy * dy,
		d = Math.sqrt(d2)
	if (d <= 1e-6) return missHit()
	const b = dx * vx + dy * vy,
		bnv = b / d
	if (bnv > C_CONTACTVEL) return missHit()
	const bnd = d - br,
		a = vx * vx + vy * vy
	let t = 0,
		contact = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) contact = 1
		else t = -bnd / bnv
	} else {
		if (a < 1e-8) return missHit()
		const disc = 4 * b * b - 4 * a * (d2 - br * br)
		if (disc < 0) return missHit()
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	const hz = bz + vz * t
	if (hz < zl || hz > zh) return missHit()
	const hx = bx + vx * t,
		hy = by + vy * t
	let nx = hx - lx,
		ny = hy - ly
	const len = Math.sqrt(nx * nx + ny * ny)
	if (len > 1e-8) {
		nx /= len
		ny /= len
	} else {
		nx = 0
		ny = 1
	}
	return { t, contact, nx, ny, nz: 0, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullPoint(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	px: number,
	py: number,
	pz: number,
	dt: number,
): FullHit {
	const dx = bx - px,
		dy = by - py,
		dz = bz - pz
	const bcddsq = dx * dx + dy * dy + dz * dz,
		bcdd = Math.sqrt(bcddsq)
	if (bcdd <= 1e-6) return missHit()
	const b = dx * vx + dy * vy + dz * vz,
		bnv = b / bcdd
	if (bnv > C_CONTACTVEL) return missHit()
	const bnd = bcdd - r,
		a = vx * vx + vy * vy + vz * vz
	let t = 0,
		contact = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) contact = 1
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return missHit()
		const disc = 4 * b * b - 4 * a * (bcddsq - r * r)
		if (disc < 0) return missHit()
		const s = Math.sqrt(disc),
			inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	const hx = bx + vx * t,
		hy = by + vy * t,
		hz = bz + vz * t
	let nx = hx - px,
		ny = hy - py,
		nz = hz - pz
	const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
	if (len > 1e-8) {
		nx /= len
		ny /= len
		nz /= len
	} else {
		nx = 0
		ny = 0
		nz = 0
	}
	return { t, contact, nx, ny, nz, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullTriangle(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	r0x: number,
	r0y: number,
	r0z: number,
	r1x: number,
	r1y: number,
	r1z: number,
	r2x: number,
	r2y: number,
	r2z: number,
	nx: number,
	ny: number,
	nz: number,
	dt: number,
): FullHit {
	const bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return missHit()
	const hx = bx - nx * r,
		hy = by - ny * r,
		hz = bz - nz * r
	const bnd = nx * (hx - r0x) + ny * (hy - r0y) + nz * (hz - r0z)
	if (bnd < -r) return missHit()
	let t = 0,
		contact = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) {
			t = 0
			contact = 1
		} else if (bnd <= 0) t = 0
		else t = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return missHit()
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	const hpx = hx + vx * t,
		hpy = hy + vy * t,
		hpz = hz + vz * t
	const v0x = r2x - r0x,
		v0y = r2y - r0y,
		v0z = r2z - r0z
	const v1x = r1x - r0x,
		v1y = r1y - r0y,
		v1z = r1z - r0z
	const v2x = hpx - r0x,
		v2y = hpy - r0y,
		v2z = hpz - r0z
	const dot00 = v0x * v0x + v0y * v0y + v0z * v0z
	const dot01 = v0x * v1x + v0y * v1y + v0z * v1z
	const dot02 = v0x * v2x + v0y * v2y + v0z * v2z
	const dot11 = v1x * v1x + v1y * v1y + v1z * v1z
	const dot12 = v1x * v2x + v1y * v2y + v1z * v2z
	const inv = 1 / (dot00 * dot11 - dot01 * dot01)
	const u = (dot11 * dot02 - dot01 * dot12) * inv
	const v = (dot00 * dot12 - dot01 * dot02) * inv
	if (u < 0 || v < 0 || u + v > 1) return missHit()
	return { t, contact, nx, ny, nz, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullLineSeg(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	v1x: number,
	v1y: number,
	nx: number,
	ny: number,
	len: number,
	zl: number,
	zh: number,
	dt: number,
): FullHit {
	const bnv = vx * nx + vy * ny
	if (bnv > C_LOWNORMVEL) return missHit()
	const bcpd = (bx - v1x) * nx + (by - v1y) * ny
	const bnd = bcpd - r
	if (bnd < -r || bcpd < 0) return missHit()
	// FIX_PHYSICS (upstream collide.cpp LineSeg::HitTestBasic): the whole
	// touch band reports time 0. The contact flag is set below.
	let t = 0
	if (bnd <= PHYS_TOUCH) t = 0
	else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return missHit()
	if (!Number.isFinite(t) || t < 0 || t > dt) return missHit()
	const btv = vx * ny - vy * nx
	const btd = (bx - v1x) * ny - (by - v1y) * nx + btv * t
	if (btd < 0 || btd > len) return missHit()
	const hz = bz + vz * t
	if (hz + r * 0.5 < zl || hz - r * 0.5 > zh) return missHit()
	const contact = Math.abs(bnv) <= C_CONTACTVEL && Math.abs(bnd) <= PHYS_TOUCH ? 1 : 0
	return { t, contact, nx, ny, nz: 0, dist: bnd, bnv: contact ? bnv : 0 }
}
function refFullLine3D(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	lx: number,
	ly: number,
	zl: number,
	zh: number,
	m00: number,
	m01: number,
	m02: number,
	m10: number,
	m11: number,
	m12: number,
	m20: number,
	m21: number,
	m22: number,
	dt: number,
): FullHit {
	const tbx = m00 * bx + m01 * by + m02 * bz
	const tby = m10 * bx + m11 * by + m12 * bz
	const tbz = m20 * bx + m21 * by + m22 * bz
	const tvx = m00 * vx + m01 * vy + m02 * vz
	const tvy = m10 * vx + m11 * vy + m12 * vz
	const tvz = m20 * vx + m21 * vy + m22 * vz
	const h = refFullLineZ(tbx, tby, tbz, tvx, tvy, tvz, r, lx, ly, zl, zh, dt)
	if (h.t >= 0) {
		const onx = h.nx,
			ony = h.ny,
			onz = h.nz
		h.nx = m00 * onx + m10 * ony + m20 * onz
		h.ny = m01 * onx + m11 * ony + m21 * onz
		h.nz = m02 * onx + m12 * ony + m22 * onz
	}
	return h
}
function refFullPoly(
	bx: number,
	by: number,
	bz: number,
	vx: number,
	vy: number,
	vz: number,
	r: number,
	nx: number,
	ny: number,
	nz: number,
	r0x: number,
	r0y: number,
	r0z: number,
	numVerts: number,
	vertsX: ArrayLike<number>,
	vertsY: ArrayLike<number>,
	dt: number,
): FullHit {
	if (numVerts < 3 || numVerts > POLY_MAX_VERTS) return missHit()
	const bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_LOWNORMVEL) return missHit()
	const hx0 = bx - nx * r,
		hy0 = by - ny * r,
		hz0 = bz - nz * r
	const bnd = nx * (hx0 - r0x) + ny * (hy0 - r0y) + nz * (hz0 - r0z)
	const inside = bnd <= 0
	if (bnd < -r) return missHit()
	// FIX_PHYSICS (upstream collideex.cpp Hit3DPoly::HitTest): a slow touch is
	// a contact at time 0; deeper embeds stay collisions.
	let hitTime = 0,
		contact = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL && bnd > -PHYS_TOUCH) contact = 1
		else if (!inside) hitTime = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) hitTime = bnd / -bnv
	else return missHit()
	if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dt) return missHit()
	const hpx = hx0 + vx * hitTime,
		hpy = hy0 + vy * hitTime
	let x2 = vertsX[0] ?? 0,
		y2 = vertsY[0] ?? 0
	let hx2 = hpx >= x2,
		hy2 = hpy <= y2
	let cross = 0
	for (let i = 0; i < numVerts; i++) {
		const x1 = x2,
			y1 = y2,
			hx1 = hx2,
			hy1 = hy2
		const j = (i + 1) % numVerts
		x2 = vertsX[j] ?? 0
		y2 = vertsY[j] ?? 0
		hx2 = hpx >= x2
		hy2 = hpy <= y2
		if (y1 === y2 || (hy1 && hy2) || (!hy1 && !hy2) || (hx1 && hx2)) continue
		if (!hx1 && !hx2) {
			cross ^= 1
			continue
		}
		if (x2 === x1) {
			if (!hx2) cross ^= 1
			continue
		}
		if (x2 - ((y2 - hpy) * (x1 - x2)) / (y1 - y2) > hpx) cross ^= 1
	}
	if (!(cross & 1)) return missHit()
	return { t: hitTime, contact, nx, ny, nz, dist: bnd, bnv: contact ? bnv : 0 }
}
/** Asserts one output lane against the JS reference struct. `missDist` covers the
 * plane kernel, whose SIMD lanes write oDist=-1 on miss while the scalar tail
 * writes 0 (kernels.cpp batchHitTestPlane vs testPlane). */
function expectLane(out: KernelOut, i: number, exp: FullHit, missDist = 0): void {
	const tag = `lane ${i}`
	if (exp.t < 0) {
		expect(out.t[i], `${tag} t`).toBe(-1)
		expect(out.c[i], `${tag} contact`).toBe(0)
		expect(out.nx[i], `${tag} nx`).toBe(0)
		expect(out.ny[i], `${tag} ny`).toBe(0)
		expect(out.nz[i], `${tag} nz`).toBe(0)
		expect(out.bnv[i], `${tag} bnv`).toBe(0)
		expect(out.dist[i], `${tag} dist`).toBe(missDist)
	} else {
		expect(out.t[i], `${tag} t`).toBeCloseTo(exp.t, 3)
		expect(out.c[i], `${tag} contact`).toBe(exp.contact)
		expect(out.nx[i], `${tag} nx`).toBeCloseTo(exp.nx, 3)
		expect(out.ny[i], `${tag} ny`).toBeCloseTo(exp.ny, 3)
		expect(out.nz[i], `${tag} nz`).toBeCloseTo(exp.nz, 3)
		expect(out.dist[i], `${tag} dist`).toBeCloseTo(exp.dist, 3)
		expect(out.bnv[i], `${tag} bnv`).toBeCloseTo(exp.bnv, 3)
	}
}

describe.skipIf(!hasWasmDist)('wasm kernels vs JS reference', () => {
	it('plane', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(101)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				r = 25,
				dt = 0.016
			let nx = rand(-1, 1),
				ny = rand(-1, 1),
				nz = rand(-1, 1)
			const len = Math.hypot(nx, ny, nz) || 1
			nx /= len
			ny /= len
			nz /= len
			const d = rand(-10, 10)
			const exp = refPlane(bx, by, bz, vx, vy, vz, r, nx, ny, nz, d, dt)
			const pNx = mod._malloc(4),
				pNy = mod._malloc(4),
				pNz = mod._malloc(4),
				pD = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx
			new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny
			new Float32Array(mod.HEAPF32.buffer, pNz, 1)[0] = nz
			new Float32Array(mod.HEAPF32.buffer, pD, 1)[0] = d
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestPlane(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pNx,
				pNy,
				pNz,
				pD,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pNx)
			mod._free(pNy)
			mod._free(pNz)
			mod._free(pD)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('circle', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(102)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				br = 25,
				dt = 0.016
			const cx = rand(-50, 50),
				cy = rand(-50, 50),
				cr = rand(10, 30),
				zl = rand(0, 10),
				zh = zl + rand(10, 30)
			const exp = refCircle(bx, by, bz, vx, vy, vz, br, cx, cy, cr, zl, zh, dt)
			const pCx = mod._malloc(4),
				pCy = mod._malloc(4),
				pCr = mod._malloc(4),
				pZl = mod._malloc(4),
				pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pCx, 1)[0] = cx
			new Float32Array(mod.HEAPF32.buffer, pCy, 1)[0] = cy
			new Float32Array(mod.HEAPF32.buffer, pCr, 1)[0] = cr
			new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl
			new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestCircle(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				br,
				pCx,
				pCy,
				pCr,
				pZl,
				pZh,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pCx)
			mod._free(pCy)
			mod._free(pCr)
			mod._free(pZl)
			mod._free(pZh)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('lineZ', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(103)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				br = 25,
				dt = 0.016
			const lx = rand(-50, 50),
				ly = rand(-50, 50),
				zl = rand(0, 10),
				zh = zl + rand(10, 30)
			const exp = refLineZ(bx, by, bz, vx, vy, vz, br, lx, ly, zl, zh, dt)
			const pLx = mod._malloc(4),
				pLy = mod._malloc(4),
				pZl = mod._malloc(4),
				pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pLx, 1)[0] = lx
			new Float32Array(mod.HEAPF32.buffer, pLy, 1)[0] = ly
			new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl
			new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestLineZ(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				br,
				pLx,
				pLy,
				pZl,
				pZh,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pLx)
			mod._free(pLy)
			mod._free(pZl)
			mod._free(pZh)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('point', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(104)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				r = 25,
				dt = 0.016
			const px = rand(-50, 50),
				py = rand(-50, 50),
				pz = rand(0, 30)
			const exp = refPoint(bx, by, bz, vx, vy, vz, r, px, py, pz, dt)
			const pPx = mod._malloc(4),
				pPy = mod._malloc(4),
				pPz = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pPx, 1)[0] = px
			new Float32Array(mod.HEAPF32.buffer, pPy, 1)[0] = py
			new Float32Array(mod.HEAPF32.buffer, pPz, 1)[0] = pz
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestPoint(1, bx, by, bz, vx, vy, vz, r, pPx, pPy, pPz, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pPx)
			mod._free(pPy)
			mod._free(pPz)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('triangle', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(105)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				r = 25,
				dt = 0.016
			const r0x = rand(-20, 20),
				r0y = rand(-20, 20),
				r0z = rand(0, 10),
				r1x = r0x + rand(-5, 5),
				r1y = r0y + rand(-5, 5),
				r1z = r0z + rand(-2, 2),
				r2x = r0x + rand(-5, 5),
				r2y = r0y + rand(-5, 5),
				r2z = r0z + rand(-2, 2)
			let nx = rand(-1, 1),
				ny = rand(-1, 1),
				nz = rand(-1, 1)
			const len = Math.hypot(nx, ny, nz) || 1
			nx /= len
			ny /= len
			nz /= len
			const exp = refTriangle(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				r0x,
				r0y,
				r0z,
				r1x,
				r1y,
				r1z,
				r2x,
				r2y,
				r2z,
				nx,
				ny,
				nz,
				dt,
			)
			const pR0x = mod._malloc(4),
				pR0y = mod._malloc(4),
				pR0z = mod._malloc(4),
				pR1x = mod._malloc(4),
				pR1y = mod._malloc(4),
				pR1z = mod._malloc(4),
				pR2x = mod._malloc(4),
				pR2y = mod._malloc(4),
				pR2z = mod._malloc(4),
				pNx = mod._malloc(4),
				pNy = mod._malloc(4),
				pNz = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pR0x, 1)[0] = r0x
			new Float32Array(mod.HEAPF32.buffer, pR0y, 1)[0] = r0y
			new Float32Array(mod.HEAPF32.buffer, pR0z, 1)[0] = r0z
			new Float32Array(mod.HEAPF32.buffer, pR1x, 1)[0] = r1x
			new Float32Array(mod.HEAPF32.buffer, pR1y, 1)[0] = r1y
			new Float32Array(mod.HEAPF32.buffer, pR1z, 1)[0] = r1z
			new Float32Array(mod.HEAPF32.buffer, pR2x, 1)[0] = r2x
			new Float32Array(mod.HEAPF32.buffer, pR2y, 1)[0] = r2y
			new Float32Array(mod.HEAPF32.buffer, pR2z, 1)[0] = r2z
			new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx
			new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny
			new Float32Array(mod.HEAPF32.buffer, pNz, 1)[0] = nz
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestTriangle(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pR0x,
				pR0y,
				pR0z,
				pR1x,
				pR1y,
				pR1z,
				pR2x,
				pR2y,
				pR2z,
				pNx,
				pNy,
				pNz,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pR0x)
			mod._free(pR0y)
			mod._free(pR0z)
			mod._free(pR1x)
			mod._free(pR1y)
			mod._free(pR1z)
			mod._free(pR2x)
			mod._free(pR2y)
			mod._free(pR2z)
			mod._free(pNx)
			mod._free(pNy)
			mod._free(pNz)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('lineSeg', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(106)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				r = 25,
				dt = 0.016
			const v1x = rand(-50, 50),
				v1y = rand(-50, 50),
				v2x = v1x + rand(-10, 10),
				v2y = v1y + rand(-10, 10)
			let nx = -(v2y - v1y),
				ny = v2x - v1x
			const l = Math.hypot(nx, ny) || 1
			nx /= l
			ny /= l
			const len = Math.hypot(v2x - v1x, v2y - v1y)
			const zl = rand(0, 10),
				zh = zl + rand(10, 30)
			const exp = refLineSeg(bx, by, bz, vx, vy, vz, r, v1x, v1y, v2x, v2y, nx, ny, len, zl, zh, dt)
			const pV1x = mod._malloc(4),
				pV1y = mod._malloc(4),
				pV2x = mod._malloc(4),
				pV2y = mod._malloc(4),
				pNx = mod._malloc(4),
				pNy = mod._malloc(4),
				pLen = mod._malloc(4),
				pZl = mod._malloc(4),
				pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pV1x, 1)[0] = v1x
			new Float32Array(mod.HEAPF32.buffer, pV1y, 1)[0] = v1y
			new Float32Array(mod.HEAPF32.buffer, pV2x, 1)[0] = v2x
			new Float32Array(mod.HEAPF32.buffer, pV2y, 1)[0] = v2y
			new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx
			new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny
			new Float32Array(mod.HEAPF32.buffer, pLen, 1)[0] = len
			new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl
			new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestLineSeg(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pV1x,
				pV1y,
				pV2x,
				pV2y,
				pNx,
				pNy,
				pLen,
				pZl,
				pZh,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pV1x)
			mod._free(pV1y)
			mod._free(pV2x)
			mod._free(pV2y)
			mod._free(pNx)
			mod._free(pNy)
			mod._free(pLen)
			mod._free(pZl)
			mod._free(pZh)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('line3D', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const rng = mulberry32(107)
		const rand = (a: number, b: number) => rng() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50),
				by = rand(-50, 50),
				bz = rand(0, 30),
				vx = rand(-20, 20),
				vy = rand(-20, 20),
				vz = rand(-10, 10),
				r = 25,
				dt = 0.016
			const lx = rand(-10, 10),
				ly = rand(-10, 10),
				zl = rand(0, 10),
				zh = zl + rand(10, 30)
			let ax = rand(-1, 1),
				ay = rand(-1, 1),
				az = rand(-1, 1)
			const al = Math.hypot(ax, ay, az) || 1
			ax /= al
			ay /= al
			az /= al
			const ang = rand(0, Math.PI * 2),
				c = Math.cos(ang),
				s = Math.sin(ang),
				oc = 1 - c
			const m00 = ax * ax + c * (1 - ax * ax),
				m01 = ax * ay * oc - az * s,
				m02 = az * ax * oc + ay * s
			const m10 = ax * ay * oc + az * s,
				m11 = ay * ay + c * (1 - ay * ay),
				m12 = ay * az * oc - ax * s
			const m20 = az * ax * oc - ay * s,
				m21 = ay * az * oc + ax * s,
				m22 = az * az + c * (1 - az * az)
			const exp = refLine3D(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				lx,
				ly,
				zl,
				zh,
				m00,
				m01,
				m02,
				m10,
				m11,
				m12,
				m20,
				m21,
				m22,
				dt,
			)
			const pLx = mod._malloc(4),
				pLy = mod._malloc(4),
				pZl = mod._malloc(4),
				pZh = mod._malloc(4),
				pM00 = mod._malloc(4),
				pM01 = mod._malloc(4),
				pM02 = mod._malloc(4),
				pM10 = mod._malloc(4),
				pM11 = mod._malloc(4),
				pM12 = mod._malloc(4),
				pM20 = mod._malloc(4),
				pM21 = mod._malloc(4),
				pM22 = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pLx, 1)[0] = lx
			new Float32Array(mod.HEAPF32.buffer, pLy, 1)[0] = ly
			new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl
			new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			new Float32Array(mod.HEAPF32.buffer, pM00, 1)[0] = m00
			new Float32Array(mod.HEAPF32.buffer, pM01, 1)[0] = m01
			new Float32Array(mod.HEAPF32.buffer, pM02, 1)[0] = m02
			new Float32Array(mod.HEAPF32.buffer, pM10, 1)[0] = m10
			new Float32Array(mod.HEAPF32.buffer, pM11, 1)[0] = m11
			new Float32Array(mod.HEAPF32.buffer, pM12, 1)[0] = m12
			new Float32Array(mod.HEAPF32.buffer, pM20, 1)[0] = m20
			new Float32Array(mod.HEAPF32.buffer, pM21, 1)[0] = m21
			new Float32Array(mod.HEAPF32.buffer, pM22, 1)[0] = m22
			const oT = mod._malloc(4),
				oC = mod._malloc(4),
				oNx = mod._malloc(4),
				oNy = mod._malloc(4),
				oNz = mod._malloc(4),
				oDist = mod._malloc(4),
				oBnv = mod._malloc(4)
			mod._batchHitTestLine3D(
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pLx,
				pLy,
				pZl,
				pZh,
				pM00,
				pM01,
				pM02,
				pM10,
				pM11,
				pM12,
				pM20,
				pM21,
				pM22,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pLx)
			mod._free(pLy)
			mod._free(pZl)
			mod._free(pZh)
			mod._free(pM00)
			mod._free(pM01)
			mod._free(pM02)
			mod._free(pM10)
			mod._free(pM11)
			mod._free(pM12)
			mod._free(pM20)
			mod._free(pM21)
			mod._free(pM22)
			mod._free(oT)
			mod._free(oC)
			mod._free(oNx)
			mod._free(oNy)
			mod._free(oNz)
			mod._free(oDist)
			mod._free(oBnv)
		}
	})

	it('elasticity', async () => {
		const { default: create } = await import('../../../wasm/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/dist/${p}` })
		const n = 16,
			pE = mod._malloc(n * 4),
			pF = mod._malloc(n * 4),
			pV = mod._malloc(n * 4),
			pO = mod._malloc(n * 4)
		const aE = new Float32Array(mod.HEAPF32.buffer, pE, n),
			aF = new Float32Array(mod.HEAPF32.buffer, pF, n),
			aV = new Float32Array(mod.HEAPF32.buffer, pV, n),
			aO = new Float32Array(mod.HEAPF32.buffer, pO, n)
		const erng = mulberry32(108)
		for (let i = 0; i < n; i++) {
			aE[i] = erng()
			aF[i] = erng() * 2 - 0.5
			aV[i] = erng() * 100 - 50
		}
		const exp = new Float32Array(n)
		for (let i = 0; i < n; i++) exp[i] = aF[i] > 0 ? aE[i] / (1 + aF[i] * Math.abs(aV[i]) * (1 / 18.53)) : aE[i]
		mod._batchElasticityWithFalloff(n, pE, pF, pV, pO)
		for (let i = 0; i < n; i++) expect(aO[i]).toBeCloseTo(exp[i], 5)
		mod._free(pE)
		mod._free(pF)
		mod._free(pV)
		mod._free(pO)
	})
})

describe.skipIf(!hasWasmDist)('wasm kernels: n=9 full-struct batches (SIMD lanes + scalar tail)', () => {
	it('plane: full structs, 2 SIMD iterations + 1 tail lane', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 0,
			by = 0,
			bz = 100,
			vx = 0,
			vy = 0,
			vz = -50,
			r = 25,
			dt = 1
		// Fixed edge lanes: clean hit, contact, separating, excessive-embed reject,
		// slow deep embed (FIX_PHYSICS collides at t=0 instead of tunneling).
		const NX = [0, 1, 0, 0, 1]
		const NY = [0, 0, 0, 0, 0]
		const NZ = [1, 0, -1, 1, 0]
		const DD = [60, -25.02, 0, 200, -20]
		const rng = mulberry32(201)
		for (let i = 5; i < n; i++) {
			let x = seededRange(rng, -1, 1),
				y = seededRange(rng, -1, 1),
				z = seededRange(rng, -1, 1)
			const l = Math.hypot(x, y, z) || 1
			x /= l
			y /= l
			z /= l
			NX.push(x)
			NY.push(y)
			NZ.push(z)
			DD.push(x * bx + y * by + z * bz - r - seededRange(rng, -60, 5))
		}
		const pNx = mallocF32(mod, NX)
		const pNy = mallocF32(mod, NY)
		const pNz = mallocF32(mod, NZ)
		const pD = mallocF32(mod, DD)
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestPlane',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			pNx,
			pNy,
			pNz,
			pD,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullPlane(bx, by, bz, vx, vy, vz, r, NX[i] ?? 0, NY[i] ?? 0, NZ[i] ?? 0, DD[i] ?? 0, dt)
			expectLane(out, i, exp, i < 8 ? -1 : 0)
		}
		expect(out.t[0]).toBeCloseTo(0.3, 3)
		expect(out.t[1]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		// Slow ball 5 deep in the plane: FIX_PHYSICS collision at t=0.
		expect(out.t[4]).toBe(0)
		expect(out.c[4]).toBe(0)
		for (const p of [pNx, pNy, pNz, pD, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('plane SIMD-lane miss dist diverges from the scalar tail (known mismatch)', async () => {
		// kernels.cpp bitselects oDist=bnd/-1 on hit/miss in the SIMD loop but the
		// scalar testPlane leaves dist=0 on miss. TODO: unify after a kernel fix;
		// the replay path ignores dist on misses so this is benign downstream.
		const mod = await getKernelMod()
		const n = 9
		const pNx = mallocF32(mod, new Array(n).fill(0))
		const pNy = mallocF32(mod, new Array(n).fill(0))
		const pNz = mallocF32(mod, new Array(n).fill(1))
		const pD = mallocF32(mod, new Array(n).fill(0))
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestPlane',
			n,
			0,
			0,
			100,
			0,
			0,
			0,
			25,
			pNx,
			pNy,
			pNz,
			pD,
			0.016,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const dist = readF32(mod, oDist, n)
		for (let i = 0; i < 8; i++) expect(dist[i]).toBe(-1)
		expect(dist[8]).toBe(0)
		for (const p of [pNx, pNy, pNz, pD, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('circle: full structs incl. contact flag, normals, dist, bnv', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = 0,
			br = 25,
			dt = 1
		// Fixed edge lanes: clean hit, contact, exact-center, height reject, separating.
		const CX = [0, 60, 60, 0, 200]
		const CY = [0, 35.02, 0, 0, 0]
		const CR = [10, 10, 10, 10, 10]
		const ZL = [0, 0, 0, 200, 0]
		const ZH = [100, 100, 100, 300, 100]
		const rng = mulberry32(202)
		for (let i = 5; i < n; i++) {
			CX.push(seededRange(rng, -50, 50))
			CY.push(seededRange(rng, -50, 50))
			CR.push(seededRange(rng, 5, 30))
			const zl = seededRange(rng, 0, 20)
			ZL.push(zl)
			ZH.push(zl + seededRange(rng, 20, 60))
		}
		const pCx = mallocF32(mod, CX)
		const pCy = mallocF32(mod, CY)
		const pCr = mallocF32(mod, CR)
		const pZl = mallocF32(mod, ZL)
		const pZh = mallocF32(mod, ZH)
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestCircle',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			br,
			pCx,
			pCy,
			pCr,
			pZl,
			pZh,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullCircle(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				br,
				CX[i] ?? 0,
				CY[i] ?? 0,
				CR[i] ?? 0,
				ZL[i] ?? 0,
				ZH[i] ?? 0,
				dt,
			)
			expectLane(out, i, exp)
		}
		expect(out.t[0]).toBeCloseTo(0.625, 3)
		expect(out.t[1]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		expect(out.t[4]).toBe(-1)
		for (const p of [pCx, pCy, pCr, pZl, pZh, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('lineZ: full structs incl. contact flag and hit-position normals', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = 0,
			br = 25,
			dt = 1
		// Fixed edge lanes: clean hit, contact, exact-center, height reject, separating.
		const LX = [0, 60, 60, 0, 200]
		const LY = [0, 25.02, 0, 0, 0]
		const ZL = [0, 0, 0, 200, 0]
		const ZH = [100, 100, 100, 300, 100]
		const rng = mulberry32(203)
		for (let i = 5; i < n; i++) {
			LX.push(seededRange(rng, -50, 50))
			LY.push(seededRange(rng, -50, 50))
			const zl = seededRange(rng, 0, 20)
			ZL.push(zl)
			ZH.push(zl + seededRange(rng, 20, 60))
		}
		const pLx = mallocF32(mod, LX)
		const pLy = mallocF32(mod, LY)
		const pZl = mallocF32(mod, ZL)
		const pZh = mallocF32(mod, ZH)
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestLineZ',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			br,
			pLx,
			pLy,
			pZl,
			pZh,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullLineZ(bx, by, bz, vx, vy, vz, br, LX[i] ?? 0, LY[i] ?? 0, ZL[i] ?? 0, ZH[i] ?? 0, dt)
			expectLane(out, i, exp)
		}
		expect(out.t[1]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		expect(out.t[4]).toBe(-1)
		for (const p of [pLx, pLy, pZl, pZh, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('point: full structs incl. 3D hit-position normals', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = -10,
			r = 25,
			dt = 1
		// Fixed edge lanes: clean hit, contact, exact-center, separating.
		const PX = [0, 60, 60, 200]
		const PY = [0, 25.02, 0, 0]
		const PZ = [50, 50, 50, 50]
		const rng = mulberry32(204)
		for (let i = 4; i < n; i++) {
			PX.push(seededRange(rng, -50, 50))
			PY.push(seededRange(rng, -50, 50))
			PZ.push(seededRange(rng, 0, 100))
		}
		const pPx = mallocF32(mod, PX)
		const pPy = mallocF32(mod, PY)
		const pPz = mallocF32(mod, PZ)
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestPoint',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			pPx,
			pPy,
			pPz,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullPoint(bx, by, bz, vx, vy, vz, r, PX[i] ?? 0, PY[i] ?? 0, PZ[i] ?? 0, dt)
			expectLane(out, i, exp)
		}
		expect(out.t[1]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		for (const p of [pPx, pPy, pPz, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('triangle: full structs incl. barycentric accept/reject and back-face', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 40,
			by = 40,
			bz = 100,
			vx = 0,
			vy = 0,
			vz = -50,
			r = 25,
			dt = 2
		// Fixed edge lanes: inside hit, barycentric-outside, back-face, contact.
		const R0X = [0, 500, 0, 15]
		const R0Y = [0, 500, 0, -100]
		const R0Z = [0, 0, 0, -100]
		const R1X = [100, 600, 100, 15]
		const R1Y = [0, 500, 0, 300]
		const R1Z = [0, 0, 0, -100]
		const R2X = [0, 500, 0, 15]
		const R2Y = [100, 600, 100, -100]
		const R2Z = [0, 0, 0, 300]
		const NX = [0, 0, 0, 1]
		const NY = [0, 0, 0, 0]
		const NZ = [1, 1, -1, 0]
		const rng = mulberry32(205)
		for (let i = 4; i < n; i++) {
			const r0x = seededRange(rng, 20, 60),
				r0y = seededRange(rng, 20, 60),
				r0z = seededRange(rng, 0, 80)
			R0X.push(r0x)
			R0Y.push(r0y)
			R0Z.push(r0z)
			R1X.push(r0x + seededRange(rng, 5, 10))
			R1Y.push(r0y)
			R1Z.push(r0z + seededRange(rng, -2, 2))
			R2X.push(r0x)
			R2Y.push(r0y + seededRange(rng, 5, 10))
			R2Z.push(r0z + seededRange(rng, -2, 2))
			const x = seededRange(rng, -1, 1),
				y = seededRange(rng, -1, 1),
				z = seededRange(rng, -1, 1)
			const l = Math.hypot(x, y, z) || 1
			NX.push(x / l)
			NY.push(y / l)
			NZ.push(z / l)
		}
		const ins = [R0X, R0Y, R0Z, R1X, R1Y, R1Z, R2X, R2Y, R2Z, NX, NY, NZ].map(a => mallocF32(mod, a))
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestTriangle',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			...ins,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullTriangle(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				R0X[i] ?? 0,
				R0Y[i] ?? 0,
				R0Z[i] ?? 0,
				R1X[i] ?? 0,
				R1Y[i] ?? 0,
				R1Z[i] ?? 0,
				R2X[i] ?? 0,
				R2Y[i] ?? 0,
				R2Z[i] ?? 0,
				NX[i] ?? 0,
				NY[i] ?? 0,
				NZ[i] ?? 0,
				dt,
			)
			expectLane(out, i, exp)
		}
		expect(out.t[0]).toBeCloseTo(1.5, 3)
		expect(out.t[1]).toBe(-1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(0)
		expect(out.c[3]).toBe(1)
		for (const p of [...ins, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('lineSeg: full structs incl. touch-band contact, behind, beyond-length', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 50,
			by = 60,
			bz = 25,
			vx = 0,
			vy = -40,
			vz = 0,
			r = 25,
			dt = 1
		// Fixed edge lanes: clean hit, touch-band contact, behind, beyond-length.
		const V1X = [0, 24.98, 0, 0]
		const V1Y = [0, 100, 0, 0]
		const V2X = [100, 24.98, 100, 10]
		const V2Y = [0, 0, 0, 0]
		const NX = [0, 1, 0, 0]
		const NY = [1, 0, -1, 1]
		const LEN = [100, 100, 100, 10]
		const ZL = [0, 0, 0, 0]
		const ZH = [50, 50, 50, 50]
		const rng = mulberry32(206)
		for (let i = 4; i < n; i++) {
			const v1x = seededRange(rng, -20, 120),
				v1y = seededRange(rng, -20, 120)
			const v2x = v1x + seededRange(rng, -30, 30),
				v2y = v1y + seededRange(rng, -30, 30)
			let nx = -(v2y - v1y),
				ny = v2x - v1x
			const l = Math.hypot(nx, ny) || 1
			nx /= l
			ny /= l
			V1X.push(v1x)
			V1Y.push(v1y)
			V2X.push(v2x)
			V2Y.push(v2y)
			NX.push(nx)
			NY.push(ny)
			LEN.push(Math.hypot(v2x - v1x, v2y - v1y))
			ZL.push(0)
			ZH.push(50)
		}
		const ins = [V1X, V1Y, V2X, V2Y, NX, NY, LEN, ZL, ZH].map(a => mallocF32(mod, a))
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestLineSeg',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			...ins,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullLineSeg(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				V1X[i] ?? 0,
				V1Y[i] ?? 0,
				NX[i] ?? 0,
				NY[i] ?? 0,
				LEN[i] ?? 0,
				ZL[i] ?? 0,
				ZH[i] ?? 0,
				dt,
			)
			expectLane(out, i, exp)
		}
		expect(out.t[0]).toBeCloseTo(0.875, 3)
		// FIX_PHYSICS touch-band contact at time 0 (matches kernels.cpp).
		expect(out.t[1]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		for (const p of [...ins, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('line3D: full structs incl. rotated-frame normals', async () => {
		const mod = await getKernelMod()
		const n = 9
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = 0,
			r = 25,
			dt = 1
		// Fixed edge lanes: identity hit, 90-degree-z hit, exact-center, height reject.
		const LX = [0, 0, 60, 0]
		const LY = [0, 0, 0, 0]
		const ZL = [0, 0, 0, 200]
		const ZH = [100, 100, 100, 300]
		const M00 = [1, 0, 1, 1]
		const M01 = [0, -1, 0, 0]
		const M02 = [0, 0, 0, 0]
		const M10 = [0, 1, 0, 0]
		const M11 = [1, 0, 1, 1]
		const M12 = [0, 0, 0, 0]
		const M20 = [0, 0, 0, 0]
		const M21 = [0, 0, 0, 0]
		const M22 = [1, 1, 1, 1]
		const rng = mulberry32(207)
		for (let i = 4; i < n; i++) {
			LX.push(seededRange(rng, -10, 10))
			LY.push(seededRange(rng, -10, 10))
			const zl = seededRange(rng, 0, 10)
			ZL.push(zl)
			ZH.push(zl + seededRange(rng, 10, 30))
			let ax = seededRange(rng, -1, 1),
				ay = seededRange(rng, -1, 1),
				az = seededRange(rng, -1, 1)
			const al = Math.hypot(ax, ay, az) || 1
			ax /= al
			ay /= al
			az /= al
			const ang = seededRange(rng, 0, Math.PI * 2)
			const c = Math.cos(ang),
				s = Math.sin(ang),
				oc = 1 - c
			M00.push(ax * ax + c * (1 - ax * ax))
			M01.push(ax * ay * oc - az * s)
			M02.push(az * ax * oc + ay * s)
			M10.push(ax * ay * oc + az * s)
			M11.push(ay * ay + c * (1 - ay * ay))
			M12.push(ay * az * oc - ax * s)
			M20.push(az * ax * oc - ay * s)
			M21.push(ay * az * oc + ax * s)
			M22.push(az * az + c * (1 - az * az))
		}
		const ins = [LX, LY, ZL, ZH, M00, M01, M02, M10, M11, M12, M20, M21, M22].map(a => mallocF32(mod, a))
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestLine3D',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			...ins,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const exp = refFullLine3D(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				LX[i] ?? 0,
				LY[i] ?? 0,
				ZL[i] ?? 0,
				ZH[i] ?? 0,
				M00[i] ?? 0,
				M01[i] ?? 0,
				M02[i] ?? 0,
				M10[i] ?? 0,
				M11[i] ?? 0,
				M12[i] ?? 0,
				M20[i] ?? 0,
				M21[i] ?? 0,
				M22[i] ?? 0,
				dt,
			)
			expectLane(out, i, exp)
		}
		expect(out.t[0]).toBeCloseTo(0.875, 3)
		expect(out.t[2]).toBe(-1)
		expect(out.t[3]).toBe(-1)
		for (const p of [...ins, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})

	it('line3D with identity matrix matches the lineZ kernel bit-for-bit', async () => {
		const mod = await getKernelMod()
		const n = 3
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = 0,
			r = 25,
			dt = 1
		const LX = [0, 60, 200],
			LY = [0, 25.02, 0],
			ZL = [0, 0, 0],
			ZH = [100, 100, 100]
		const I1 = [1, 1, 1],
			I0 = [0, 0, 0]
		const outs: KernelOut[] = []
		for (const fn of ['_batchHitTestLineZ', '_batchHitTestLine3D']) {
			const pLx = mallocF32(mod, LX)
			const pLy = mallocF32(mod, LY)
			const pZl = mallocF32(mod, ZL)
			const pZh = mallocF32(mod, ZH)
			const extra =
				fn === '_batchHitTestLine3D' ? [I1, I0, I0, I0, I1, I0, I0, I0, I1].map(a => mallocF32(mod, a)) : []
			const oT = mod._malloc(n * 4)
			const oC = mod._malloc(n * 4)
			const oNx = mod._malloc(n * 4)
			const oNy = mod._malloc(n * 4)
			const oNz = mod._malloc(n * 4)
			const oDist = mod._malloc(n * 4)
			const oBnv = mod._malloc(n * 4)
			callBatch(
				mod,
				fn,
				n,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pLx,
				pLy,
				pZl,
				pZh,
				...extra,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			outs.push({
				t: readF32(mod, oT, n),
				c: readI32(mod, oC, n),
				nx: readF32(mod, oNx, n),
				ny: readF32(mod, oNy, n),
				nz: readF32(mod, oNz, n),
				dist: readF32(mod, oDist, n),
				bnv: readF32(mod, oBnv, n),
			})
			for (const p of [pLx, pLy, pZl, pZh, ...extra, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
		}
		const lineZ = outs[0] as KernelOut,
			line3D = outs[1] as KernelOut
		for (let i = 0; i < n; i++) {
			expect(line3D.t[i]).toBe(lineZ.t[i])
			expect(line3D.c[i]).toBe(lineZ.c[i])
			expect(line3D.nx[i]).toBe(lineZ.nx[i])
			expect(line3D.ny[i]).toBe(lineZ.ny[i])
			expect(line3D.nz[i]).toBe(lineZ.nz[i])
			expect(line3D.dist[i]).toBe(lineZ.dist[i])
			expect(line3D.bnv[i]).toBe(lineZ.bnv[i])
		}
	})

	it('elasticity n=9: SIMD lanes + scalar tail', async () => {
		const mod = await getKernelMod()
		const n = 9
		const rng = mulberry32(209)
		const E = [0.5, 0.3, 0.8]
		const F = [0, -0.5, 1.2]
		const V = [10, -20, 30]
		for (let i = 3; i < n; i++) {
			E.push(rng())
			F.push(rng() * 2 - 0.5)
			V.push(rng() * 100 - 50)
		}
		const pE = mallocF32(mod, E)
		const pF = mallocF32(mod, F)
		const pV = mallocF32(mod, V)
		const pO = mod._malloc(n * 4)
		callBatch(mod, '_batchElasticityWithFalloff', n, pE, pF, pV, pO)
		const o = readF32(mod, pO, n)
		const fE = E.map(Math.fround),
			fF = F.map(Math.fround),
			fV = V.map(Math.fround)
		for (let i = 0; i < n; i++) {
			const e = fE[i] ?? 0,
				f = fF[i] ?? 0,
				v = fV[i] ?? 0
			const exp = f > 0 ? e / (1 + f * Math.abs(v) * (1 / 18.53)) : e
			expect(o[i]).toBeCloseTo(exp, 5)
		}
		expect(o[0]).toBeCloseTo(0.5, 5)
		expect(o[1]).toBeCloseTo(0.3, 5)
		for (const p of [pE, pF, pV, pO]) mod._free(p)
	})
})

describe.skipIf(!hasWasmDist)('wasm kernels: batchHitTestPoly', () => {
	type PolyCase = {
		nx: number
		ny: number
		nz: number
		r0x: number
		r0y: number
		r0z: number
		nv: number
		vx: number[]
		vy: number[]
	}
	function runPoly(
		mod: KernelMod,
		bx: number,
		by: number,
		bz: number,
		vx: number,
		vy: number,
		vz: number,
		r: number,
		dt: number,
		cases: PolyCase[],
	): KernelOut {
		const n = cases.length
		const fr = (v: number): number => Math.fround(v)
		const NX = cases.map(c => fr(c.nx))
		const NY = cases.map(c => fr(c.ny))
		const NZ = cases.map(c => fr(c.nz))
		const R0X = cases.map(c => fr(c.r0x))
		const R0Y = cases.map(c => fr(c.r0y))
		const R0Z = cases.map(c => fr(c.r0z))
		const NV = cases.map(c => c.nv)
		const VX = new Array(n * POLY_MAX_VERTS).fill(0)
		const VY = new Array(n * POLY_MAX_VERTS).fill(0)
		cases.forEach((c, i) => {
			c.vx.forEach((x, j) => {
				VX[i * POLY_MAX_VERTS + j] = fr(x)
				VY[i * POLY_MAX_VERTS + j] = fr(c.vy[j] ?? 0)
			})
		})
		const pNx = mallocF32(mod, NX)
		const pNy = mallocF32(mod, NY)
		const pNz = mallocF32(mod, NZ)
		const pR0x = mallocF32(mod, R0X)
		const pR0y = mallocF32(mod, R0Y)
		const pR0z = mallocF32(mod, R0Z)
		const pNv = mallocI32(mod, NV)
		const pVX = mallocF32(mod, VX)
		const pVY = mallocF32(mod, VY)
		const oT = mod._malloc(n * 4)
		const oC = mod._malloc(n * 4)
		const oNx = mod._malloc(n * 4)
		const oNy = mod._malloc(n * 4)
		const oNz = mod._malloc(n * 4)
		const oDist = mod._malloc(n * 4)
		const oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestPoly',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			pNx,
			pNy,
			pNz,
			pR0x,
			pR0y,
			pR0z,
			pNv,
			pVX,
			pVY,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			const laneVX = VX.slice(i * POLY_MAX_VERTS, (i + 1) * POLY_MAX_VERTS)
			const laneVY = VY.slice(i * POLY_MAX_VERTS, (i + 1) * POLY_MAX_VERTS)
			const exp = refFullPoly(
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				NX[i] ?? 0,
				NY[i] ?? 0,
				NZ[i] ?? 0,
				R0X[i] ?? 0,
				R0Y[i] ?? 0,
				R0Z[i] ?? 0,
				NV[i] ?? 0,
				laneVX,
				laneVY,
				dt,
			)
			expectLane(out, i, exp)
		}
		for (const p of [pNx, pNy, pNz, pR0x, pR0y, pR0z, pNv, pVX, pVY, oT, oC, oNx, oNy, oNz, oDist, oBnv])
			mod._free(p)
		return out
	}

	it('crossing, touch band, back-face, edge counts, and the 32-vert boundary', async () => {
		const mod = await getKernelMod()
		const quadX = [0, 0, 100, 100],
			quadY = [0, 100, 100, 0]
		const gon32x = Array.from({ length: 32 }, (_, i) => 50 + 40 * Math.cos((i / 32) * 2 * Math.PI))
		const gon32y = Array.from({ length: 32 }, (_, i) => 50 + 40 * Math.sin((i / 32) * 2 * Math.PI))
		// Lanes: inside hit, outside miss, embedded touch (t=0), fast touch (t=0),
		// back-face, numVerts=2, numVerts=33, 32-gon boundary hit, triangle hit.
		const cases: PolyCase[] = [
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 0, nv: 4, vx: quadX, vy: quadY },
			{
				nx: 0,
				ny: 0,
				nz: 1,
				r0x: 0,
				r0y: 0,
				r0z: 0,
				nv: 4,
				vx: quadX.map(x => x + 500),
				vy: quadY.map(y => y + 500),
			},
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 75, nv: 4, vx: quadX, vy: quadY },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 74.98, nv: 4, vx: quadX, vy: quadY },
			{ nx: 0, ny: 0, nz: -1, r0x: 0, r0y: 0, r0z: 0, nv: 4, vx: quadX, vy: quadY },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 0, nv: 2, vx: [0, 0], vy: [0, 100] },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 0, nv: 33, vx: quadX, vy: quadY },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 0, nv: 32, vx: gon32x, vy: gon32y },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 0, nv: 3, vx: [0, 100, 50], vy: [0, 0, 100] },
		]
		const out = runPoly(mod, 50, 50, 100, 0, 0, -50, 25, 2, cases)
		expect(out.t[0]).toBeCloseTo(1.5, 3)
		expect(out.t[1]).toBe(-1)
		expect(out.t[2]).toBe(0)
		// Fast ball 0.02 above the plane: FIX_PHYSICS reports the real
		// approach time (0.02/50), not an immediate hit.
		expect(out.t[3]).toBeCloseTo(0.0004, 4)
		expect(out.t[4]).toBe(-1)
		expect(out.t[5]).toBe(-1)
		expect(out.t[6]).toBe(-1)
		expect(out.t[7]).toBeCloseTo(1.5, 3)
		expect(out.t[8]).toBeCloseTo(1.5, 3)
		// Fast ball (|bnv| > C_CONTACTVEL everywhere): no contacts.
		for (let i = 0; i < cases.length; i++) expect(out.c[i]).toBe(0)
	})

	it('crossing fuzz over seeded convex polys (differential)', async () => {
		const mod = await getKernelMod()
		const rng = mulberry32(208)
		const cases: PolyCase[] = []
		for (let i = 0; i < 9; i++) {
			const nv = 3 + Math.floor(rng() * 4)
			const cx = seededRange(rng, 20, 80),
				cy = seededRange(rng, 20, 80)
			const rad = seededRange(rng, 10, 40),
				z0 = seededRange(rng, -10, 60)
			const vx: number[] = [],
				vy: number[] = []
			for (let j = 0; j < nv; j++) {
				const a = (j / nv) * 2 * Math.PI
				vx.push(cx + rad * Math.cos(a))
				vy.push(cy + rad * Math.sin(a))
			}
			cases.push({ nx: 0, ny: 0, nz: i === 4 ? -1 : 1, r0x: vx[0] ?? 0, r0y: vy[0] ?? 0, r0z: z0, nv, vx, vy })
		}
		const out = runPoly(mod, 50, 50, 100, 0, 0, -50, 25, 2, cases)
		expect(out.t[4]).toBe(-1)
	})

	it('slow touch-band ball reports a contact at time 0 (FIX_PHYSICS, differential)', async () => {
		const mod = await getKernelMod()
		const quadX = [0, 0, 100, 100],
			quadY = [0, 100, 100, 0]
		const cases: PolyCase[] = [
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 25, nv: 4, vx: quadX, vy: quadY },
			{ nx: 0, ny: 0, nz: 1, r0x: 0, r0y: 0, r0z: 25.02, nv: 4, vx: quadX, vy: quadY },
		]
		// Ball resting 0.02 above the quad with zero normal velocity.
		const out = runPoly(mod, 50, 50, 50.02, 0, 0, 0, 25, 2, cases)
		expect(out.t[0]).toBe(0)
		expect(out.t[1]).toBe(0)
		expect(out.c[0]).toBe(1)
		expect(out.c[1]).toBe(1)
		expect(out.bnv[0]).toBeCloseTo(0, 5)
		expect(out.bnv[1]).toBeCloseTo(0, 5)
	})
})

/**
 * Kernel-vs-TS-class differential: the WASM narrowphase must agree with the
 * scalar hit classes it replaces on the batched path (time, contact flag,
 * normal, distance, contact velocity). The kernel-vs-JS-reference suites above
 * cannot catch a stale port — both sides would encode the same legacy
 * formula — so these tests run the real `LineSeg`/`Hit3DPoly`/`HitPlane`
 * classes as the oracle. Explicit cases avoid exact-threshold constants
 * (0.05/0.099/±) where f32-vs-f64 rounding could flip a branch.
 */
describe.skipIf(!hasWasmDist)('wasm kernels vs TS hit classes (FIX_PHYSICS parity)', () => {
	type LaneOut = { t: number; c: number; nx: number; ny: number; nz: number; dist: number; bnv: number }
	function laneOf(out: KernelOut, i: number): LaneOut {
		return {
			t: out.t[i] ?? -1,
			c: out.c[i] ?? 0,
			nx: out.nx[i] ?? 0,
			ny: out.ny[i] ?? 0,
			nz: out.nz[i] ?? 0,
			dist: out.dist[i] ?? 0,
			bnv: out.bnv[i] ?? 0,
		}
	}
	function classBall(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number): Ball {
		return {
			state: { pos: new Vertex3D(bx, by, bz), isFrozen: false },
			hit: { vel: new Vertex3D(vx, vy, vz) },
			data: { radius: r },
		} as unknown as Ball
	}
	function expectLaneMatchesClass(lane: LaneOut, t: number, coll: CollisionEvent, tag: string): void {
		if (t < 0) {
			expect(lane.t, `${tag} t`).toBe(-1)
			expect(lane.c, `${tag} contact`).toBe(0)
		} else {
			expect(lane.t, `${tag} t`).toBeCloseTo(t, 4)
			expect(lane.c, `${tag} contact`).toBe(coll.isContact ? 1 : 0)
			expect(lane.nx, `${tag} nx`).toBeCloseTo(coll.hitNormal.x, 4)
			expect(lane.ny, `${tag} ny`).toBeCloseTo(coll.hitNormal.y, 4)
			expect(lane.nz, `${tag} nz`).toBeCloseTo(coll.hitNormal.z, 4)
			expect(lane.dist, `${tag} dist`).toBeCloseTo(coll.hitDistance, 3)
			expect(lane.bnv, `${tag} bnv`).toBeCloseTo(coll.hitOrgNormalVelocity, 4)
		}
	}
	/** Single-lane kernel call; frees all buffers before returning. */
	function runLane(mod: KernelMod, fn: string, ball: number[], ins: number[][], dt: number): LaneOut {
		const ptrs = ins.map(a => mallocF32(mod, a))
		const oT = mod._malloc(4),
			oC = mod._malloc(4),
			oNx = mod._malloc(4),
			oNy = mod._malloc(4),
			oNz = mod._malloc(4),
			oDist = mod._malloc(4),
			oBnv = mod._malloc(4)
		callBatch(mod, fn, 1, ...ball, ...ptrs, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
		const lane: LaneOut = {
			t: readF32(mod, oT, 1)[0] ?? -1,
			c: readI32(mod, oC, 1)[0] ?? 0,
			nx: readF32(mod, oNx, 1)[0] ?? 0,
			ny: readF32(mod, oNy, 1)[0] ?? 0,
			nz: readF32(mod, oNz, 1)[0] ?? 0,
			dist: readF32(mod, oDist, 1)[0] ?? 0,
			bnv: readF32(mod, oBnv, 1)[0] ?? 0,
		}
		for (const p of [...ptrs, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
		return lane
	}
	/** Explicit (bnd, bnv) sweep: touch-band contacts, fast in-band approach,
	 * shallow/deep embeds, far approach, slow-far miss, receding miss. */
	const BAND_CASES: Array<[number, number]> = [
		[0.02, -0.01],
		[0.02, 0.05],
		[0.02, -5],
		[0.049, -0.098],
		[0.051, -0.098],
		[-0.02, -0.01],
		[-0.049, -0.098],
		[-0.051, -0.098],
		[-0.06, -0.01],
		[-5, -0.01],
		[-5, -5],
		[2, -5],
		[2, -0.05],
		[2, 5],
		[0.06, -0.09],
	]

	it('LineSeg kernel matches LineSeg.hitTest', async () => {
		const mod = await getKernelMod()
		const seg = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
		const r = 25,
			dt = 1
		const segIns = () => [
			[seg.v1.x],
			[seg.v1.y],
			[seg.v2.x],
			[seg.v2.y],
			[seg.normal.x],
			[seg.normal.y],
			[seg.length],
			[seg.hitBBox.zlow],
			[seg.hitBBox.zhigh],
		]
		const check = (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, tag: string) => {
			const ball = classBall(bx, by, bz, vx, vy, vz, r)
			const coll = new CollisionEvent(ball)
			const t = seg.hitTest(ball, dt, coll)
			const lane = runLane(mod, '_batchHitTestLineSeg', [bx, by, bz, vx, vy, vz, r], segIns(), dt)
			expectLaneMatchesClass(lane, t, coll, tag)
		}
		for (const [bnd, bnv] of BAND_CASES) check(50, r + bnd, 25, 1.5, bnv, 0.5, `bnd=${bnd} bnv=${bnv}`)
		// Lateral / z / behind misses agree too.
		check(150, r + 0.02, 25, 1.5, -0.01, 0.5, 'beyond-length')
		check(50, r + 0.02, 100, 1.5, -0.01, 0.5, 'above-zhigh')
		check(50, -5, 25, 1.5, -0.01, 0.5, 'behind')
		const rng = mulberry32(401)
		for (let i = 0; i < 50; i++) {
			const bnd = seededRange(rng, -30, 3),
				bnv = seededRange(rng, -5, 5)
			check(50, r + bnd, 25, 1.5, bnv, 0.5, `fuzz${i}`)
		}
	})

	it('Hit3DPoly kernel matches Hit3DPoly.hitTest', async () => {
		const mod = await getKernelMod()
		const poly = new Hit3DPoly([
			new Vertex3D(0, 0, 0),
			new Vertex3D(0, 100, 0),
			new Vertex3D(100, 100, 0),
			new Vertex3D(100, 0, 0),
		])
		const r = 25,
			dt = 1
		const r0 = poly.rgv[0] ?? new Vertex3D()
		const vxs = new Array(POLY_MAX_VERTS).fill(0),
			vys = new Array(POLY_MAX_VERTS).fill(0)
		poly.rgv.forEach((v, j) => {
			vxs[j] = v.x
			vys[j] = v.y
		})
		const pNx = mallocF32(mod, [poly.normal.x]),
			pNy = mallocF32(mod, [poly.normal.y]),
			pNz = mallocF32(mod, [poly.normal.z]),
			pR0x = mallocF32(mod, [r0.x]),
			pR0y = mallocF32(mod, [r0.y]),
			pR0z = mallocF32(mod, [r0.z]),
			pNv = mallocI32(mod, [poly.rgv.length]),
			pVX = mallocF32(mod, vxs),
			pVY = mallocF32(mod, vys)
		const oT = mod._malloc(4),
			oC = mod._malloc(4),
			oNx = mod._malloc(4),
			oNy = mod._malloc(4),
			oNz = mod._malloc(4),
			oDist = mod._malloc(4),
			oBnv = mod._malloc(4)
		const check = (bx: number, by: number, bz: number, vx: number, vy: number, vz: number, tag: string) => {
			const ball = classBall(bx, by, bz, vx, vy, vz, r)
			const coll = new CollisionEvent(ball)
			const t = poly.hitTest(ball, dt, coll)
			callBatch(
				mod,
				'_batchHitTestPoly',
				1,
				bx,
				by,
				bz,
				vx,
				vy,
				vz,
				r,
				pNx,
				pNy,
				pNz,
				pR0x,
				pR0y,
				pR0z,
				pNv,
				pVX,
				pVY,
				dt,
				oT,
				oC,
				oNx,
				oNy,
				oNz,
				oDist,
				oBnv,
			)
			const lane: LaneOut = {
				t: readF32(mod, oT, 1)[0] ?? -1,
				c: readI32(mod, oC, 1)[0] ?? 0,
				nx: readF32(mod, oNx, 1)[0] ?? 0,
				ny: readF32(mod, oNy, 1)[0] ?? 0,
				nz: readF32(mod, oNz, 1)[0] ?? 0,
				dist: readF32(mod, oDist, 1)[0] ?? 0,
				bnv: readF32(mod, oBnv, 1)[0] ?? 0,
			}
			expectLaneMatchesClass(lane, t, coll, tag)
		}
		for (const [bnd, bnv] of BAND_CASES) check(50, 50, r + bnd, 1.5, -2.25, bnv, `bnd=${bnd} bnv=${bnv}`)
		// Outside the verts: point-in-poly miss on both paths.
		check(500, 50, r + 0.02, 1.5, -2.25, -0.01, 'outside-verts')
		check(500, 50, r + 2, 0, 0, -5, 'outside-verts-far')
		const rng = mulberry32(403)
		for (let i = 0; i < 50; i++) {
			const bnd = seededRange(rng, -30, 3),
				bnv = seededRange(rng, -5, 5)
			check(50, 50, r + bnd, 1.5, -2.25, bnv, `fuzz${i}`)
		}
		for (const p of [pNx, pNy, pNz, pR0x, pR0y, pR0z, pNv, pVX, pVY, oT, oC, oNx, oNy, oNz, oDist, oBnv])
			mod._free(p)
	})

	it('HitPlane kernel matches HitPlane.hitTest (scalar tail)', async () => {
		const mod = await getKernelMod()
		const r = 25,
			dt = 1
		const check = (bnd: number, bnv: number, tag: string) => {
			const plane = new HitPlane(new Vertex3D(0, 0, 1), 0)
			const ball = classBall(50, 50, r + bnd, 1.5, -2.25, bnv, r)
			const coll = new CollisionEvent(ball)
			const t = plane.hitTest(ball, dt, coll)
			const lane = runLane(
				mod,
				'_batchHitTestPlane',
				[50, 50, r + bnd, 1.5, -2.25, bnv, r],
				[[0], [0], [1], [0]],
				dt,
			)
			expectLaneMatchesClass(lane, t, coll, tag)
		}
		for (const [bnd, bnv] of BAND_CASES) check(bnd, bnv, `bnd=${bnd} bnv=${bnv}`)
		const rng = mulberry32(402)
		for (let i = 0; i < 50; i++) {
			check(seededRange(rng, -30, 3), seededRange(rng, -5, 5), `fuzz${i}`)
		}
	})

	it('HitPlane kernel matches HitPlane.hitTest (SIMD lanes + tail)', async () => {
		// One n=9 batch: lanes 0-7 run the SIMD loop, lane 8 the scalar tail.
		// Fixed slow ball, per-lane plane offset sweeps the FIX_PHYSICS
		// branches: slow-far approach hit, contacts, deep-embed collisions.
		const mod = await getKernelMod()
		const r = 25,
			dt = 1,
			bnv = -0.09
		const bnds = [0.06, 0.02, 0.049, -0.02, -0.049, -0.051, -5, -49, 2]
		const n = bnds.length
		const bx = 50,
			by = 50,
			bz = 25,
			vx = 1.5,
			vy = -2.25
		const pNx = mallocF32(mod, new Array(n).fill(0))
		const pNy = mallocF32(mod, new Array(n).fill(0))
		const pNz = mallocF32(mod, new Array(n).fill(1))
		const pD = mallocF32(
			mod,
			bnds.map(bnd => bz - r - bnd),
		)
		const oT = mod._malloc(n * 4),
			oC = mod._malloc(n * 4),
			oNx = mod._malloc(n * 4),
			oNy = mod._malloc(n * 4),
			oNz = mod._malloc(n * 4),
			oDist = mod._malloc(n * 4),
			oBnv = mod._malloc(n * 4)
		callBatch(
			mod,
			'_batchHitTestPlane',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			bnv,
			r,
			pNx,
			pNy,
			pNz,
			pD,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		const out: KernelOut = {
			t: readF32(mod, oT, n),
			c: readI32(mod, oC, n),
			nx: readF32(mod, oNx, n),
			ny: readF32(mod, oNy, n),
			nz: readF32(mod, oNz, n),
			dist: readF32(mod, oDist, n),
			bnv: readF32(mod, oBnv, n),
		}
		bnds.forEach((bnd, i) => {
			const plane = new HitPlane(new Vertex3D(0, 0, 1), bz - r - bnd)
			const ball = classBall(bx, by, bz, vx, vy, bnv, r)
			const coll = new CollisionEvent(ball)
			const t = plane.hitTest(ball, dt, coll)
			expectLaneMatchesClass(laneOf(out, i), t, coll, `lane${i} bnd=${bnd}`)
		})
		// Slow ball past the touch band still hits on the approach line.
		expect(out.t[0]).toBeCloseTo(0.06 / 0.09, 3)
		expect(out.c[0]).toBe(0)
		expect(out.c[1]).toBe(1)
		expect(out.t[5]).toBe(0)
		expect(out.c[5]).toBe(0)
		expect(out.t[8]).toBe(-1)
		for (const p of [pNx, pNy, pNz, pD, oT, oC, oNx, oNy, oNz, oDist, oBnv]) mod._free(p)
	})
})

describe.skipIf(!hasWasmDist)('kernels.ts bridge', () => {
	it('getWasmKernels resolves, dedupes concurrent callers, and marks ready', async () => {
		const [a, b] = await Promise.all([getWasmKernels(), getWasmKernels()])
		expect(a).toBe(b)
		expect(isWasmReady()).toBe(true)
		expect(getWasmModSync()).toBe(a)
	})

	it('warmWasmPools makes every tryGet kind available; count 0 always misses', async () => {
		await getWasmKernels()
		warmWasmPools(8, 8, 8, 8, 8, 8, 8, 8)
		expect(tryGetWasmBatchHitViewsOutCircle(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutPlane(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutLineZ(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutPoint(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutTriangle(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutLineSeg(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutLine3D(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutPoly(8)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutCircle(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutPlane(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutLineZ(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutPoint(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutTriangle(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutLineSeg(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutLine3D(0)).toBeNull()
		expect(tryGetWasmBatchHitViewsOutPoly(0)).toBeNull()
	})

	it('pools grow on demand: tryGet misses beyond cap, hits after growth', async () => {
		await getWasmKernels()
		const before = getWasmBatchHitViewsOutCircle(1)
		const cap = before.cx.length
		expect(cap).toBeGreaterThan(0)
		expect(tryGetWasmBatchHitViewsOutCircle(cap)).not.toBeNull()
		expect(tryGetWasmBatchHitViewsOutCircle(cap + 1)).toBeNull()
		const grown = getWasmBatchHitViewsOutCircle(cap + 100)
		expect(grown.cx.length).toBe(cap + 100)
		expect(grown.oT.length).toBe(cap + 100)
		expect(grown.oContact.length).toBe(cap + 100)
		const reacquired = tryGetWasmBatchHitViewsOutCircle(cap + 1)
		expect(reacquired).not.toBeNull()
		expect(reacquired?.cx.length).toBe(cap + 100)
	})

	it('circle run() matches a direct kernel call on identical inputs', async () => {
		await getWasmKernels()
		const bmod = getWasmModSync()
		if (!bmod) throw new Error('expected wasm kernels to be loaded')
		const n = 9
		const bx = 60,
			by = 0,
			bz = 50,
			vx = -40,
			vy = 0,
			vz = 0,
			br = 25,
			dt = 1
		const CX = [0, 60, 60, 0, 200]
		const CY = [0, 35.02, 0, 0, 0]
		const CR = [10, 10, 10, 10, 10]
		const ZL = [0, 0, 0, 200, 0]
		const ZH = [100, 100, 100, 300, 100]
		const rng = mulberry32(302)
		for (let i = 5; i < n; i++) {
			CX.push(seededRange(rng, -50, 50))
			CY.push(seededRange(rng, -50, 50))
			CR.push(seededRange(rng, 5, 30))
			const zl = seededRange(rng, 0, 20)
			ZL.push(zl)
			ZH.push(zl + seededRange(rng, 20, 60))
		}
		// Direct-call buffers first: later mallocs could grow the heap and detach views.
		const pCx = mallocF32(bmod, CX)
		const pCy = mallocF32(bmod, CY)
		const pCr = mallocF32(bmod, CR)
		const pZl = mallocF32(bmod, ZL)
		const pZh = mallocF32(bmod, ZH)
		const oT = bmod._malloc(n * 4)
		const oC = bmod._malloc(n * 4)
		const oNx = bmod._malloc(n * 4)
		const oNy = bmod._malloc(n * 4)
		const oNz = bmod._malloc(n * 4)
		const oDist = bmod._malloc(n * 4)
		const oBnv = bmod._malloc(n * 4)
		const views = getWasmBatchHitViewsOutCircle(n)
		for (let i = 0; i < n; i++) {
			views.cx[i] = CX[i] ?? 0
			views.cy[i] = CY[i] ?? 0
			views.cr[i] = CR[i] ?? 0
			views.zl[i] = ZL[i] ?? 0
			views.zh[i] = ZH[i] ?? 0
		}
		callBatch(
			bmod,
			'_batchHitTestCircle',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			br,
			pCx,
			pCy,
			pCr,
			pZl,
			pZh,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		views.run(bx, by, bz, vx, vy, vz, br, dt)
		const direct: KernelOut = {
			t: readF32(bmod, oT, n),
			c: readI32(bmod, oC, n),
			nx: readF32(bmod, oNx, n),
			ny: readF32(bmod, oNy, n),
			nz: readF32(bmod, oNz, n),
			dist: readF32(bmod, oDist, n),
			bnv: readF32(bmod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			expect(views.oT[i]).toBe(direct.t[i])
			expect(views.oContact[i]).toBe(direct.c[i])
			expect(views.oNx[i]).toBe(direct.nx[i])
			expect(views.oNy[i]).toBe(direct.ny[i])
			expect(views.oNz[i]).toBe(direct.nz[i])
			expect(views.oDist[i]).toBe(direct.dist[i])
			expect(views.oBnv[i]).toBe(direct.bnv[i])
		}
		for (const p of [pCx, pCy, pCr, pZl, pZh, oT, oC, oNx, oNy, oNz, oDist, oBnv]) bmod._free(p)
	})

	it('poly run() wires numVerts and the 32-stride vert arrays like a direct call', async () => {
		await getWasmKernels()
		const bmod = getWasmModSync()
		if (!bmod) throw new Error('expected wasm kernels to be loaded')
		const n = 2
		const bx = 50,
			by = 50,
			bz = 100,
			vx = 0,
			vy = 0,
			vz = -50,
			r = 25,
			dt = 2
		const quads = [
			{ vx: [0, 0, 100, 100], vy: [0, 100, 100, 0] },
			{ vx: [500, 500, 600, 600], vy: [500, 600, 600, 500] },
		]
		const NV = [4, 4]
		const VX = new Array(n * POLY_MAX_VERTS).fill(0)
		const VY = new Array(n * POLY_MAX_VERTS).fill(0)
		quads.forEach((q, i) => {
			q.vx.forEach((x, j) => {
				VX[i * POLY_MAX_VERTS + j] = x
				VY[i * POLY_MAX_VERTS + j] = q.vy[j] ?? 0
			})
		})
		const zeros = new Array(n).fill(0)
		const ones = new Array(n).fill(1)
		const pNx = mallocF32(bmod, zeros)
		const pNy = mallocF32(bmod, zeros)
		const pNz = mallocF32(bmod, ones)
		const pR0x = mallocF32(bmod, zeros)
		const pR0y = mallocF32(bmod, zeros)
		const pR0z = mallocF32(bmod, zeros)
		const pNv = mallocI32(bmod, NV)
		const pVX = mallocF32(bmod, VX)
		const pVY = mallocF32(bmod, VY)
		const oT = bmod._malloc(n * 4)
		const oC = bmod._malloc(n * 4)
		const oNx = bmod._malloc(n * 4)
		const oNy = bmod._malloc(n * 4)
		const oNz = bmod._malloc(n * 4)
		const oDist = bmod._malloc(n * 4)
		const oBnv = bmod._malloc(n * 4)
		const views = getWasmBatchHitViewsOutPoly(n)
		for (let i = 0; i < n; i++) {
			views.nx[i] = 0
			views.ny[i] = 0
			views.nz[i] = 1
			views.r0x[i] = 0
			views.r0y[i] = 0
			views.r0z[i] = 0
			views.numVerts[i] = NV[i] ?? 0
			const base = i * POLY_MAX_VERTS
			for (let j = 0; j < POLY_MAX_VERTS; j++) {
				views.vertsX[base + j] = VX[base + j] ?? 0
				views.vertsY[base + j] = VY[base + j] ?? 0
			}
		}
		callBatch(
			bmod,
			'_batchHitTestPoly',
			n,
			bx,
			by,
			bz,
			vx,
			vy,
			vz,
			r,
			pNx,
			pNy,
			pNz,
			pR0x,
			pR0y,
			pR0z,
			pNv,
			pVX,
			pVY,
			dt,
			oT,
			oC,
			oNx,
			oNy,
			oNz,
			oDist,
			oBnv,
		)
		views.run(bx, by, bz, vx, vy, vz, r, dt)
		expect(views.oT[0]).toBeCloseTo(1.5, 3)
		expect(views.oT[1]).toBe(-1)
		const direct: KernelOut = {
			t: readF32(bmod, oT, n),
			c: readI32(bmod, oC, n),
			nx: readF32(bmod, oNx, n),
			ny: readF32(bmod, oNy, n),
			nz: readF32(bmod, oNz, n),
			dist: readF32(bmod, oDist, n),
			bnv: readF32(bmod, oBnv, n),
		}
		for (let i = 0; i < n; i++) {
			expect(views.oT[i]).toBe(direct.t[i])
			expect(views.oContact[i]).toBe(direct.c[i])
			expect(views.oNx[i]).toBe(direct.nx[i])
			expect(views.oNy[i]).toBe(direct.ny[i])
			expect(views.oNz[i]).toBe(direct.nz[i])
			expect(views.oDist[i]).toBe(direct.dist[i])
			expect(views.oBnv[i]).toBe(direct.bnv[i])
		}
		for (const p of [pNx, pNy, pNz, pR0x, pR0y, pR0z, pNv, pVX, pVY, oT, oC, oNx, oNy, oNz, oDist, oBnv])
			bmod._free(p)
	})
})

describe('wasm batch scalar fallbacks (no dist required)', () => {
	function ngon(n: number, radius = 40, cx = 50, cy = 50): Vertex3D[] {
		return Array.from({ length: n }, (_, i) => {
			const a = (i / n) * 2 * Math.PI
			return new Vertex3D(cx + radius * Math.cos(a), cy + radius * Math.sin(a), 0)
		})
	}

	it('a >32-gon classifies as Other (scalar path); a 32-gon batches', () => {
		const big = new Hit3DPoly(ngon(33))
		const max = new Hit3DPoly(ngon(32))
		const collector = new BatchCollector()
		collector.classify(big)
		collector.classify(max)
		expect(collector.orderLen).toBe(2)
		expect(collector.order[0]).toMatchObject({ kind: HitKind.Other, idx: -1 })
		expect(collector.order[1]).toMatchObject({ kind: HitKind.Poly, idx: 0 })
		expect(collector.polys).toHaveLength(1)
		expect(collector.polys[0]).toBe(max)
	})

	it('a trigger poly classifies as Other (scalar path)', () => {
		const trigger = new Hit3DPoly(ngon(4), CollisionType.Trigger)
		const solid = new Hit3DPoly(ngon(4))
		const collector = new BatchCollector()
		collector.classify(trigger)
		collector.classify(solid)
		expect(collector.orderLen).toBe(2)
		expect(collector.order[0]).toMatchObject({ kind: HitKind.Other, idx: -1 })
		expect(collector.order[1]).toMatchObject({ kind: HitKind.Poly, idx: 0 })
		expect(collector.polys).toHaveLength(1)
	})

	it('countBatchables excludes >32-gons and trigger polys from the poly slot', () => {
		const counts = countBatchables([
			new Hit3DPoly(ngon(33)),
			new Hit3DPoly(ngon(4), CollisionType.Trigger),
			new Hit3DPoly(ngon(4)),
		])
		expect(counts.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
		expect(counts[7]).toBe(1)
	})

	it('replay resets per-hit fields like scalar doHitTest', () => {
		// Scalar doHitTest coll.set()s a fresh (reset) event, clearing hitFlag,
		// hitVel, hitMomentBit and hitOrgNormalVelocity; replay must too.
		const ball = {
			state: { pos: new Vertex3D(50, 25.02, 25), isFrozen: false },
			hit: { vel: new Vertex3D(0, 0, 0) },
			data: { radius: 25 },
		} as unknown as Ball
		const seg = new LineSeg(new Vertex2D(0, 0), new Vertex2D(100, 0), 0, 50)
		const collector = new BatchCollector()
		collector.order.push({ obj: seg, kind: HitKind.LineSeg, idx: 0 })
		collector.orderLen = 1
		// Synthetic kernel hit: t=0 collision (not a contact).
		collector.views.lineSeg = {
			oT: new Float32Array([0]),
			oContact: new Int32Array([0]),
			oNx: new Float32Array([0]),
			oNy: new Float32Array([1]),
			oNz: new Float32Array([0]),
			oDist: new Float32Array([0.02]),
			oBnv: new Float32Array([0]),
		} as unknown as LineSegViews
		const coll = new CollisionEvent(ball)
		coll.hitTime = 1
		// Stale per-hit state from an earlier contact in the same step.
		coll.hitFlag = true
		coll.hitVel.set(9, 9)
		coll.hitMomentBit = false
		coll.hitOrgNormalVelocity = 5
		const physics = { recordContacts: false } as unknown as PlayerPhysics
		collector.replay(ball, coll, physics)
		expect(coll.hitTime).toBe(0)
		expect(coll.isContact).toBe(false)
		expect(coll.obj).toBe(seg)
		expect([coll.hitNormal.x, coll.hitNormal.y, coll.hitNormal.z]).toEqual([0, 1, 0])
		expect(coll.hitDistance).toBeCloseTo(0.02, 5)
		expect(coll.hitFlag).toBe(false)
		expect([coll.hitVel.x, coll.hitVel.y]).toEqual([0, 0])
		expect(coll.hitMomentBit).toBe(true)
		expect(coll.hitOrgNormalVelocity).toBe(0)
	})
})
