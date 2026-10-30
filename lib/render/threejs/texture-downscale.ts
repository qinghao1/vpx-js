// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataUtils, HalfFloatType } from 'three'
import { isPlayfieldCap } from './texture-tags.js'

export type DownscaleArray = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array

// Half->float lookup built once: one array read per sample instead of a
// bit-twiddling call, with entries exactly equal to fromHalfFloat (output
// bits unchanged). The averaging toHalfFloat stays a call — no exact LUT.
let halfToFloatLut: Float32Array | null = null

/** Shared half-float decode table; exported for tests. */
export function getHalfToFloatLut(): Float32Array {
	let lut = halfToFloatLut
	if (!lut) {
		lut = new Float32Array(65536)
		for (let i = 0; i < 65536; i++) lut[i] = DataUtils.fromHalfFloat(i)
		halfToFloatLut = lut
	}
	return lut
}

export type BoxWindowGeometry = {
	nw: number
	nh: number
	x0: Int32Array
	x1: Int32Array
	y0: Int32Array
	y1: Int32Array
}

// One box kernel per dtype so the hot loop holds monomorphic typed arrays
// with no per-sample half/decode ternary and no per-output encode branch.
// The comps===4 fast paths accumulate components in locals over a single
// window pass; per-component add order stays row-major (sy outer, sx inner),
// matching the c-outer accumulation order of the in-spec generic reference,
// so output bytes are unchanged.

function boxHalf(
	src: Uint16Array,
	lut: Float32Array,
	out: Uint16Array,
	width: number,
	comps: number,
	geom: BoxWindowGeometry,
): void {
	const { nw, nh, x0, x1, y0, y1 } = geom
	if (comps === 4) {
		for (let y = 0; y < nh; y++) {
			const ya = y0[y]
			const yb = y1[y]
			for (let x = 0; x < nw; x++) {
				const xa = x0[x]
				const xb = x1[x]
				let s0 = 0
				let s1 = 0
				let s2 = 0
				let s3 = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * 4
					for (let sx = xa; sx < xb; sx++) {
						const i = row + sx * 4
						s0 += lut[src[i]]
						s1 += lut[src[i + 1]]
						s2 += lut[src[i + 2]]
						s3 += lut[src[i + 3]]
					}
				}
				const count = (xb - xa) * (yb - ya)
				const d = (y * nw + x) * 4
				out[d] = DataUtils.toHalfFloat(s0 / count)
				out[d + 1] = DataUtils.toHalfFloat(s1 / count)
				out[d + 2] = DataUtils.toHalfFloat(s2 / count)
				out[d + 3] = DataUtils.toHalfFloat(s3 / count)
			}
		}
		return
	}
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			const dBase = (y * nw + x) * comps
			for (let c = 0; c < comps; c++) {
				let sum = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * comps
					for (let sx = xa; sx < xb; sx++) sum += lut[src[row + sx * comps + c]]
				}
				out[dBase + c] = DataUtils.toHalfFloat(sum / count)
			}
		}
	}
}

function boxFloat(src: Float32Array, out: Float32Array, width: number, comps: number, geom: BoxWindowGeometry): void {
	const { nw, nh, x0, x1, y0, y1 } = geom
	if (comps === 4) {
		for (let y = 0; y < nh; y++) {
			const ya = y0[y]
			const yb = y1[y]
			for (let x = 0; x < nw; x++) {
				const xa = x0[x]
				const xb = x1[x]
				let s0 = 0
				let s1 = 0
				let s2 = 0
				let s3 = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * 4
					for (let sx = xa; sx < xb; sx++) {
						const i = row + sx * 4
						s0 += src[i]
						s1 += src[i + 1]
						s2 += src[i + 2]
						s3 += src[i + 3]
					}
				}
				const count = (xb - xa) * (yb - ya)
				const d = (y * nw + x) * 4
				out[d] = s0 / count
				out[d + 1] = s1 / count
				out[d + 2] = s2 / count
				out[d + 3] = s3 / count
			}
		}
		return
	}
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			const dBase = (y * nw + x) * comps
			for (let c = 0; c < comps; c++) {
				let sum = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * comps
					for (let sx = xa; sx < xb; sx++) sum += src[row + sx * comps + c]
				}
				out[dBase + c] = sum / count
			}
		}
	}
}

