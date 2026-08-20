import { type BufferGeometry, Color, DoubleSide, FrontSide } from 'three'
import { color, Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { RenderInfo } from '../../game/irenderable.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'
import {
	applyDepthBias,
	BALL_METALNESS,
	BALL_ROUGHNESS,
	DISABLE_LIGHTING_THRESHOLD,
	getGlobalEmissionScale,
	isBaked,
	onGlobalEmissionScaleChange,
	pendingKeyFor,
	RE_BAKE_MAP,
	RE_BAKE_MAT,
	setGlobalEmissionScale,
} from './material-shared.js'

export { getGlobalEmissionScale, setGlobalEmissionScale } from './material-shared.js'

import type { IMaterialGenerator } from './imaterial-generator.js'
import { createAdditiveOverlayNodeMaterial } from './nodes/additive-overlay-node.js'
import { createDynamicBallNodeMaterial } from './nodes/ball-reflection-node.js'
import { createUnshadedBakedNodeMaterial } from './nodes/unshaded-baked-node.js'
import type { ThreeMapGenerator } from './three-map-generator.js'

export class ThreeNodeMaterialGenerator implements IMaterialGenerator {
	private readonly cachedMaterials: Record<string, any> = {}

	constructor(private readonly mapGenerator: ThreeMapGenerator) {
		onGlobalEmissionScaleChange(v => {
			for (const mat of Object.values(this.cachedMaterials)) {
				const u = (mat as any)?.userData?.__uEmissionScale
				if (u && typeof u.value === 'number') u.value = v
			}
		})
	}

	public getInitialMaterial(obj: RenderInfo<BufferGeometry>, opts: MeshConvertOptions): any {
		return this.getMaterial(
			opts.applyMaterials && obj.material ? obj.material : undefined,
			opts.applyTextures && obj.map ? obj.map.getName() : undefined,
			opts.applyTextures && obj.normalMap ? obj.normalMap.getName() : undefined,
			opts.applyTextures && obj.envMap ? obj.envMap.getName() : undefined,
			opts.applyTextures && obj.material?.emissiveMap ? obj.material.emissiveMap.getName() : undefined,
			!!obj.isTransparent,
			obj.depthBias ?? 0,
			obj.disableLighting,
			!!obj.addBlend,
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
		addBlend = false,
		backfacesEnabled?: boolean,
	): any {
		const key = this.getKey(
			material,
			map,
			normalMap,
			envMap,
			emissiveMap,
			isTransparent,
			depthBias,
			disableLighting,
			addBlend,
			backfacesEnabled,
		)
		const cached = this.cachedMaterials[key]
		if (cached) return cached

		const baked = isBaked(material, map, disableLighting)
		const isBall = material?.name === 'ball'

		let mat: any

		if (baked) {
			let tex: any = null
			if (map && this.mapGenerator.hasTexture(map)) tex = this.mapGenerator.getTexture(map)
			else if (emissiveMap && this.mapGenerator.hasTexture(emissiveMap))
				tex = this.mapGenerator.getTexture(emissiveMap)
			if (tex) {
				const tint = material ? new Color(material.baseColor).getHex() : 0xffffff
				mat = createUnshadedBakedNodeMaterial({
					map: tex,
					tint,
					emissionScale: getGlobalEmissionScale(),
					doubleSided: backfacesEnabled !== false,
					polygonOffset: depthBias !== 0 || true,
					polygonOffsetFactor: -1,
					polygonOffsetUnits: -1,
				})
				mat.name = material ? `material:${material.name}` : 'material:baked'
				;(mat.userData as any).__isBaked = true
				;(mat.userData as any).__backfacesEnabled = backfacesEnabled
				applyDepthBias(mat, depthBias)
				this.cachedMaterials[key] = mat
				return mat
			}
		}

		if (addBlend) {
			let tex: any = null
			if (map && this.mapGenerator.hasTexture(map)) tex = this.mapGenerator.getTexture(map)
			else if (emissiveMap && this.mapGenerator.hasTexture(emissiveMap))
				tex = this.mapGenerator.getTexture(emissiveMap)
			if (tex) {
				mat = createAdditiveOverlayNodeMaterial(
					tex,
					1.0,
					material ? new Color(material.baseColor).getHex() : 0xffffff,
				)
				mat.name = material ? `material:${material.name}` : 'material:additive'
				;(mat.userData as any).__addBlend = true
				applyDepthBias(mat, depthBias)
				this.cachedMaterials[key] = mat
				return mat
			}
		}

		if (isBall && envMap && this.mapGenerator.hasTexture(envMap)) {
			const envTex = this.mapGenerator.getTexture(envMap)
			const playTex = map && this.mapGenerator.hasTexture(map) ? this.mapGenerator.getTexture(map) : undefined
			const tint = material?.baseColor ? new Color(material.baseColor).getHex() : 0xc0c0c0
			mat = createDynamicBallNodeMaterial(envTex, playTex as any, tint)
			mat.name = `material:${material!.name}`
			applyDepthBias(mat, depthBias)
			this.cachedMaterials[key] = mat
			return mat
		}

		mat = new MeshStandardNodeMaterial()
		this.applyMaterial(mat, material, isTransparent)
		this.applyMap(mat, map)
		this.applyNormalMap(mat, normalMap)
		this.applyEnvMap(mat, envMap)
		this.applyEmissiveMap(mat, material, emissiveMap)
		mat.transparent = isTransparent
		mat.depthWrite = !isTransparent
		if (baked) {
			;(mat.userData as any).__isBaked = true
			;(mat.userData as any).__backfacesEnabled = backfacesEnabled
		}
		;(mat.userData as any).__addBlend = !!addBlend
		mat.toneMapped = false
		applyDepthBias(mat, depthBias)
		if (material?.name === 'ball') {
			mat.envMapIntensity = 1
		} else if (material?.isMetal && (mat.userData as any).pendingEnvMap) {
			mat.metalness = 0.25
			mat.roughness = 0.35
			mat.envMapIntensity = 0.6
		}
		this.cachedMaterials[key] = mat
		return mat
	}

	public applyMaterial(threeMaterial: any, material?: Material, isTransparent = false): void {
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

	public applyMap(threeMaterial: any, map?: string): void {
		this.applyTexture(threeMaterial, 'map', map)
	}

	public applyNormalMap(threeMaterial: any, normalMap?: string): void {
		this.applyTexture(threeMaterial, 'normalMap', normalMap)
	}

	public applyEnvMap(threeMaterial: any, envMap?: string): void {
		this.applyTexture(threeMaterial, 'envMap', envMap, m => {
			m.envMapIntensity = 1
		})
	}

	public applyEmissiveMap(threeMaterial: any, material?: Material, emissiveMap?: string): void {
		this.applyTexture(threeMaterial, 'emissiveMap', emissiveMap, () => {
			if (material) threeMaterial.emissive.set(material.emissiveColor || 0)
		})
	}

	private applyTexture(
		mat: any,
		key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap',
		name?: string,
		init?: (m: any) => void,
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
			const ud = (mat as any).userData as any
			for (const texKey of ['map', 'normalMap', 'envMap', 'emissiveMap'] as const) {
				const pendingKey = pendingKeyFor(texKey)
				const name = ud[pendingKey]
				if (!name || !this.mapGenerator.hasTexture(name)) continue
				const tex = this.mapGenerator.getTexture(name)
				;(mat as any)[texKey] = tex
				;(tex as any).name = name
				if (texKey === 'map' && ud.__isBaked) {
					const tint = (mat as any).color ? ((mat as any).color as Color).getHex() : 0xffffff
					const uEmissionScale = uniform(getGlobalEmissionScale())
					const uTint = color(tint)
					const texNode = texture(tex, uv())
					mat.colorNode = Fn(() => {
						const t = texNode
						return vec4(t.rgb.mul(uTint).mul(uEmissionScale), t.a)
					})()
					;(mat.userData as any).__uEmissionScale = uEmissionScale
				}
				if (texKey === 'envMap') (mat as any).envMapIntensity = 1
				delete ud[pendingKey]
				;(mat as any).needsUpdate = true
				fixed++
			}
		}
		return fixed
	}

	public getKey(
		material?: Material,
		map?: string,
		normalMap?: string,
		envMap?: string,
		emissiveMap?: string,
		isTransparent = false,
		depthBias = 0,
		disableLighting?: number,
		addBlend = false,
		backfacesEnabled?: boolean,
	): string {
		return `${material?.name ?? 'none'}:${map ?? 'none'}:${normalMap ?? 'none'}:${envMap ?? 'none'}:${emissiveMap ?? 'none'}:${isTransparent ? 't' : 'o'}:${depthBias}:${disableLighting ?? 'x'}:${addBlend ? 'a' : 'o'}:${backfacesEnabled ?? 'x'}`
	}
}
