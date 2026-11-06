// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Degrees to radians. Backend-neutral (three's `MathUtils.degToRad` is exactly this). */
export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180
