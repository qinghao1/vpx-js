// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Rounds to 9 significant digits (debug helper mimicking C single rounding). */
export function fr(v: number): number {
	if (v === 0) return 0
	const exp = Math.floor(Math.log10(Math.abs(v)))
	const f = 10 ** (9 - exp)
	return Math.round(v * f) / f
}

/** Converts to single precision. */
export function f4(v: number): number {
	return Math.fround(v)
}

/** Degrees → radians (single precision). */
export function degToRad(deg: number): number {
	return f4(deg * (Math.PI / 180))
}

/** Radians → degrees (single precision). */
export function radToDeg(rad: number): number {
	return f4(rad * (180 / Math.PI))
}
