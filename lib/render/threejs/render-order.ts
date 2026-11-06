// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Shared transparent-sort keys (three.js draws ascending renderOrder).
 * Baked playfields draw first, balls and glow quads ride above the
 * playfield, and cabinet buttons draw last so they survive the HUD pass.
 */
export const RenderOrder = {
	bakedPlayfield: -1,
	ball: 1,
	bulbGlow: 10,
	cabinetButton: 100,
} as const
