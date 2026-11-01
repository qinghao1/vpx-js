// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CustomBlending, OneMinusSrcColorFactor, ReverseSubtractEquation, SrcAlphaFactor } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'

/** Valid `m_modulate_vs_add` window is (0,1). */
export const MODULATE_MIN = 0.0001
export const MODULATE_MAX = 0.9999

/** Native default (`Settings_properties.inl`). */
export const DEFAULT_MODULATE = 0.9

export function clampModulateVsAdd(value?: number, fallback = DEFAULT_MODULATE): number {
	const v = value ?? fallback
	return Number.isNaN(v) ? MODULATE_MAX : Math.max(MODULATE_MIN, Math.min(MODULATE_MAX, v))
}

export function applyModulateVsAddBlending(mat: MeshBasicNodeMaterial): void {
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcColorFactor
	mat.blendEquation = ReverseSubtractEquation
	mat.blendSrcAlpha = SrcAlphaFactor
	mat.blendDstAlpha = OneMinusSrcColorFactor
	mat.blendEquationAlpha = ReverseSubtractEquation
}
