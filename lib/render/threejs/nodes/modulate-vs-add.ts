// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CustomBlending, OneMinusSrcColorFactor, ReverseSubtractEquation, SrcAlphaFactor } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'

/** Native `m_modulate_vs_add` window (flasher.cpp, light.cpp): 0 disables the blend, 1 reads wrong. */
export const MODULATE_MIN = 0.0001
export const MODULATE_MAX = 0.9999

/** Clamp m_modulate_vs_add into (0,1); fallback 0.9. Insert tables authoring ≈1.0 land on 0.9999. */
export function clampModulateVsAdd(value?: number, fallback = 0.9): number {
	const v = value ?? fallback
	return Number.isNaN(v) ? MODULATE_MAX : Math.max(MODULATE_MIN, Math.min(MODULATE_MAX, v))
}

/** Native negatively-encoded composite blend state (SRC_ALPHA/INV_SRC_COLOR under REVSUBTRACT). */
export function applyModulateVsAddBlending(mat: MeshBasicNodeMaterial): void {
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcColorFactor
	mat.blendEquation = ReverseSubtractEquation
	mat.blendSrcAlpha = SrcAlphaFactor
	mat.blendDstAlpha = OneMinusSrcColorFactor
	mat.blendEquationAlpha = ReverseSubtractEquation
}
