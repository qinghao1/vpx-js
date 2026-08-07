// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Rubber elasticity with velocity falloff.
 * @param falloff 0 = no falloff, 1 = half COR at 1 m/s (18.53 units)
 */
export function elasticityWithFalloff(elasticity: number, falloff: number, vel: number): number {
	return falloff > 0 ? elasticity / (1 + falloff * Math.abs(vel) * (1 / 18.53)) : elasticity
}

export const HARD_SCATTER = 0.0
