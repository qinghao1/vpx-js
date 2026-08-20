// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as THREE from 'three'

const TONE_TABLE: number[] = [
	THREE.ReinhardToneMapping,
	THREE.AgXToneMapping,
	THREE.ACESFilmicToneMapping,
	THREE.NeutralToneMapping,
	THREE.AgXToneMapping,
	THREE.LinearToneMapping,
]

export function resolveToneMapping(tm?: number): number {
	return TONE_TABLE[tm ?? -1] ?? THREE.ACESFilmicToneMapping
}

export function clampExposure(value: unknown, max = 2.5): number {
	const v = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(v)) return 1
	return Math.max(0.1, Math.min(max, v))
}

export function applyRendererToneMapping(
	renderer: any,
	data: { toneMapper?: number; exposure?: number } | undefined,
	isLowQuality: boolean,
): void {
	if (isLowQuality) {
		renderer.toneMapping = THREE.NoToneMapping
		renderer.toneMappingExposure = 1
		return
	}
	renderer.toneMapping = resolveToneMapping(data?.toneMapper)
	renderer.toneMappingExposure = clampExposure(data?.exposure, 2)
}
