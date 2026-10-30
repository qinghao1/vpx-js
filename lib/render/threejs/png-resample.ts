// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// PNG pixel pipeline: sample→RGBA expansion and fused expand+box-average
// resampling. Split from the node loader, which keeps only decode
// orchestration (inflate, unfilter, HDR pool).
import { boxWindowGeometry } from './texture-downscale.js'

export type DecodedImage = { data: Uint8Array; width: number; height: number }

/**
 * One PNG sample → RGBA pixel, used by expandToRgba and the fused generic
 * fallback. The per-colorType fused kernels below inline this same
 * mapping with format dispatch hoisted above their window loops; the
 * fused≡unfused tests pin them byte-identical so the copies cannot drift
 * apart silently.
 */
function readPngPixel(
	raw: Uint8Array,
	src: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	sample: number,
	out: Uint8Array,
	dst: number,
): void {
	if (colorType === 6) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src + sample]
		out[dst + 2] = raw[src + 2 * sample]
		out[dst + 3] = raw[src + 3 * sample]
	} else if (colorType === 2) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src + sample]
		out[dst + 2] = raw[src + 2 * sample]
		out[dst + 3] =
			sample === 1
				? isTransparentRgb(raw[src], raw[src + 1], raw[src + 2], transparency)
					? 0
					: 255
				: isTransparentRgb16(raw, src, transparency)
					? 0
					: 255
	} else if (colorType === 4) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src]
		out[dst + 2] = raw[src]
		out[dst + 3] = raw[src + sample]
	} else if (colorType === 0) {
		out[dst] = raw[src]
		out[dst + 1] = raw[src]
		out[dst + 2] = raw[src]
		out[dst + 3] =
			sample === 1
				? isTransparentGray(raw[src], transparency)
					? 0
					: 255
				: isTransparentGray16(raw, src, transparency)
					? 0
					: 255
	} else if (palette) {
		const entry = raw[src] * 3
		out[dst] = entry + 2 < palette.length ? palette[entry] : 0
		out[dst + 1] = entry + 2 < palette.length ? palette[entry + 1] : 0
		out[dst + 2] = entry + 2 < palette.length ? palette[entry + 2] : 0
		out[dst + 3] = transparency && raw[src] < transparency.length ? transparency[raw[src]] : 255
	}
}

export function expandToRgba(
	raw: Uint8Array,
	width: number,
	height: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	bitDepth = 8,
): Uint8Array {
	const out = new Uint8Array(width * height * 4)
	const stride = width * bytesPerPixel
	// 16-bit samples are big-endian pairs: channels sit `sample` apart and
	// the high byte (raw[src]) carries the 8-bit value.
	const sample = bitDepth === 16 ? 2 : 1
	for (let row = 0; row < height; row++) {
		const rowStart = row * (stride + 1) + 1
		for (let col = 0; col < width; col++) {
			readPngPixel(
				raw,
				rowStart + col * bytesPerPixel,
				colorType,
				palette,
				transparency,
				sample,
				out,
				(row * width + col) * 4,
			)
		}
	}
	return out
}

/**
 * Fused expand+box-average for oversize playfield PNGs. Accumulates RGBA
 * box windows straight from unfiltered samples, skipping the full-res
 * RGBA buffer (peak drops from ~3x frame to compressed + scanlines +
 * downscaled). Windows come from the shared boxWindowGeometry and pixels
 * from the shared readPngPixel, so output bytes equal the unfused path
 * exactly; Uint8 sums are exact in float64, so accumulation order cannot
 * drift. Half-float rounding order is untouched — this path only ever
 * sees Uint8 samples.
 */
