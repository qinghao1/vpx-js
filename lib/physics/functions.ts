// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Rubber elasticity with velocity falloff.
 * @see https://github.com/vpinball/vpinball/blob/master/physics.cpp
 * @param falloff 0 = no falloff, 1 = half COR at 1 m/s (18.53 units)
 */
export function elasticityWithFalloff(elasticity: number, falloff: number, vel: number): number {
	return falloff > 0 ? elasticity / (1 + falloff * Math.abs(vel) * (1 / 18.53)) : elasticity
}

export const HARD_SCATTER = 0.0

/**
 * Collision-relevant root of a·t² + b·t + c = 0, or NaN when the
 * discriminant is negative. Roots straddling zero yield the later (exit)
 * root, otherwise the earlier (entry) root wins.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp
 */
export function solveQuadratic(a: number, b: number, c: number): number {
	const discr = b * b - 4 * a * c
	if (discr < 0) return NaN
	const s = Math.sqrt(discr)
	const inv = -0.5 / a
	const t1 = (b + s) * inv
	const t2 = (b - s) * inv
	return t1 * t2 < 0 ? Math.max(t1, t2) : Math.min(t1, t2)
}
