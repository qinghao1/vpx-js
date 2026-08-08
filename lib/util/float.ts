// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// biome-ignore lint/correctness/noPrecisionLoss: FLT_MIN single-precision constant (intentional)
export const FLT_MIN = 1.175494350822287507968736537222245677819e-38
// biome-ignore lint/correctness/noPrecisionLoss: FLT_MAX single-precision constant (intentional)
export const FLT_MAX = 340282346638528859811704183484516925440

/** Rounds to 9 significant digits (debug helper mimicking C single rounding). */
export function fr(v: number): number {
	if (v === 0) return 0
	const exp = Math.floor(Math.log10(Math.abs(v)))
	const f = 10 ** (9 - exp)
	return Math.round(v * f) / f
}

/** No-op in JS — JS numbers are f64, skipping fround avoids per-component overhead in hot vector ops. */
export function f4(v: number): number {
	return v
}

/** Quantizes [0,1] to unsigned bits — mirrors math.h `quantizeUnsigned<Bits>`. */
export function quantizeUnsigned(bits: number, x: number): number {
	const n = (1 << bits) - 1
	return Math.min((x * (1 << bits)) | 0, n)
}

/** Dequantizes unsigned bits to [0,1]. */
export function dequantizeUnsigned(bits: number, i: number): number {
	const n = (1 << bits) - 1
	return Math.min(i / n, 1)
}

export const quantizeUnsignedPercent = (x: number): number => quantizeUnsigned(7, x)
export const dequantizeUnsignedPercent = (i: number): number => dequantizeUnsigned(7, i)

/** Degrees → radians (single precision). */
export function degToRad(deg: number): number {
	return f4(deg * (Math.PI / 180))
}

/** Radians → degrees (single precision). */
export function radToDeg(rad: number): number {
	return f4(rad * (180 / Math.PI))
}
