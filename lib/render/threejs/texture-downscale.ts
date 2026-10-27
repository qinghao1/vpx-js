// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataUtils, HalfFloatType } from 'three'

// Canonical playfield lightmap family: base playfields, VLM/nestmap bakes, and
// pre-baked overlays all take the playfield size cap and the box-average
// downscale path. Single definition shared by the browser loader, the node
// loader, and both decode workers.
export const RE_PLAYFIELD = /playfield|nestmap|bake|vlm/i

/** Single predicate selecting the playfield size cap and box-average path. */
export function isPlayfieldCap(name: string | undefined): boolean {
	return !!name && RE_PLAYFIELD.test(name)
}

/** Static 4096/2048 cap for the node loader and decode workers (no quality tiers there). */
export function getMaxTextureSize(name: string): number {
	return isPlayfieldCap(name) ? 4096 : 2048
}

export type DownscaleArray = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array

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
	if (isPlayfieldCap(name)) {
		for (let y = 0; y < nh; y++) {
			const y0 = Math.floor((y / nh) * height)
			const y1 = Math.min(height, Math.ceil(((y + 1) / nh) * height))
			for (let x = 0; x < nw; x++) {
				const x0 = Math.floor((x / nw) * width)
				const x1 = Math.min(width, Math.ceil(((x + 1) / nw) * width))
				const count = (x1 - x0) * (y1 - y0)
				const dBase = (y * nw + x) * comps
				for (let c = 0; c < comps; c++) {
					let sum = 0
					for (let sy = y0; sy < y1; sy++) {
						const row = sy * width * comps
						for (let sx = x0; sx < x1; sx++)
							sum += isHalf
								? DataUtils.fromHalfFloat((src as any)[row + sx * comps + c] as any)
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