export function expandAndBoxAverage(
	raw: Uint8Array,
	width: number,
	height: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	bitDepth: number,
	max: number,
): DecodedImage {
	const { nw, nh, x0, x1, y0, y1 } = boxWindowGeometry(width, height, max)
	const out = new Uint8Array(nw * nh * 4)
	const stride = width * bytesPerPixel
	const sample = bitDepth === 16 ? 2 : 1
	// Format dispatch happens once, above the window loops: one kernel per
	// colorType, mirroring the per-dtype box kernels in
	// texture-downscale.ts, so the hot loops hold no per-pixel format
	// branch. Alpha-key presence folds into an impossible key (-1), so
	// opaque and keyed inputs share a kernel; only the pixel-data key
	// match remains per pixel. Accumulation order (sy outer, sx inner,
	// R/G/B/A) matches boxInt's comps===4 fast path, so output bytes equal
	// the unfused path exactly; Uint8 sums are exact in float64, so
	// accumulation order cannot drift. Half-float rounding order is
	// untouched — this path only ever sees Uint8 samples. Anything
	// decodePng rejects (unknown colorType, palette-less index) keeps the
	// legacy shared-pixel loop byte-for-byte.
	switch (colorType) {
		case 6:
			fusedRgba(raw, stride, bytesPerPixel, sample, out, nw, nh, x0, x1, y0, y1)
			break
		case 4:
			fusedGrayAlpha(raw, stride, bytesPerPixel, sample, out, nw, nh, x0, x1, y0, y1)
			break
		case 2:
			if (sample === 1)
				fusedRgb8(raw, stride, bytesPerPixel, keyedRgb8Key(transparency), out, nw, nh, x0, x1, y0, y1)
			else fusedRgb16(raw, stride, bytesPerPixel, keyedRgb16Key(transparency), out, nw, nh, x0, x1, y0, y1)
			break
		case 0:
			if (sample === 1)
				fusedGray8(raw, stride, bytesPerPixel, keyedGray8Key(transparency), out, nw, nh, x0, x1, y0, y1)
			else fusedGray16(raw, stride, bytesPerPixel, keyedGray16Key(transparency), out, nw, nh, x0, x1, y0, y1)
			break
		case 3:
			if (palette) {
				fusedPalette(
					raw,
					stride,
					bytesPerPixel,
					buildPaletteLut(palette, transparency),
					out,
					nw,
					nh,
					x0,
					x1,
					y0,
					y1,
				)
			} else {
				// No palette: keep the legacy shared-pixel loop byte-for-byte.
				fusedGeneric(
					raw,
					stride,
					bytesPerPixel,
					colorType,
					palette,
					transparency,
					sample,
					out,
					nw,
					nh,
					x0,
					x1,
					y0,
					y1,
				)
			}
			break
		default:
			fusedGeneric(
				raw,
				stride,
				bytesPerPixel,
				colorType,
				palette,
				transparency,
				sample,
				out,
				nw,
				nh,
				x0,
				x1,
				y0,
				y1,
			)
			break
	}
	return { data: out, width: nw, height: nh }
}

// Impossible alpha keys (-1): no usable tRNS entry means the key match
// below never fires, so opaque and keyed inputs share one kernel with no
// presence dispatch per pixel. Key packing matches the isTransparent*
// guards exactly (length checks included).
function keyedGray8Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 2 ? transparency[1] : -1
}

function keyedGray16Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 2 ? (transparency[0] << 8) | transparency[1] : -1
}

function keyedRgb8Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 6
		? transparency[1] * 0x10000 + transparency[3] * 0x100 + transparency[5]
		: -1
}

function keyedRgb16Key(transparency: Uint8Array | null): number {
	return transparency && transparency.length >= 6
		? transparency[0] * 2 ** 40 +
				transparency[1] * 2 ** 32 +
				transparency[2] * 2 ** 24 +
				transparency[3] * 2 ** 16 +
				transparency[4] * 2 ** 8 +
				transparency[5]
		: -1
}

/** Indexed color → RGBA lookup built once: bounds and tRNS guards evaluate here, never per pixel. */
function buildPaletteLut(palette: Uint8Array, transparency: Uint8Array | null): Uint8Array {
	const lut = new Uint8Array(256 * 4)
	for (let i = 0; i < 256; i++) {
		const entry = i * 3
		const dst = i * 4
		lut[dst] = entry + 2 < palette.length ? palette[entry] : 0
		lut[dst + 1] = entry + 2 < palette.length ? palette[entry + 1] : 0
		lut[dst + 2] = entry + 2 < palette.length ? palette[entry + 2] : 0
		lut[dst + 3] = transparency && i < transparency.length ? transparency[i] : 255
	}
	return lut
}

