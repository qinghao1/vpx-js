// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataUtils, HalfFloatType } from 'three'
import { isPlayfieldCap } from './texture-tags.js'

export type DownscaleArray = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array

// Half -> float lookup built once from DataUtils.fromHalfFloat, so the
// playfield box average below pays one array read per sample instead of a
// bit-twiddling call. Entries equal fromHalfFloat exactly, hence output bits
// are unchanged; toHalfFloat on the average stays a call (no exact LUT).
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

/**
 * Generic downscale kernel shared by every texture path. Playfields use a
 * half-float-aware box average (nearest would sparkle on HDR playfields);
 * everything else keeps point sampling. Constructor-generic, so Uint8 (PNG),
 * Uint16 (half float) and Float32 inputs all round-trip through their own
 * typed array. `type` is the three.js texture type, only read to detect half
 * float data; pass undefined for untyped (e.g. decoded PNG) input.
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
	const scale = Math.min(max / width, max / height)
	const nw = Math.max(1, Math.floor(width * scale))
	const nh = Math.max(1, Math.floor(height * scale))
	const comps = Math.round(src.length / (width * height)) || 4
	const out = new (src.constructor as any)(nw * nh * comps) as T
	const isHalf = src instanceof Uint16Array && type === HalfFloatType
	const isFloat = src instanceof Float32Array
	// Decoded once per call so exactBox windows below read floats from the
	// table; null for other dtypes (branch folds out of the inner loop).
	const halfLut = isHalf ? getHalfToFloatLut() : null
	// Integer-factor fast path: exact 2x/4x/... box windows tile the source
	// with no per-pixel floor/ceil/min/div. Window bounds and accumulation
	// order match the generic loop below, so output bytes are identical.
	const qx = Math.round(width / nw)
	const qy = Math.round(height / nh)
	const exactBox = qx >= 1 && qy >= 1 && qx * nw === width && qy * nh === height
	if (isPlayfieldCap(name)) {
		for (let y = 0; y < nh; y++) {
			// Exact windows tile the source, so the generic per-pixel math is skipped.
			const y0 = exactBox ? y * qy : Math.floor((y / nh) * height)
			const y1 = exactBox ? y0 + qy : Math.min(height, Math.ceil(((y + 1) / nh) * height))
			for (let x = 0; x < nw; x++) {
				const x0 = exactBox ? x * qx : Math.floor((x / nw) * width)
				const x1 = exactBox ? x0 + qx : Math.min(width, Math.ceil(((x + 1) / nw) * width))
				const count = (x1 - x0) * (y1 - y0)
				const dBase = (y * nw + x) * comps
				for (let c = 0; c < comps; c++) {
					let sum = 0
					for (let sy = y0; sy < y1; sy++) {
						const row = sy * width * comps
						for (let sx = x0; sx < x1; sx++)
							sum += halfLut
								? halfLut[(src as any)[row + sx * comps + c]]!
								: (src as any)[row + sx * comps + c]
					}
					const avg = sum / count
					out[dBase + c] = isHalf ? DataUtils.toHalfFloat(avg) : isFloat ? avg : Math.round(avg)
				}
			}
		}
	} else {
		for (let y = 0; y < nh; y++) {
			const sy = Math.min(height - 1, Math.floor((y / nh) * height))
			for (let x = 0; x < nw; x++) {
				const sx = Math.min(width - 1, Math.floor((x / nw) * width))
				const sIdx = (sy * width + sx) * comps
				const dIdx = (y * nw + x) * comps
				for (let c = 0; c < comps; c++) out[dIdx + c] = src[sIdx + c]
			}
		}
	}
	return { data: out, width: nw, height: nh }
}
