import { BackSide, Color, DoubleSide, FrontSide } from 'three'
import { Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import type { RenderInfo } from '../../game/irenderable.js'
import type { Material } from '../../vpt/material.js'
import type { MeshConvertOptions } from '../irender-api.js'
import type { IMaterialGenerator } from './imaterial-generator.js'
import {
	BALL_METALNESS,
	BALL_ROUGHNESS,
	getGlobalEmissionScale,
	isBaked,
	pendingKeyFor,
	setGlobalEmissionScale,
} from './material-shared.js'
import { createDynamicBallNodeMaterial } from './nodes/ball-reflection-node.js'
import { createBulbGlowNodeMaterial } from './nodes/bulb-glow-node.js'
import {
	createPrimitiveAdditiveMaterial,
	createPrimitiveBdlMaterial,
	isPrimitiveNodeMaterial,
	setPrimitiveMap,
} from './nodes/primitive-bdl-node.js'
import { createUnshadedBakedNodeMaterial, isBakedNodeMaterial, setBakedMap } from './nodes/unshaded-baked-node.js'
import type { ThreeMapGenerator } from './three-map-generator.js'

export { getGlobalEmissionScale, setGlobalEmissionScale } from './material-shared.js'

export class ThreeNodeMaterialGenerator implements IMaterialGenerator {
	private readonly cachedMaterials: Record<string, any> = {}

	constructor(private readonly mapGenerator: ThreeMapGenerator) {}

	private stashCutout(mat: any, alphaTestValue: number, depthBias: number, additive: boolean): void {
		const userData = ((mat as { userData?: Record<string, unknown> }).userData ??= {})
		const validCutout = alphaTestValue > 0 && alphaTestValue <= 1 ? alphaTestValue : 0
		userData.__alphaTestValue = validCutout
		userData.__depthBias = depthBias
		if (!additive && validCutout > 0 && !(mat.alphaTest > 0)) mat.alphaTest = validCutout
	}

	private restoreCutout(mat: any, tex?: any): boolean {
		const userData = (mat as { userData?: Record<string, unknown> })?.userData
		if (!userData || userData.__addBlend || mat.alphaTest > 0) return false
		const cutoutValue =
			(userData.__alphaTestValue as number) ??
			(tex as { userData?: { alphaTestValue?: number } })?.userData?.alphaTestValue ??
			0
		if (cutoutValue > 0 && cutoutValue <= 1) {
			mat.alphaTest = cutoutValue
			mat.needsUpdate = true
			return true
		}
		return false
	}

	public getInitialMaterial(obj: RenderInfo<any>, opts: MeshConvertOptions): any {
		if (obj.bulbGlow) {
			return this.getBulbGlowMaterial(obj.bulbGlow, obj.material)
		}
		const mapTex = obj.map ?? obj.material?.emissiveMap
		const rawAlphaTest = mapTex && !mapTex.isOpaque ? (mapTex.alphaTestValue ?? 0) : 0
		const alphaTestValue = rawAlphaTest > 0 && rawAlphaTest <= 1 ? rawAlphaTest : 0
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
			alphaTestValue,
		)
	}

	private getBulbGlowMaterial(params: NonNullable<RenderInfo<any>['bulbGlow']>, material?: Material): any {
		const key = `bulb.glow:${material?.name ?? 'none'}`
		const cached = this.cachedMaterials[key]
		if (cached) return cached
		const mat = createBulbGlowNodeMaterial({
			color: params.color,
			color2: params.color2,
			centerX: params.centerX,
			centerY: params.centerY,
			falloff: params.falloff,
			falloffPower: params.falloffPower,
			intensity: params.intensity,
			modulateVsAdd: params.modulateVsAdd,
		})
		mat.name = material ? `material:${material.name}` : 'material:bulb.glow'
		this.cachedMaterials[key] = mat
		return mat
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
		alphaTestValue = 0,
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
			alphaTestValue,
		)
		const cached = this.cachedMaterials[key]
		if (cached) return cached

		// Native classifies purely by file flags (primitive.cpp): addBlend selects the unlit
		// additive path, everything else renders lit with a BlendDisableLighting mix. Names,
		// depthBias windows, and on/off substrings must not change the branch.
		const baked = isBaked(material, map, disableLighting)
		const isBall = material?.name === 'ball'
		const baseHex = material ? new Color(material.baseColor).getHex() : 0xffffff
		const mapName = map ?? emissiveMap

		let mat: any

		if (addBlend) {
			const tex =
				(mapName && this.mapGenerator.hasTexture(mapName) && this.mapGenerator.getTexture(mapName)) || null
			mat = createPrimitiveAdditiveMaterial({
				map: tex ?? undefined,
				mapName,
				tint: baseHex,
				intensity: 1,
				alphaTestValue,
				doubleSided: true,
				depthBias,
			})
			mat.name = material ? `material:${material.name}` : 'material:additive'
			;(mat.userData as any).__addBlend = true
			this.stashCutout(mat, alphaTestValue, depthBias, true)
			if (!tex && mapName) (mat.userData as any)[pendingKeyFor('map')] = mapName
			this.cachedMaterials[key] = mat
			return mat
		}

		if (baked) {
			let tex: any = null
			if (map && this.mapGenerator.hasTexture(map)) tex = this.mapGenerator.getTexture(map)
			else if (emissiveMap && this.mapGenerator.hasTexture(emissiveMap))
				tex = this.mapGenerator.getTexture(emissiveMap)
			const pendingName = !tex ? (map ?? emissiveMap) : undefined
			mat = createUnshadedBakedNodeMaterial({
				map: tex ?? undefined,
				mapName: pendingName ?? undefined,
				tint: 0xffffff,
				emissionScale: getGlobalEmissionScale(),
				alphaTestValue,
				doubleSided: backfacesEnabled !== false,
			})
			mat.name = material ? `material:${material.name}` : 'material:baked'
			if (!tex && (map ?? emissiveMap))
				(mat.userData as any)[pendingKeyFor('map')] = (map ?? emissiveMap) as string
			;(mat.userData as any).__isBaked = true
			;(mat.userData as any).__backfacesEnabled = backfacesEnabled
			this.stashCutout(mat, alphaTestValue, depthBias, false)
			this.cachedMaterials[key] = mat
			return mat
		}

		if (isBall && envMap && this.mapGenerator.hasTexture(envMap)) {
			const envTex = this.mapGenerator.getTexture(envMap)
			const tint = material?.baseColor ? new Color(material.baseColor).getHex() : 0xc0c0c0
			mat = createDynamicBallNodeMaterial(envTex, tint)
			mat.name = material ? `material:${material.name}` : 'material:ball'
			this.cachedMaterials[key] = mat
			return mat
		}

		const tex = (mapName && this.mapGenerator.hasTexture(mapName) && this.mapGenerator.getTexture(mapName)) || null
		const matOpacity = material?.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		mat = createPrimitiveBdlMaterial({
			map: tex ?? undefined,
			mapName,
			albedo: baseHex,
			opacity: matOpacity,
			bdl: Math.max(0, disableLighting ?? 0),
			alphaTestValue,
			doubleSided: backfacesEnabled !== false || isTransparent,
			depthBias,
		})
		mat.name = material ? `material:${material.name}` : 'material:primitive'
		this.stashCutout(mat, alphaTestValue, depthBias, false)
		if (!tex && mapName) (mat.userData as any)[pendingKeyFor('map')] = mapName
		this.applyNormalMap(mat, normalMap)
		this.applyEnvMap(mat, envMap)
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
		try {
			;(threeMaterial.userData as any).__baseColor = new Color(material.baseColor).getHex()
		} catch {
			// Expected: TypeError if userData is frozen — baked tint falls back to white.
		}
		threeMaterial.opacity = material.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		if (isPrimitiveNodeMaterial(threeMaterial)) {
			const doubleSided = (threeMaterial.userData as Record<string, unknown>)?.__doubleSided
			threeMaterial.side = doubleSided !== false || isTransparent ? DoubleSide : BackSide
			return
		}
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
		this.applyTexture(threeMaterial, 'envMap', envMap, mat => {
			mat.envMapIntensity = 1
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
		init?: (material: any) => void,
	): void {
		if (!name) return
		if (!this.mapGenerator.hasTexture(name)) {
			;(mat.userData as any)[pendingKeyFor(key)] = name
			if (key === 'map') {
				if (isBakedNodeMaterial(mat)) {
					if (setBakedMap(mat, null, name)) mat.needsUpdate = true
				} else if (isPrimitiveNodeMaterial(mat)) {
					if (setPrimitiveMap(mat, null, name)) mat.needsUpdate = true
				}
			}
			return
		}
		const tex = this.mapGenerator.getTexture(name)
		if (isBakedNodeMaterial(mat)) {
			if (key === 'map') {
				const changed = setBakedMap(mat, tex, name)
				const cut = this.restoreCutout(mat, tex)
				if (changed || cut) mat.needsUpdate = true
			} else {
				if ((mat as any)[key] === tex) {
					delete (mat as any).userData[pendingKeyFor(key)]
					return
				}
				;(mat as any)[key] = tex
				;((mat as any)[key] as { name: string }).name = name
				init?.(mat)
				mat.needsUpdate = true
			}
			delete (mat as any).userData[pendingKeyFor(key)]
			return
		}
		if (isPrimitiveNodeMaterial(mat)) {
			// Native primitives carry a single albedo map; normal/env maps ride the classic
			// slots so lighting stays intact, while emissiveMap does not exist natively.
			if (key === 'map') {
				const changed = setPrimitiveMap(mat, tex, name)
				const cut = this.restoreCutout(mat, tex)
				if (changed || cut) mat.needsUpdate = true
			} else if (key === 'normalMap' || key === 'envMap') {
				if ((mat as any)[key] === tex) {
					delete (mat as any).userData[pendingKeyFor(key)]
					return
				}
				;(mat as any)[key] = tex
				;((mat as any)[key] as { name: string }).name = name
				init?.(mat)
				mat.needsUpdate = true
			}
			delete (mat as any).userData[pendingKeyFor(key)]
			return
		}
		if ((mat as any)[key] === tex) {
			const userData = (mat as any).userData as any
			delete userData[pendingKeyFor(key)]
			return
		}
		;(mat as any)[key] = tex
		;((mat as any)[key] as { name: string }).name = name
		init?.(mat)
		const userData = (mat as any).userData as any
		delete userData[pendingKeyFor(key)]
		const restoredCutout = key === 'map' ? this.restoreCutout(mat, tex) : false
		if (key === 'map' && userData?.__isBaked) {
			const uTint = (userData.__uTint as any) ?? uniform(new Color(0xffffff))
			if ((uTint as any).value) (uTint as any).value.set(0xffffff)
			const texNode = texture(tex, uv())
			mat.colorNode = Fn(() => vec4(texNode.rgb.mul(uTint), texNode.a))()
			userData.__uTint = uTint
			userData.__uTintColor = uTint
			mat.side = DoubleSide
			mat.needsUpdate = true
		} else if (restoredCutout) {
			// restoreCutout already flagged the program change.
		} else {
			mat.needsUpdate = true
		}
	}

	public resolvePendingTextures(): number {
		let fixed = 0
		for (const mat of Object.values(this.cachedMaterials)) {
			const userData = (mat as any).userData as any
			if (isBakedNodeMaterial(mat)) {
				const pendingKey = pendingKeyFor('map')
				const name = userData[pendingKey]
				if (name && this.mapGenerator.hasTexture(name)) {
					const tex = this.mapGenerator.getTexture(name)
					const changed = setBakedMap(mat, tex, name)
					const cut = this.restoreCutout(mat, tex)
					delete userData[pendingKey]
					if (changed || cut) {
						;(mat as any).needsUpdate = true
						fixed++
					}
				}
				continue
			}
			if (isPrimitiveNodeMaterial(mat)) {
				for (const texKey of ['map', 'normalMap', 'envMap'] as const) {
					const pendingKey = pendingKeyFor(texKey)
					const name = userData[pendingKey]
					if (!name || !this.mapGenerator.hasTexture(name)) continue
					const tex = this.mapGenerator.getTexture(name)
					let changed = false
					if (texKey === 'map') {
						changed = setPrimitiveMap(mat, tex, name) || this.restoreCutout(mat, tex)
					} else {
						if ((mat as any)[texKey] === tex) {
							delete userData[pendingKey]
							continue
						}
						;(mat as any)[texKey] = tex
						;(tex as any).name = name
						if (texKey === 'envMap') (mat as any).envMapIntensity = 1
						;(mat as any).needsUpdate = true
						changed = true
					}
					delete userData[pendingKey]
					if (changed) {
						if (texKey === 'map') (mat as any).needsUpdate = (mat as any).needsUpdate || true
						fixed++
					}
				}
				continue
			}
			for (const texKey of ['map', 'normalMap', 'envMap', 'emissiveMap'] as const) {
				const pendingKey = pendingKeyFor(texKey)
				const name = userData[pendingKey]
				if (!name || !this.mapGenerator.hasTexture(name)) continue
				const tex = this.mapGenerator.getTexture(name)
				;(mat as any)[texKey] = tex
				;(tex as any).name = name
				if (texKey === 'map' && userData.__isBaked) {
					const uTint = (userData.__uTint as any) ?? uniform(new Color(0xffffff))
					if ((uTint as any).value) (uTint as any).value.set(0xffffff)
					const texNode = texture(tex, uv())
					mat.colorNode = Fn(() => vec4(texNode.rgb.mul(uTint), texNode.a))()
					;(mat.userData as any).__uTint = uTint
					;(mat.userData as any).__uTintColor = uTint
					mat.side = DoubleSide
				}
				if (texKey === 'envMap') (mat as any).envMapIntensity = 1
				if (texKey === 'map') this.restoreCutout(mat, tex)
				delete userData[pendingKey]
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
		alphaTestValue = 0,
	): string {
		return `${material?.name ?? 'none'}:${map ?? 'none'}:${normalMap ?? 'none'}:${envMap ?? 'none'}:${emissiveMap ?? 'none'}:${isTransparent ? 't' : 'o'}:${depthBias}:${disableLighting ?? 'x'}:${addBlend ? 'a' : 'o'}:${backfacesEnabled ?? 'x'}:${alphaTestValue}`
	}
}
