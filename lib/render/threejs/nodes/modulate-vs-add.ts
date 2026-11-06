// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { CustomBlending, OneMinusSrcColorFactor, ReverseSubtractEquation, SrcAlphaFactor } from 'three'
import { float, vec4 } from 'three/tsl'
import type { MeshBasicNodeMaterial, Node } from 'three/webgpu'

/**
 * Native "modulate vs add" blend of AB_ADD flashers (`flasher.cpp`) and bulb
 * halos (`light.cpp`). Over the {@link modulateVsAddOutput} encoding it yields
 * `dst + L·((1−m) + m·dst)`: lit backdrops are amplified, dark ones stay dark.
 */
export function applyModulateVsAddBlending(mat: MeshBasicNodeMaterial): void {
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcColorFactor
	mat.blendEquation = ReverseSubtractEquation
	mat.blendSrcAlpha = SrcAlphaFactor
	mat.blendDstAlpha = OneMinusSrcColorFactor
	mat.blendEquationAlpha = ReverseSubtractEquation
}

/**
 * Light `L` encoded as `(−m·L, 1/m − 1)`, as `fs_flasher.sc` / `fs_light.sc`
 * emit it. Assign to `outputNode`: NodeMaterial clamps `colorNode` output to
 * `max(0)`, which would zero it. Needs a float target, like native's HDR buffer.
 */
export function modulateVsAddOutput(light: Node<'vec3'> | Node<'color'>, modulate: Node<'float'>) {
	return vec4(light.mul(modulate).negate(), float(1).div(modulate).sub(1))
}