function boxInt(
	src: Uint8Array | Uint8ClampedArray | Uint16Array,
	out: Uint8Array | Uint8ClampedArray | Uint16Array,
	width: number,
	comps: number,
	geom: BoxWindowGeometry,
): void {
	const { nw, nh, x0, x1, y0, y1 } = geom
	if (comps === 4) {
		for (let y = 0; y < nh; y++) {
			const ya = y0[y]
			const yb = y1[y]
			for (let x = 0; x < nw; x++) {
				const xa = x0[x]
				const xb = x1[x]
				let s0 = 0
				let s1 = 0
				let s2 = 0
				let s3 = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * 4
					for (let sx = xa; sx < xb; sx++) {
						const i = row + sx * 4
						s0 += src[i]
						s1 += src[i + 1]
						s2 += src[i + 2]
						s3 += src[i + 3]
					}
				}
				const count = (xb - xa) * (yb - ya)
				const d = (y * nw + x) * 4
				out[d] = Math.round(s0 / count)
				out[d + 1] = Math.round(s1 / count)
				out[d + 2] = Math.round(s2 / count)
				out[d + 3] = Math.round(s3 / count)
			}
		}
		return
	}
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			const dBase = (y * nw + x) * comps
			for (let c = 0; c < comps; c++) {
				let sum = 0
				for (let sy = ya; sy < yb; sy++) {
					const row = sy * width * comps
					for (let sx = xa; sx < xb; sx++) sum += src[row + sx * comps + c]
				}
				out[dBase + c] = Math.round(sum / count)
			}
		}
	}
}

/**
 * Shared box-window geometry for every averaging path: output dims plus
 * the per-column/row source bounds. Integer-factor inputs tile the source
 * exactly (no per-pixel floor/ceil/min/div); otherwise bounds are the
 * floor/ceil window math. The tables hoist that math out of the kernels
 * (O(nw+nh) instead of O(nw*nh)); each bound equals the per-pixel
 * floor/ceil window for that output column or row.
 */
export function boxWindowGeometry(width: number, height: number, max: number): BoxWindowGeometry {
	const scale = Math.min(max / width, max / height)
	const nw = Math.max(1, Math.floor(width * scale))
	const nh = Math.max(1, Math.floor(height * scale))
	const qx = Math.round(width / nw)
	const qy = Math.round(height / nh)
	const exactBox = qx >= 1 && qy >= 1 && qx * nw === width && qy * nh === height
	const x0 = new Int32Array(nw)
	const x1 = new Int32Array(nw)
	const y0 = new Int32Array(nh)
	const y1 = new Int32Array(nh)
	for (let x = 0; x < nw; x++) {
		x0[x] = exactBox ? x * qx : Math.floor((x / nw) * width)
		x1[x] = exactBox ? x0[x] + qx : Math.min(width, Math.ceil(((x + 1) / nw) * width))
	}
	for (let y = 0; y < nh; y++) {
		y0[y] = exactBox ? y * qy : Math.floor((y / nh) * height)
		y1[y] = exactBox ? y0[y] + qy : Math.min(height, Math.ceil(((y + 1) / nh) * height))
	}
	return { nw, nh, x0, x1, y0, y1 }
}

/**
 * Generic downscale kernel shared by every texture path. Playfields use a
 * half-float-aware box average (nearest would sparkle on HDR playfields);
 * float (half-float/Float32) inputs use the box average on every texture for
 * the same reason, while LDR (Uint8) non-playfields keep point sampling.
 * Constructor-generic, so Uint8 (PNG), Uint16 (half float) and Float32 inputs
 * all round-trip through their own typed array. `type` is the three.js
 * texture type, only read to detect half float data; pass undefined for
 * untyped (e.g. decoded PNG) input.
 */
export function downscaleArray<T extends DownscaleArray>(
	src: T,
	width: number,
	height: number,
	max: number,
	name: string | undefined,
	type?: number,
): { data: T; width: number; height: number } {
	if (width <= max && height <= max) return { data: src, width, height }
	const geom = boxWindowGeometry(width, height, max)
	const { nw, nh } = geom
	const comps = Math.round(src.length / (width * height)) || 4
	const out = new (src.constructor as new (length: number) => T)(nw * nh * comps)
	const isHalf = src instanceof Uint16Array && type === HalfFloatType
	const isFloat = src instanceof Float32Array
	if (!isPlayfieldCap(name) && !isHalf && !isFloat) {
		for (let y = 0; y < nh; y++) {
			const sy = Math.min(height - 1, Math.floor((y / nh) * height))
			for (let x = 0; x < nw; x++) {
				const sx = Math.min(width - 1, Math.floor((x / nw) * width))
				const sIdx = (sy * width + sx) * comps
				const dIdx = (y * nw + x) * comps
				for (let c = 0; c < comps; c++) out[dIdx + c] = src[sIdx + c]
			}
		}
		return { data: out, width: nw, height: nh }
	}
	// Box windows come from the shared bound tables; every kernel path
	// accumulates each window in row-major order (sy outer, sx inner).
	if (isHalf) boxHalf(src as Uint16Array, getHalfToFloatLut(), out as Uint16Array, width, comps, geom)
	else if (isFloat) boxFloat(src as Float32Array, out as Float32Array, width, comps, geom)
	else
		boxInt(
			src as Uint8Array | Uint8ClampedArray | Uint16Array,
			out as Uint8Array | Uint8ClampedArray | Uint16Array,
			width,
			comps,
			geom,
		)
	return { data: out, width: nw, height: nh }
}