function fusedRgba(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					sumR += raw[s]
					sumG += raw[s + sample]
					sumB += raw[s + 2 * sample]
					sumA += raw[s + 3 * sample]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGrayAlpha(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const g = raw[s]
					sumR += g
					sumG += g
					sumB += g
					sumA += raw[s + sample]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGray8(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const g = raw[rowStart + sx * bytesPerPixel]
					sumR += g
					sumG += g
					sumB += g
					sumA += g === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedGray16(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const g = raw[s]
					sumR += g
					sumG += g
					sumB += g
					sumA += ((raw[s] << 8) | raw[s + 1]) === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedRgb8(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const r = raw[s]
					const g = raw[s + 1]
					const b = raw[s + 2]
					sumR += r
					sumG += g
					sumB += b
					sumA += r * 0x10000 + g * 0x100 + b === key ? 0 : 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedRgb16(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	key: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const s = rowStart + sx * bytesPerPixel
					const r = raw[s]
					const g = raw[s + 2]
					const b = raw[s + 4]
					sumR += r
					sumG += g
					sumB += b
					sumA +=
						raw[s] * 2 ** 40 +
							raw[s + 1] * 2 ** 32 +
							raw[s + 2] * 2 ** 24 +
							raw[s + 3] * 2 ** 16 +
							raw[s + 4] * 2 ** 8 +
							raw[s + 5] ===
						key
							? 0
							: 255
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function fusedPalette(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	lut: Uint8Array,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					const l = raw[rowStart + sx * bytesPerPixel] * 4
					sumR += lut[l]
					sumG += lut[l + 1]
					sumB += lut[l + 2]
					sumA += lut[l + 3]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

/** Legacy shared-pixel loop for inputs decodePng rejects; kept byte-for-byte. */
function fusedGeneric(
	raw: Uint8Array,
	stride: number,
	bytesPerPixel: number,
	colorType: number,
	palette: Uint8Array | null,
	transparency: Uint8Array | null,
	sample: number,
	out: Uint8Array,
	nw: number,
	nh: number,
	x0: Int32Array,
	x1: Int32Array,
	y0: Int32Array,
	y1: Int32Array,
): void {
	const px = new Uint8Array(4)
	for (let y = 0; y < nh; y++) {
		const ya = y0[y]
		const yb = y1[y]
		for (let x = 0; x < nw; x++) {
			const xa = x0[x]
			const xb = x1[x]
			const count = (xb - xa) * (yb - ya)
			let sumR = 0
			let sumG = 0
			let sumB = 0
			let sumA = 0
			for (let sy = ya; sy < yb; sy++) {
				const rowStart = sy * (stride + 1) + 1
				for (let sx = xa; sx < xb; sx++) {
					readPngPixel(raw, rowStart + sx * bytesPerPixel, colorType, palette, transparency, sample, px, 0)
					sumR += px[0]
					sumG += px[1]
					sumB += px[2]
					sumA += px[3]
				}
			}
			const dst = (y * nw + x) * 4
			out[dst] = Math.round(sumR / count)
			out[dst + 1] = Math.round(sumG / count)
			out[dst + 2] = Math.round(sumB / count)
			out[dst + 3] = Math.round(sumA / count)
		}
	}
}

function isTransparentRgb(red: number, green: number, blue: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency &&
		transparency.length >= 6 &&
		transparency[1] === red &&
		transparency[3] === green &&
		transparency[5] === blue
	)
}

function isTransparentGray(gray: number, transparency: Uint8Array | null): boolean {
	return !!transparency && transparency.length >= 2 && transparency[1] === gray
}

// 16-bit tRNS entries are full big-endian sample values (unlike the 8-bit
// path above, which reads the low byte encoders fill in).
function isTransparentRgb16(raw: Uint8Array, src: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency &&
		transparency.length >= 6 &&
		transparency[0] === raw[src] &&
		transparency[1] === raw[src + 1] &&
		transparency[2] === raw[src + 2] &&
		transparency[3] === raw[src + 3] &&
		transparency[4] === raw[src + 4] &&
		transparency[5] === raw[src + 5]
	)
}

function isTransparentGray16(raw: Uint8Array, src: number, transparency: Uint8Array | null): boolean {
	return (
		!!transparency && transparency.length >= 2 && transparency[0] === raw[src] && transparency[1] === raw[src + 1]
	)
}
