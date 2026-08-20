import type { BufferGeometry, Material as ThreeMaterial } from 'three'
import type { RenderInfo } from '../../game/irenderable.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'

/** Shared contract for classic and TSL node material generators. */
export interface IMaterialGenerator {
	getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): ThreeMaterial
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
	): ThreeMaterial
	applyMaterial(threeMaterial: ThreeMaterial, material?: Material, isTransparent?: boolean): void
	applyMap(threeMaterial: ThreeMaterial, map?: string): void
	applyNormalMap(threeMaterial: ThreeMaterial, normalMap?: string): void
	applyEnvMap(threeMaterial: ThreeMaterial, envMap?: string): void
	applyEmissiveMap(threeMaterial: ThreeMaterial, material?: Material, emissiveMap?: string): void
	resolvePendingTextures(): number
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
	): string
}
