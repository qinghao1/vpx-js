// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Backend-neutral protocol for primitive node materials.
 *
 * The three.js node materials (`render/threejs/nodes/primitive-bdl-node.ts`) tag
 * themselves with `__primitiveKind` and stash live TSL uniforms in `userData`;
 * the VPT updater (`primitive-updater.ts`) drives those uniforms on script writes.
 * Both sides share this module so the render layer keeps depending on vpt, never
 * the reverse. It imports nothing — every material is duck-typed through
 * `userData`, the same way sibling updaters (flasher) already poke uniforms.
 */

export const PRIMITIVE_BDL_KIND = 'bdl'
export const PRIMITIVE_ADDITIVE_KIND = 'additive'

/** Minimal color surface the protocol writes through (three.js Color satisfies this). */
export interface ProtocolColor {
	set(hex: number): ProtocolColor
	getHex?(): number
	multiplyScalar(n: number): unknown
}

export interface PrimitiveBdlUpdate {
	albedo?: number
	opacity?: number
	bdl?: number
	below?: number
}

export interface PrimitiveAdditiveUpdate {
	tint?: number
	intensity?: number
}

// Native (material.sh DoPointLight tail + lightLoop): each point light returns
// mix(litResult, diffuse, BDL) for BDL outside {0, 1}, and lightLoop SUMS TWO
// such lights (NUM_LIGHTS=2), so the composite carries 2*BDL x diffuse while
// the summed lit result scales by (1-BDL). Only exactly 1.0 takes the
// kept-for-compat 2x diffuse path, which equals 2*BDL at BDL=1, so upstream is
// continuous through 1.0 and the composite must be too (a 1x carry would pop
// 2x on script fades through 1.0 and render HDR inserts half-bright).
// Past 1 the composite does NOT extrapolate the mix: native's flare regime is
// dominated by 2*BDL*diffuse because its per-light result is ~0 in the dark
// cabinet, while the composite's lit input is three.js scene lighting on another
// scale — scaling it by (1-BDL) would subtract scene light and blacken inserts
// that render as bright HDR flares upstream. Diffuse clamps at 0; the overdrive
// rides emissive only, which can only add light.
export function bdlDiffuseFactor(bdl: number): number {
	return bdl >= 1 ? 0 : 1 - bdl
}

export function bdlEmissiveCarry(bdl: number): number {
	return bdl === 1 ? 2 : 2 * bdl
}

export function belowFactor(below: number): number {
	return Math.max(0, 1 - below)
}

/**
 * Upstream alpha-blend enable rule (Shader.cpp `SetMaterial`, primitive.cpp callers):
 * blend only when the file enables opacity AND (the map carries alpha — VPT
 * `Texture::IsOpaque() == false` — OR the effective opacity is meaningfully
 * below 1). The script-fade term additionally flips dynamic fades transparent
 * even for file-opaque materials, matching the updater's long-standing rule.
 * Single definition used by creation (`ThreeNodeMaterialGenerator`) and script
 * updates (`PrimitiveUpdater`) so the first frame agrees with later frames.
 * Lives here (not in render/material-shared) so both layers share it without
 * the vpt layer depending on render.
 */
export function resolveTransparency(
	material: { isOpacityActive?: boolean; opacity?: number } | undefined,
	// VPT Texture (carries isOpaque) or three texture (no alpha signal: conservative false).
	tex: unknown,
	effectiveOpacity?: number,
): { opacity: number; transparent: boolean } {
	const active = !!material?.isOpacityActive
	const fileOpacity = active ? Math.min(1, Math.max(0, material?.opacity ?? 1)) : 1
	const opacity =
		effectiveOpacity === undefined ? fileOpacity : Math.min(1, Math.max(0, Math.min(fileOpacity, effectiveOpacity)))
	const hasAlpha = !!tex && (tex as { isOpaque?: unknown }).isOpaque === false
	const transparent = (active && (hasAlpha || fileOpacity < 0.999)) || opacity < Math.min(fileOpacity, 0.999)
	return { opacity, transparent }
}

export function isPrimitiveNodeMaterial(mat: unknown): boolean {
	const kind = (mat as { userData?: { __primitiveKind?: string } })?.userData?.__primitiveKind
	return kind === PRIMITIVE_BDL_KIND || kind === PRIMITIVE_ADDITIVE_KIND
}

export function getPrimitiveKind(mat: unknown): string | undefined {
	return (mat as { userData?: { __primitiveKind?: string } })?.userData?.__primitiveKind
}

export function updatePrimitiveBdl(mat: unknown, opts: PrimitiveBdlUpdate): void {
	const targetMaterial = mat as { userData?: Record<string, unknown> } | null | undefined
	if (!targetMaterial || targetMaterial.userData?.__primitiveKind !== PRIMITIVE_BDL_KIND) return
	const userData = targetMaterial.userData as Record<string, unknown>
	if (opts.albedo !== undefined) (userData.__uAlbedo as { value: ProtocolColor }).value.set(opts.albedo)
	if (opts.opacity !== undefined) (userData.__uAlpha as { value: number }).value = opts.opacity
	if (opts.bdl !== undefined) {
		;(userData.__uBDL as { value: number }).value = opts.bdl
		;(userData.__uLitF as { value: number }).value = bdlDiffuseFactor(opts.bdl)
		;(userData.__uCarry as { value: number }).value = bdlEmissiveCarry(opts.bdl)
	}
	if (opts.below !== undefined && userData.__uBelowF) {
		;(userData.__uBelowF as { value: number }).value = belowFactor(opts.below)
		userData.__below = opts.below
	}
}

export function updatePrimitiveAdditive(mat: unknown, opts: PrimitiveAdditiveUpdate): void {
	const targetMaterial = mat as { userData?: Record<string, unknown> } | null | undefined
	if (!targetMaterial || targetMaterial.userData?.__primitiveKind !== PRIMITIVE_ADDITIVE_KIND) return
	const userData = targetMaterial.userData as Record<string, unknown>
	if (opts.tint !== undefined) (userData.__uTint as { value: ProtocolColor }).value.set(opts.tint)
	if (opts.intensity !== undefined) (userData.__uIntensity as { value: number }).value = opts.intensity
	if (opts.tint !== undefined || opts.intensity !== undefined) {
		const tint = ((userData.__uTint as { value: ProtocolColor }).value.getHex?.() ?? 0xffffff) as number
		const intensity = (userData.__uIntensity as { value: number }).value as number
		;((userData.__uFlat as { value: ProtocolColor }).value as ProtocolColor).set(tint).multiplyScalar(intensity)
	}
}
