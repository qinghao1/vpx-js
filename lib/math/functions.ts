const solution: [number, number] = [0, 0]

/**
 * Solves a quadratic equation `a·x² + b·x + c = 0`.
 *
 * @returns Two roots or `undefined` if the discriminant is negative.
 * @remarks The returned tuple is recycled — copy it before calling again.
 */
export function solveQuadraticEq(a: number, b: number, c: number): [number, number] | undefined {
	let discr = b * b - 4 * a * c
	if (discr < 0) return undefined
	discr = Math.sqrt(discr)
	const invA = -0.5 / a
	solution[0] = (b + discr) * invA
	solution[1] = (b - discr) * invA
	return solution
}

/** Clamps `x` to `[min, max]`. */
export function clamp(x: number, min: number, max: number): number {
	return Math.min(Math.max(x, min), max)
}
