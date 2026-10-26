// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, ReinhardToneMapping } from 'three'

// Native user-selectable ids only (TM_REINHARD..TM_NEUTRAL, 0-3); anything else
// (legacy/internal ids such as TM_WCG_SPLINE=256) falls back to AgX via
// GetValidToneMapper — mirrored by the ?? AgXToneMapping below.
const TONE_TABLE: number[] = [ReinhardToneMapping, AgXToneMapping, ACESFilmicToneMapping, NeutralToneMapping]

export function resolveToneMapping(tm?: number): number {
	return TONE_TABLE[tm ?? -1] ?? AgXToneMapping
}

export function clampExposure(value: unknown, max = 2): number {
	const v = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(v)) return 1
	return Math.max(0.1, Math.min(max, v))
}

export function applyRendererToneMapping(
	renderer: any,
	data: { toneMapper?: number; exposure?: number } | undefined,
	isLowQuality: boolean,
): void {
	renderer.toneMapping = resolveToneMapping(data?.toneMapper)
	renderer.toneMappingExposure = clampExposure(data?.exposure, isLowQuality ? 1.5 : 2)
}
