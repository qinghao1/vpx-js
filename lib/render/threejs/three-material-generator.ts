// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { RenderInfo } from '../../game/irenderable.js'
import {
	type BufferGeometry,
	Color,
	DoubleSide,
	MeshStandardMaterial,
	type Material as ThreeMaterial,
} from '../../refs.node.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'
import type { ThreeMapGenerator } from './three-map-generator.js'

/** Generates/caches Three.js materials. */
export class ThreeMaterialGenerator {
	private readonly cachedMaterials: Record<string, ThreeMaterial> = {}

	constructor(private readonly mapGenerator: ThreeMapGenerator) {}

	public getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): ThreeMaterial {
		const mat = this.getMaterial(
			opts.applyMaterials && obj.material ? obj.material : undefined,
			opts.applyTextures && obj.map ? obj.map.getName() : undefined,
			opts.applyTextures && obj.normalMap ? obj.normalMap.getName() : undefined,
			opts.applyTextures && obj.envMap ? obj.envMap.getName() : undefined,
			opts.applyTextures && obj.material?.emissiveMap ? obj.material.emissiveMap.getName() : undefined,
		)
		mat.transparent = !!obj.isTransparent
		return mat
	}

	public getMaterial(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
	): ThreeMaterial {
		const key = this.getKey(material, map, normalMap, envMap, emissiveMap)
		if (this.cachedMaterials[key]) return this.cachedMaterials[key]!
		const m = new MeshStandardMaterial()
		this.applyMaterial(m, material)
		this.applyMap(m, map)
		this.applyNormalMap(m, normalMap)
		this.applyEnvMap(m, envMap)
		this.applyEmissiveMap(m, material, emissiveMap)
		this.cachedMaterials[key] = m
		return m
	}

	public applyMaterial(threeMaterial: MeshStandardMaterial, material?: Material): void {
		if (!material) return
		threeMaterial.name = `material:${material.name}`
		threeMaterial.metalness = material.isMetal ? 1 : 0
		threeMaterial.roughness = Math.max(0, Math.min(1, 1 - material.roughness))
		threeMaterial.color = new Color(material.baseColor)
		threeMaterial.opacity = material.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		threeMaterial.side = DoubleSide
		if (material.emissiveIntensity > 0) {
			threeMaterial.emissive = new Color(material.emissiveColor)
			threeMaterial.emissiveIntensity = material.emissiveIntensity
		}
	}

	public applyMap(threeMaterial: MeshStandardMaterial, map?: string): void {
		this.applyTexture(threeMaterial, 'map', map)
	}

	public applyNormalMap(threeMaterial: MeshStandardMaterial, normalMap?: string): void {
		if (normalMap && this.mapGenerator.hasTexture(normalMap)) {
			threeMaterial.normalMap = this.mapGenerator.getTexture(normalMap)
			threeMaterial.normalMap.name = normalMap
			threeMaterial.needsUpdate = true
		}
	}

	public applyEnvMap(threeMaterial: MeshStandardMaterial, envMap?: string): void {
		this.applyTexture(threeMaterial, 'envMap', envMap, (m) => {
			m.envMapIntensity = 1
		})
	}

	public applyEmissiveMap(threeMaterial: MeshStandardMaterial, material?: Material, emissiveMap?: string): void {
		this.applyTexture(threeMaterial, 'emissiveMap', emissiveMap, () => {
			if (material) threeMaterial.emissive.set(material.emissiveColor || 0)
		})
	}

	private applyTexture(
		mat: MeshStandardMaterial,
		key: 'map' | 'envMap' | 'emissiveMap',
		name?: string,
		init?: (m: MeshStandardMaterial) => void,
	): void {
		if (!name || !this.mapGenerator.hasTexture(name)) return
		;(mat as unknown as Record<string, unknown>)[key] = this.mapGenerator.getTexture(name)
		;((mat as unknown as Record<string, { name: string }>)[key] as { name: string }).name = name
		init?.(mat)
		mat.needsUpdate = true
	}

	private getKey(material?: Material, map?: string, normalMap?: string, envMap?: string, emissiveMap?: string): string {
		return `${material?.name ?? 'none'}:${map ?? 'none'}:${normalMap ?? 'none'}:${envMap ?? 'none'}:${emissiveMap ?? 'none'}`
	}
}
