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

export class ThreeMaterialGenerator {
	private readonly cachedMaterials: { [key: string]: ThreeMaterial } = {}

	private readonly mapGenerator: ThreeMapGenerator

	constructor(mapGenerator: ThreeMapGenerator) {
		this.mapGenerator = mapGenerator
	}

	public getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): ThreeMaterial {
		const threeMaterial = this.getMaterial(
			opts.applyMaterials && obj.material ? obj.material : undefined,
			opts.applyTextures && obj.map ? obj.map.getName() : undefined,
			opts.applyTextures && obj.normalMap ? obj.normalMap.getName() : undefined,
			opts.applyTextures && obj.envMap ? obj.envMap.getName() : undefined,
			opts.applyTextures && obj.material && obj.material.emissiveMap ? obj.material.emissiveMap.getName() : undefined,
		)
		threeMaterial.transparent = !!obj.isTransparent
		return threeMaterial
	}

	public getMaterial(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
	): ThreeMaterial {
		const key = this.getKey(material, map, normalMap, envMap, emissiveMap)
		if (this.cachedMaterials[key]) {
			return this.cachedMaterials[key]
		}

		const threeMaterial = new MeshStandardMaterial()
		this.applyMaterial(threeMaterial, material)
		this.applyMap(threeMaterial, map)
		this.applyNormalMap(threeMaterial, normalMap)
		this.applyEnvMap(threeMaterial, envMap)
		this.applyEmissiveMap(threeMaterial, material, emissiveMap)

		this.cachedMaterials[key] = threeMaterial
		return threeMaterial
	}

	public applyMaterial(threeMaterial: MeshStandardMaterial, material?: Material): void {
		if (!material) {
			return
		}
		threeMaterial.name = `material:${material!.name}`
		threeMaterial.metalness = material.isMetal ? 1.0 : 0.0
		threeMaterial.roughness = Math.max(0, 1 - material.roughness / 1.5)
		threeMaterial.color = new Color(material.baseColor)
		threeMaterial.opacity = material.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		threeMaterial.side = DoubleSide

		if (material.emissiveIntensity > 0) {
			threeMaterial.emissive = new Color(material.emissiveColor)
			threeMaterial.emissiveIntensity = material.emissiveIntensity
		}
	}

	public applyMap(threeMaterial: MeshStandardMaterial, map?: string) {
		if (map && this.mapGenerator.hasTexture(map)) {
			threeMaterial.map = this.mapGenerator.getTexture(map)
			threeMaterial.map.name = map
			threeMaterial.needsUpdate = true
		}
	}

	public applyNormalMap(threeMaterial: MeshStandardMaterial, normalMap?: string) {
		if (normalMap && this.mapGenerator.hasTexture(normalMap)) {
			threeMaterial.normalMap = this.mapGenerator.getTexture(normalMap)
			threeMaterial.normalMap.name = normalMap
			threeMaterial.normalMap.anisotropy = 16
			threeMaterial.needsUpdate = true
		}
	}

	public applyEnvMap(threeMaterial: MeshStandardMaterial, envMap?: string) {
		if (envMap && this.mapGenerator.hasTexture(envMap)) {
			threeMaterial.envMap = this.mapGenerator.getTexture(envMap)
			threeMaterial.envMap.name = envMap
			threeMaterial.envMapIntensity = 1
			threeMaterial.needsUpdate = true
		}
	}

	public applyEmissiveMap(threeMaterial: MeshStandardMaterial, material?: Material, emissiveMap?: string) {
		if (emissiveMap && this.mapGenerator.hasTexture(emissiveMap)) {
			threeMaterial.emissiveMap = this.mapGenerator.getTexture(emissiveMap)
			threeMaterial.emissiveMap.name = emissiveMap
			if (material) {
				threeMaterial.emissive.set(material.emissiveColor || 0x0)
			}
			threeMaterial.needsUpdate = true
		}
	}

	private getKey(material?: Material, map?: string, normalMap?: string, envMap?: string, emissiveMap?: string): string {
		return (
			(material ? material.name : 'none') +
			':' +
			(map || 'none') +
			':' +
			(normalMap || 'none') +
			':' +
			(envMap || 'none') +
			':' +
			(emissiveMap || 'none')
		)
	}
}
