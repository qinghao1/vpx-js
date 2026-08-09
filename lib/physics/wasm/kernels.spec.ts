import { describe, expect, it } from 'vitest'

const C_CONTACTVEL = 0.099, C_LOWNORMVEL = 0.0001, PHYS_TOUCH = 0.05
function pickTime(a: number, b: number) { return a * b < 0 ? Math.max(a, b) : Math.min(a, b) }

function refPlane(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, nx: number, ny: number, nz: number, d: number, dt: number) {
	let bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return -1
	let bnd = nx * bx + ny * by + nz * bz - r - d
	if (bnd < r * -2) return -1
	if (Math.abs(bnv) <= C_CONTACTVEL) {
		if (Math.abs(bnd) > PHYS_TOUCH) return -1
		return 0
	}
	let t = bnd / -bnv
	if (t < 0) t = 0
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	return t
}
function refCircle(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, cx: number, cy: number, cr: number, zl: number, zh: number, dt: number) {
	let dx = bx - cx, dy = by - cy, d2 = dx * dx + dy * dy, d = Math.sqrt(d2)
	if (d <= 1e-6) return -1
	let b = dx * vx + dy * vy, bnv = b / d
	if (bnv > C_LOWNORMVEL) return -1
	let bnd = d - (cr + br), a = vx * vx + vy * vy
	let t = 0, contact = 0
	if (bnd < PHYS_TOUCH) {
		if (bnd < -br) return -1
		if (Math.abs(bnv) <= C_CONTACTVEL) contact = 1
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return -1
		let disc = 4 * b * b - 4 * a * (d2 - (cr + br) * (cr + br))
		if (disc < 0) return -1
		let s = Math.sqrt(disc), inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	let hz = bz + vz * t
	if (hz + br * 0.5 < zl || hz - br * 0.5 > zh) return -1
	return t
}
function refLineZ(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, br: number, lx: number, ly: number, zl: number, zh: number, dt: number) {
	let dx = bx - lx, dy = by - ly, d2 = dx * dx + dy * dy, d = Math.sqrt(d2)
	if (d <= 1e-6) return -1
	let b = dx * vx + dy * vy, bnv = b / d
	if (bnv > C_CONTACTVEL) return -1
	let bnd = d - br, a = vx * vx + vy * vy
	let t = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else t = -bnd / bnv
	} else {
		if (a < 1e-8) return -1
		let disc = 4 * b * b - 4 * a * (d2 - br * br)
		if (disc < 0) return -1
		let s = Math.sqrt(disc), inv = -0.5 / a
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	let hz = bz + vz * t
	if (hz < zl || hz > zh) return -1
	return t
}
function refPoint(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, px: number, py: number, pz: number, dt: number) {
	let dx = bx - px, dy = by - py, dz = bz - pz, bcddsq = dx * dx + dy * dy + dz * dz, bcdd = Math.sqrt(bcddsq)
	if (bcdd <= 1e-6) return -1
	let b = dx * vx + dy * vy + dz * vz, bnv = b / bcdd
	if (bnv > C_CONTACTVEL) return -1
	let bnd = bcdd - r, a = vx * vx + vy * vy + vz * vz
	let t = 0
	if (bnd < PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else t = Math.max(0, -bnd / bnv)
	} else {
		if (a < 1e-8) return -1
		let disc = 4 * b * b - 4 * a * (bcddsq - r * r)
		if (disc < 0) return -1
		let s = Math.sqrt(disc), inv = -0.5 / a
		let t0 = (2 * b + s) * inv, t1 = (2 * b - s) * inv
		t = t0 * t1 < 0 ? Math.max(t0, t1) : Math.min(t0, t1)
	}
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	return t
}
function refTriangle(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, r0x: number, r0y: number, r0z: number, r1x: number, r1y: number, r1z: number, r2x: number, r2y: number, r2z: number, nx: number, ny: number, nz: number, dt: number) {
	let bnv = nx * vx + ny * vy + nz * vz
	if (bnv > C_CONTACTVEL) return -1
	let hx = bx - nx * r, hy = by - ny * r, hz = bz - nz * r
	let bnd = nx * (hx - r0x) + ny * (hy - r0y) + nz * (hz - r0z)
	if (bnd < -r) return -1
	let t = 0
	if (bnd <= PHYS_TOUCH) {
		if (Math.abs(bnv) <= C_CONTACTVEL) t = 0
		else if (bnd <= 0) t = 0
		else t = bnd / -bnv
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return -1
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	let hpx = hx + vx * t, hpy = hy + vy * t, hpz = hz + vz * t
	let v0x = r2x - r0x, v0y = r2y - r0y, v0z = r2z - r0z
	let v1x = r1x - r0x, v1y = r1y - r0y, v1z = r1z - r0z
	let v2x = hpx - r0x, v2y = hpy - r0y, v2z = hpz - r0z
	let dot00 = v0x * v0x + v0y * v0y + v0z * v0z
	let dot01 = v0x * v1x + v0y * v1y + v0z * v1z
	let dot02 = v0x * v2x + v0y * v2y + v0z * v2z
	let dot11 = v1x * v1x + v1y * v1y + v1z * v1z
	let dot12 = v1x * v2x + v1y * v2y + v1z * v2z
	let denom = dot00 * dot11 - dot01 * dot01
	let inv = 1 / denom
	let u = (dot11 * dot02 - dot01 * dot12) * inv
	let v_ = (dot00 * dot12 - dot01 * dot02) * inv
	if (u < 0 || v_ < 0 || u + v_ > 1) return -1
	return t
}
function refLineSeg(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, v1x: number, v1y: number, v2x: number, v2y: number, nx: number, ny: number, len: number, zl: number, zh: number, dt: number) {
	let bnv = vx * nx + vy * ny
	if (bnv > C_LOWNORMVEL) return -1
	let bcpd = (bx - v1x) * nx + (by - v1y) * ny
	let bnd = bcpd - r
	if (bnd < -r || bcpd < 0) return -1
	let t = 0
	if (bnd <= PHYS_TOUCH) {
		if (bnd <= 0 || Math.abs(bnv) > C_CONTACTVEL || bnd <= -PHYS_TOUCH) t = 0
		else t = bnd * (0.5 / PHYS_TOUCH) + 0.5
	} else if (Math.abs(bnv) > C_LOWNORMVEL) t = bnd / -bnv
	else return -1
	if (!Number.isFinite(t) || t < 0 || t > dt) return -1
	let btv = vx * ny - vy * nx
	let btd = (bx - v1x) * ny - (by - v1y) * nx + btv * t
	if (btd < 0 || btd > len) return -1
	let hz = bz + vz * t
	if (hz + r * 0.5 < zl || hz - r * 0.5 > zh) return -1
	return t
}
function refLine3D(bx: number, by: number, bz: number, vx: number, vy: number, vz: number, r: number, lx: number, ly: number, zl: number, zh: number, m00: number, m01: number, m02: number, m10: number, m11: number, m12: number, m20: number, m21: number, m22: number, dt: number) {
	let tbx = m00 * bx + m01 * by + m02 * bz
	let tby = m10 * bx + m11 * by + m12 * bz
	let tbz = m20 * bx + m21 * by + m22 * bz
	let tvx = m00 * vx + m01 * vy + m02 * vz
	let tvy = m10 * vx + m11 * vy + m12 * vz
	let tvz = m20 * vx + m21 * vy + m22 * vz
	let h = refLineZ(tbx, tby, tbz, tvx, tvy, tvz, r, lx, ly, zl, zh, dt)
	return h
}

describe('wasm kernels vs JS reference', () => {
	it('plane', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			let nx = rand(-1, 1), ny = rand(-1, 1), nz = rand(-1, 1); const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len
			const d = rand(-10, 10)
			const exp = refPlane(bx, by, bz, vx, vy, vz, r, nx, ny, nz, d, dt)
			const pNx = mod._malloc(4), pNy = mod._malloc(4), pNz = mod._malloc(4), pD = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx; new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny; new Float32Array(mod.HEAPF32.buffer, pNz, 1)[0] = nz; new Float32Array(mod.HEAPF32.buffer, pD, 1)[0] = d
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestPlane(1, bx, by, bz, vx, vy, vz, r, pNx, pNy, pNz, pD, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pNx); mod._free(pNy); mod._free(pNz); mod._free(pD); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('circle', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), br = 25, dt = 0.016
			const cx = rand(-50, 50), cy = rand(-50, 50), cr = rand(10, 30), zl = rand(0, 10), zh = zl + rand(10, 30)
			const exp = refCircle(bx, by, bz, vx, vy, vz, br, cx, cy, cr, zl, zh, dt)
			const pCx = mod._malloc(4), pCy = mod._malloc(4), pCr = mod._malloc(4), pZl = mod._malloc(4), pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pCx, 1)[0] = cx; new Float32Array(mod.HEAPF32.buffer, pCy, 1)[0] = cy; new Float32Array(mod.HEAPF32.buffer, pCr, 1)[0] = cr; new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl; new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestCircle(1, bx, by, bz, vx, vy, vz, br, pCx, pCy, pCr, pZl, pZh, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pCx); mod._free(pCy); mod._free(pCr); mod._free(pZl); mod._free(pZh); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('lineZ', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), br = 25, dt = 0.016
			const lx = rand(-50, 50), ly = rand(-50, 50), zl = rand(0, 10), zh = zl + rand(10, 30)
			const exp = refLineZ(bx, by, bz, vx, vy, vz, br, lx, ly, zl, zh, dt)
			const pLx = mod._malloc(4), pLy = mod._malloc(4), pZl = mod._malloc(4), pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pLx, 1)[0] = lx; new Float32Array(mod.HEAPF32.buffer, pLy, 1)[0] = ly; new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl; new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestLineZ(1, bx, by, bz, vx, vy, vz, br, pLx, pLy, pZl, pZh, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pLx); mod._free(pLy); mod._free(pZl); mod._free(pZh); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('point', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			const px = rand(-50, 50), py = rand(-50, 50), pz = rand(0, 30)
			const exp = refPoint(bx, by, bz, vx, vy, vz, r, px, py, pz, dt)
			const pPx = mod._malloc(4), pPy = mod._malloc(4), pPz = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pPx, 1)[0] = px; new Float32Array(mod.HEAPF32.buffer, pPy, 1)[0] = py; new Float32Array(mod.HEAPF32.buffer, pPz, 1)[0] = pz
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestPoint(1, bx, by, bz, vx, vy, vz, r, pPx, pPy, pPz, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pPx); mod._free(pPy); mod._free(pPz); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('triangle', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			const r0x = rand(-20, 20), r0y = rand(-20, 20), r0z = rand(0, 10), r1x = r0x + rand(-5, 5), r1y = r0y + rand(-5, 5), r1z = r0z + rand(-2, 2), r2x = r0x + rand(-5, 5), r2y = r0y + rand(-5, 5), r2z = r0z + rand(-2, 2)
			let nx = rand(-1, 1), ny = rand(-1, 1), nz = rand(-1, 1); const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len
			const exp = refTriangle(bx, by, bz, vx, vy, vz, r, r0x, r0y, r0z, r1x, r1y, r1z, r2x, r2y, r2z, nx, ny, nz, dt)
			const pR0x = mod._malloc(4), pR0y = mod._malloc(4), pR0z = mod._malloc(4), pR1x = mod._malloc(4), pR1y = mod._malloc(4), pR1z = mod._malloc(4), pR2x = mod._malloc(4), pR2y = mod._malloc(4), pR2z = mod._malloc(4), pNx = mod._malloc(4), pNy = mod._malloc(4), pNz = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pR0x, 1)[0] = r0x; new Float32Array(mod.HEAPF32.buffer, pR0y, 1)[0] = r0y; new Float32Array(mod.HEAPF32.buffer, pR0z, 1)[0] = r0z; new Float32Array(mod.HEAPF32.buffer, pR1x, 1)[0] = r1x; new Float32Array(mod.HEAPF32.buffer, pR1y, 1)[0] = r1y; new Float32Array(mod.HEAPF32.buffer, pR1z, 1)[0] = r1z; new Float32Array(mod.HEAPF32.buffer, pR2x, 1)[0] = r2x; new Float32Array(mod.HEAPF32.buffer, pR2y, 1)[0] = r2y; new Float32Array(mod.HEAPF32.buffer, pR2z, 1)[0] = r2z; new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx; new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny; new Float32Array(mod.HEAPF32.buffer, pNz, 1)[0] = nz
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestTriangle(1, bx, by, bz, vx, vy, vz, r, pR0x, pR0y, pR0z, pR1x, pR1y, pR1z, pR2x, pR2y, pR2z, pNx, pNy, pNz, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pR0x); mod._free(pR0y); mod._free(pR0z); mod._free(pR1x); mod._free(pR1y); mod._free(pR1z); mod._free(pR2x); mod._free(pR2y); mod._free(pR2z); mod._free(pNx); mod._free(pNy); mod._free(pNz); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('lineSeg', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			const v1x = rand(-50, 50), v1y = rand(-50, 50), v2x = v1x + rand(-10, 10), v2y = v1y + rand(-10, 10)
			let nx = -(v2y - v1y), ny = v2x - v1x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; const len = Math.hypot(v2x - v1x, v2y - v1y)
			const zl = rand(0, 10), zh = zl + rand(10, 30)
			const exp = refLineSeg(bx, by, bz, vx, vy, vz, r, v1x, v1y, v2x, v2y, nx, ny, len, zl, zh, dt)
			const pV1x = mod._malloc(4), pV1y = mod._malloc(4), pV2x = mod._malloc(4), pV2y = mod._malloc(4), pNx = mod._malloc(4), pNy = mod._malloc(4), pLen = mod._malloc(4), pZl = mod._malloc(4), pZh = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pV1x, 1)[0] = v1x; new Float32Array(mod.HEAPF32.buffer, pV1y, 1)[0] = v1y; new Float32Array(mod.HEAPF32.buffer, pV2x, 1)[0] = v2x; new Float32Array(mod.HEAPF32.buffer, pV2y, 1)[0] = v2y; new Float32Array(mod.HEAPF32.buffer, pNx, 1)[0] = nx; new Float32Array(mod.HEAPF32.buffer, pNy, 1)[0] = ny; new Float32Array(mod.HEAPF32.buffer, pLen, 1)[0] = len; new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl; new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestLineSeg(1, bx, by, bz, vx, vy, vz, r, pV1x, pV1y, pV2x, pV2y, pNx, pNy, pLen, pZl, pZh, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pV1x); mod._free(pV1y); mod._free(pV2x); mod._free(pV2y); mod._free(pNx); mod._free(pNy); mod._free(pLen); mod._free(pZl); mod._free(pZh); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('line3D', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const rand = (a: number, b: number) => Math.random() * (b - a) + a
		for (let i = 0; i < 200; i++) {
			const bx = rand(-50, 50), by = rand(-50, 50), bz = rand(0, 30), vx = rand(-20, 20), vy = rand(-20, 20), vz = rand(-10, 10), r = 25, dt = 0.016
			const lx = rand(-10, 10), ly = rand(-10, 10), zl = rand(0, 10), zh = zl + rand(10, 30)
			let ax = rand(-1, 1), ay = rand(-1, 1), az = rand(-1, 1); const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al
			const ang = rand(0, Math.PI * 2), c = Math.cos(ang), s = Math.sin(ang), oc = 1 - c
			const m00 = ax * ax + c * (1 - ax * ax), m01 = ax * ay * oc - az * s, m02 = az * ax * oc + ay * s
			const m10 = ax * ay * oc + az * s, m11 = ay * ay + c * (1 - ay * ay), m12 = ay * az * oc - ax * s
			const m20 = az * ax * oc - ay * s, m21 = ay * az * oc + ax * s, m22 = az * az + c * (1 - az * az)
			const exp = refLine3D(bx, by, bz, vx, vy, vz, r, lx, ly, zl, zh, m00, m01, m02, m10, m11, m12, m20, m21, m22, dt)
			const pLx = mod._malloc(4), pLy = mod._malloc(4), pZl = mod._malloc(4), pZh = mod._malloc(4), pM00 = mod._malloc(4), pM01 = mod._malloc(4), pM02 = mod._malloc(4), pM10 = mod._malloc(4), pM11 = mod._malloc(4), pM12 = mod._malloc(4), pM20 = mod._malloc(4), pM21 = mod._malloc(4), pM22 = mod._malloc(4)
			new Float32Array(mod.HEAPF32.buffer, pLx, 1)[0] = lx; new Float32Array(mod.HEAPF32.buffer, pLy, 1)[0] = ly; new Float32Array(mod.HEAPF32.buffer, pZl, 1)[0] = zl; new Float32Array(mod.HEAPF32.buffer, pZh, 1)[0] = zh
			new Float32Array(mod.HEAPF32.buffer, pM00, 1)[0] = m00; new Float32Array(mod.HEAPF32.buffer, pM01, 1)[0] = m01; new Float32Array(mod.HEAPF32.buffer, pM02, 1)[0] = m02; new Float32Array(mod.HEAPF32.buffer, pM10, 1)[0] = m10; new Float32Array(mod.HEAPF32.buffer, pM11, 1)[0] = m11; new Float32Array(mod.HEAPF32.buffer, pM12, 1)[0] = m12; new Float32Array(mod.HEAPF32.buffer, pM20, 1)[0] = m20; new Float32Array(mod.HEAPF32.buffer, pM21, 1)[0] = m21; new Float32Array(mod.HEAPF32.buffer, pM22, 1)[0] = m22
			const oT = mod._malloc(4), oC = mod._malloc(4), oNx = mod._malloc(4), oNy = mod._malloc(4), oNz = mod._malloc(4), oDist = mod._malloc(4), oBnv = mod._malloc(4)
			mod._batchHitTestLine3D(1, bx, by, bz, vx, vy, vz, r, pLx, pLy, pZl, pZh, pM00, pM01, pM02, pM10, pM11, pM12, pM20, pM21, pM22, dt, oT, oC, oNx, oNy, oNz, oDist, oBnv)
			const got = new Float32Array(mod.HEAPF32.buffer, oT, 1)[0]!
			if (exp === -1) expect(got).toBeCloseTo(-1, 5)
			else expect(got).toBeCloseTo(exp, 3)
			mod._free(pLx); mod._free(pLy); mod._free(pZl); mod._free(pZh); mod._free(pM00); mod._free(pM01); mod._free(pM02); mod._free(pM10); mod._free(pM11); mod._free(pM12); mod._free(pM20); mod._free(pM21); mod._free(pM22); mod._free(oT); mod._free(oC); mod._free(oNx); mod._free(oNy); mod._free(oNz); mod._free(oDist); mod._free(oBnv)
		}
	})

	it('elasticity', async () => {
		const { default: create } = await import('../../../wasm/kernels/dist/kernels.js')
		const mod: any = await (create as any)({ locateFile: (p: string) => `wasm/kernels/dist/${p}` })
		const n = 16, pE = mod._malloc(n * 4), pF = mod._malloc(n * 4), pV = mod._malloc(n * 4), pO = mod._malloc(n * 4)
		const aE = new Float32Array(mod.HEAPF32.buffer, pE, n), aF = new Float32Array(mod.HEAPF32.buffer, pF, n), aV = new Float32Array(mod.HEAPF32.buffer, pV, n), aO = new Float32Array(mod.HEAPF32.buffer, pO, n)
		for (let i = 0; i < n; i++) { aE[i] = Math.random(); aF[i] = Math.random() * 2 - 0.5; aV[i] = Math.random() * 100 - 50 }
		const exp = new Float32Array(n)
		for (let i = 0; i < n; i++) exp[i] = aF[i] > 0 ? aE[i] / (1 + aF[i] * Math.abs(aV[i]) * (1 / 18.53)) : aE[i]
		mod._batchElasticityWithFalloff(n, pE, pF, pV, pO)
		for (let i = 0; i < n; i++) expect(aO[i]).toBeCloseTo(exp[i], 5)
		mod._free(pE); mod._free(pF); mod._free(pV); mod._free(pO)
	})
})
