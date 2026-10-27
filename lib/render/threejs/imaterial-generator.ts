import type { BufferGeometry, Object3D, Material as ThreeMaterial } from 'three'
import type { RenderInfo } from '../../game/interfaces.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'

/** Shared contract for classic and TSL node material generators. */
export interface IMaterialGenerator {
	getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): ThreeMaterial
	/**
	 * Builds (or returns the cached) material for one mesh. Positional order
	 * is part of the contract — depthBias is a transparent *sort key*, not a
	 * polygon offset; disableLighting is a 0..∞ BDL mix, not a boolean (0 =
	 * lit, 1 = 2× fullbright, >1 = HDR multiples); alphaTestValue in (0, 1]
	 * enables cutout, anything else disables it. Trailing addBlendMode is the
	 * tri-state additive mode (0 plain, 1 additive, 2 absorb); absent derives
	 * from addBlend.
	 */
	getMaterial(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
		isTransparent?: boolean,
		depthBias?: number,
		disableLighting?: number,
		addBlend?: boolean,
		backfacesEnabled?: boolean,
		alphaTestValue?: number,
		addBlendMode?: number,
	): ThreeMaterial
	applyMaterial(threeMaterial: ThreeMaterial, material?: Material, isTransparent?: boolean): void
	applyMap(threeMaterial: ThreeMaterial, map?: string): void
	applyNormalMap(threeMaterial: ThreeMaterial, normalMap?: string): void
	applyEnvMap(threeMaterial: ThreeMaterial, envMap?: string): void
	applyEmissiveMap(threeMaterial: ThreeMaterial, material?: Material, emissiveMap?: string): void
	resolvePendingTextures(): number
	/**
	 * Resolve pending texture slots on every material under a scene root.
	 * Covers forked scene materials that never entered the generator cache.
	 *
	 * @param root Scene root to traverse
	 */
	resolvePendingInScene(root: Object3D): number
	getKey(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
		isTransparent?: boolean,
		depthBias?: number,
		disableLighting?: number,
		addBlend?: boolean,
		backfacesEnabled?: boolean,
		alphaTestValue?: number,
		addBlendMode?: number,
	): string
}
