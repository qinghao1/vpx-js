// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { RenderInfo } from '../../game/irenderable.js'
import {
	type BufferGeometry,
	Color,
	DoubleSide,
	FrontSide,
	MeshStandardMaterial,
	type Material as ThreeMaterial,
} from '../../refs.node.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'
import type { ThreeMapGenerator } from './three-map-generator.js'

const BALL_METALNESS = 1
const BALL_ROUGHNESS = 0.08

const RE_BAKE_MAT = /bake/i
const RE_BAKE_MAP = /bake|nestmap/i
const BAKED_EMISSIVE = 0.85
const BAKED_ROUGH = 0.75
const BAKED_METAL = 0.1
const DISABLE_LIGHTING_THRESHOLD = 0.5

const pendingKeyFor = (key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap'): string =>
	`pending${key.charAt(0).toUpperCase()}${key.slice(1)}`

/** Generates/caches Three.js materials. */
export class ThreeMaterialGenerator {
	private readonly cachedMaterials: Record<string, ThreeMaterial> = {}

	constructor(private readonly mapGenerator: ThreeMapGenerator) {}

	public getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): ThreeMaterial {
		return this.getMaterial(
			opts.applyMaterials && obj.material ? obj.material : undefined,
			opts.applyTextures && obj.map ? obj.map.getName() : undefined,
			opts.applyTextures && obj.normalMap ? obj.normalMap.getName() : undefined,
			opts.applyTextures && obj.envMap ? obj.envMap.getName() : undefined,
			opts.applyTextures && obj.material?.emissiveMap ? obj.material.emissiveMap.getName() : undefined,
			!!obj.isTransparent,
			obj.depthBias ?? 0,
			obj.disableLighting,
			obj.backfacesEnabled,
		)
	}

	public getMaterial(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
		isTransparent = false,
		depthBias = 0,
		disableLighting?: number,
		backfacesEnabled?: boolean,
	): ThreeMaterial {
		const key = this.getKey(
			material,
			map,
			normalMap,
			envMap,
			emissiveMap,
			isTransparent,
			depthBias,
			disableLighting,
			backfacesEnabled,
		)
		const cached = this.cachedMaterials[key]
		if (cached) return cached
		const m = new MeshStandardMaterial()
		this.applyMaterial(m, material, isTransparent)
		this.applyMap(m, map)
		this.applyNormalMap(m, normalMap)
		this.applyEnvMap(m, envMap)
		this.applyEmissiveMap(m, material, emissiveMap)
		m.transparent = isTransparent
		m.depthWrite = !isTransparent
		if (this.isBaked(material, map, disableLighting)) {
			this.applyBaked(m, (m as any).map, backfacesEnabled)
			;(m.userData as any).__isBaked = true
			;(m.userData as any).__backfacesEnabled = backfacesEnabled
		}
		if (depthBias !== 0) {
			m.polygonOffset = true
			m.polygonOffsetFactor = 0
			const scaled = depthBias / 500
			const clamped = Math.max(-10, Math.min(10, scaled))
			const units = Math.abs(clamped) < 0.25 ? Math.sign(clamped) * 0.25 : clamped
			m.polygonOffsetUnits = Math.abs(depthBias) < 0.5 ? 0 : units
			if (m.polygonOffsetUnits === 0) m.polygonOffset = false
		}
		if (material?.name === 'ball') {
			m.envMapIntensity = 1
		} else if (material?.isMetal && (m.userData as any).pendingEnvMap) {
			m.metalness = 0.25
			m.roughness = 0.35
			m.envMapIntensity = 0.6
		}
		this.cachedMaterials[key] = m
		return m
	}

	public applyMaterial(threeMaterial: MeshStandardMaterial, material?: Material, isTransparent = false): void {
		if (!material) {
			if (isTransparent) {
				threeMaterial.color = new Color(0xc0c0c0)
				threeMaterial.metalness = 0
				threeMaterial.roughness = 0.4
				threeMaterial.opacity = 0.4
			} else {
				threeMaterial.color = new Color(0xb469ff)
				threeMaterial.metalness = 0
				threeMaterial.roughness = 0
				threeMaterial.opacity = 1
			}
			threeMaterial.side = isTransparent ? DoubleSide : FrontSide
			return
		}
		threeMaterial.name = `material:${material.name}`
		if (material.name === 'ball') {
			threeMaterial.metalness = BALL_METALNESS
			threeMaterial.roughness = BALL_ROUGHNESS
		} else {
			threeMaterial.metalness = material.isMetal ? 1 : 0
			threeMaterial.roughness = Math.max(0, Math.min(1, 1 - material.roughness))
		}
		threeMaterial.color = new Color(material.baseColor)
		threeMaterial.opacity = material.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		threeMaterial.side = material.name === 'ball' || isTransparent ? DoubleSide : FrontSide
		if (material.emissiveIntensity > 0) {
			threeMaterial.emissive = new Color(material.emissiveColor)
			threeMaterial.emissiveIntensity = material.emissiveIntensity
		}
	}

	public applyMap(threeMaterial: MeshStandardMaterial, map?: string): void {
		this.applyTexture(threeMaterial, 'map', map)
	}

	public applyNormalMap(threeMaterial: MeshStandardMaterial, normalMap?: string): void {
		this.applyTexture(threeMaterial, 'normalMap', normalMap)
	}

	public applyEnvMap(threeMaterial: MeshStandardMaterial, envMap?: string): void {
		this.applyTexture(threeMaterial, 'envMap', envMap, m => {
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
		key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap',
		name?: string,
		init?: (m: MeshStandardMaterial) => void,
	): void {
		if (!name) return
		if (!this.mapGenerator.hasTexture(name)) {
			;(mat.userData as any)[pendingKeyFor(key)] = name
			return
		}
		;(mat as any)[key] = this.mapGenerator.getTexture(name)
		;((mat as any)[key] as { name: string }).name = name
		init?.(mat)
		mat.needsUpdate = true
	}

	public resolvePendingTextures(): number {
		let fixed = 0
		for (const mat of Object.values(this.cachedMaterials)) {
			const ud = mat.userData as any
			for (const texKey of ['map', 'normalMap', 'envMap', 'emissiveMap'] as const) {
				const pendingKey = pendingKeyFor(texKey)
				const name = ud[pendingKey]
				if (!name || !this.mapGenerator.hasTexture(name)) continue
				const tex = this.mapGenerator.getTexture(name)
				;(mat as any)[texKey] = tex
				;(tex as any).name = name
				if (texKey === 'envMap') (mat as MeshStandardMaterial).envMapIntensity = 1
				if (texKey === 'map') {
					const m = mat as MeshStandardMaterial
					const isBakedPending =
						ud.__isBaked || this.isBaked(undefined, name) || (m.name && RE_BAKE_MAT.test(m.name))
					if (isBakedPending) this.applyBaked(m, tex, ud.__backfacesEnabled)
				}
				delete ud[pendingKey]
				mat.needsUpdate = true
				fixed++
			}
		}
		return fixed
	}

	private isBaked(material?: Material, map?: string, disableLighting?: number): boolean {
		if (disableLighting !== undefined && disableLighting > DISABLE_LIGHTING_THRESHOLD) return true
		// TODO: name heuristic is a content convention, not an engine contract.
		// vpinball never checks name; it uses PrimitiveData.disableLightingTop (see primitive.cpp:1135).
		// Keep as fallback until all RenderInfo producers expose disableLighting.
		if (material && RE_BAKE_MAT.test(material.name)) return true
		if (map && RE_BAKE_MAP.test(map) && !map.toLowerCase().startsWith('vr_')) return true
		return false
	}

	private applyBaked(mat: MeshStandardMaterial, mapTex?: unknown, backfacesEnabled?: boolean): void {
		const tex = (mapTex as any) ?? (mat as any).map
		if (tex) {
			;(mat as any).map = tex
			;(mat as any).emissiveMap = tex
			if (!mat.emissive) (mat as any).emissive = new Color(0xffffff)
			else mat.emissive.set(0xffffff)
			mat.emissiveIntensity = 1
			mat.color.set(0x000000)
		} else {
			mat.color.set(0xffffff)
			if (mat.emissive) mat.emissive.set(0x000000)
			mat.emissiveIntensity = 0
		}
		mat.side = backfacesEnabled === true ? DoubleSide : FrontSide
		mat.toneMapped = true
		mat.roughness = BAKED_ROUGH
		mat.metalness = BAKED_METAL
		;(mat as any).envMapIntensity = 0
		mat.needsUpdate = true
	}

	private getKey(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
		isTransparent = false,
		depthBias = 0,
		disableLighting?: number,
		backfacesEnabled?: boolean,
	): string {
		const bias = depthBias === 0 ? 0 : Math.round(depthBias / 500)
		const baked = this.isBaked(material, map, disableLighting)
		const lightKey = baked ? 'b' : 'x'
		const backKey = backfacesEnabled ? '1' : '0'
		return `${material?.name ?? 'none'}:${map ?? 'none'}:${normalMap ?? 'none'}:${envMap ?? 'none'}:${emissiveMap ?? 'none'}:${isTransparent ? 't' : 'o'}:${bias}:${lightKey}:${backKey}`
	}
}
