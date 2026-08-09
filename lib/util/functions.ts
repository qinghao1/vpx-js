// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MathUtils } from 'three'

/** Solves a·x² + b·x + c = 0. @returns [root1, root2] or undefined if no real roots. */
export function solveQuadraticEq(a: number, b: number, c: number): [number, number] | undefined {
	const discr = b * b - 4 * a * c
	if (discr < 0) return undefined
	const sqrt = Math.sqrt(discr)
	const inv = -0.5 / a
	return [(b + sqrt) * inv, (b - sqrt) * inv]
}

export const clamp = MathUtils.clamp
