/* istanbul ignore next: debugging helper */

/**
 * Rounds a double to a rounded single-precision value with 9 significant digits.
 * Used for debugging to mimic C's single-precision rounding.
 */
export function fr(f8: number): number {
	if (f8 === 0) return 0
	const exp = Math.floor(Math.log10(Math.abs(f8)))
	const f = 10 ** (9 - exp)
	return Math.round(f8 * f) / f
}

/** Converts a double to single precision via `Math.fround`. */
export function f4(f8: number): number {
	return Math.fround(f8)
}

/** Converts degrees to radians (single precision). */
export function degToRad(deg: number): number {
	return f4(f4(deg) * f4(Math.PI / 180))
}

/** Converts radians to degrees (single precision). */
export function radToDeg(deg: number): number {
	return f4(f4(deg) * f4(180 / Math.PI))
}
