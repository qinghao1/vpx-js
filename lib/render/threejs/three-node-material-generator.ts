import { BackSide, Color, DoubleSide, FrontSide, type Object3D } from 'three'
import { Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import type { RenderInfo } from '../../game/interfaces.js'
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

type PendingTexKey = 'map' | 'normalMap' | 'envMap' | 'emissiveMap'

const PENDING_KEYS_BY_KIND = {
	// Baked map rides the baked node slot but normal/env/emissive maps bind via
	// the classic slots (see applyArrivedTexture), so all four must resolve here
	// or a script-applied map that arrives via stream/demand strands forever.
	baked: ['map', 'normalMap', 'envMap', 'emissiveMap'],
	primitive: ['map', 'normalMap', 'envMap'],
	classic: ['map', 'normalMap', 'envMap', 'emissiveMap'],
} as const satisfies Record<string, readonly PendingTexKey[]>

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
		const baked = isBaked(material, map)
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
				tint: baseHex,
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
			metalness: isBall ? BALL_METALNESS : material?.isMetal ? 1 : 0,
			roughness: isBall ? BALL_ROUGHNESS : material ? Math.max(0, Math.min(1, 1 - material.roughness)) : 0.4,
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
		try {
			;(threeMaterial.userData as any).__baseColor = new Color(material.baseColor).getHex()
		} catch {
			// Expected: TypeError if userData is frozen — baked tint falls back to white.
		}
		if (isPrimitiveNodeMaterial(threeMaterial)) {
			// colorNode/opacityNode/emissiveNode override the classic slots, so
			// classic color/opacity/emissive writes are dead here — script tint
			// must go through updatePrimitiveBdl/updatePrimitiveAdditive instead.
			const doubleSided = (threeMaterial.userData as Record<string, unknown>)?.__doubleSided
			threeMaterial.side = doubleSided !== false || isTransparent ? DoubleSide : BackSide
			return
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
		this.applyTexture(threeMaterial, 'envMap', envMap, mat => {
			mat.envMapIntensity = 1
		})
	}

	public applyEmissiveMap(threeMaterial: any, material?: Material, emissiveMap?: string): void {
		this.applyTexture(threeMaterial, 'emissiveMap', emissiveMap, () => {
			if (material) threeMaterial.emissive.set(material.emissiveColor || 0)
		})
	}

	/**
	 * Classic slot assignment shared by every material kind: clears the pending
	 * key and assigns the texture (with init + program update) unless the slot
	 * already holds it. Returns whether the slot changed.
	 */
	private assignClassicSlot(
		mat: any,
		key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap',
		tex: any,
		name: string,
		init?: (material: any) => void,
	): boolean {
		delete (mat as any).userData[pendingKeyFor(key)]
		if ((mat as any)[key] === tex) return false
		;(mat as any)[key] = tex
		;((mat as any)[key] as { name: string }).name = name
		init?.(mat)
		mat.needsUpdate = true
		return true
	}

	private applyTexture(
		mat: any,
		key: 'map' | 'normalMap' | 'envMap' | 'emissiveMap',
		name?: string,
		init?: (material: any) => void,
	): void {
		if (!name) return
		if (!this.mapGenerator.hasTexture(name)) {
			// Primitives carry no emissive path (the arrival branch below
			// deletes this key unbound and no resolver consumes it), so never
			// stash it: demandPendingMaps would load a texture nobody binds.
			if (key === 'emissiveMap' && isPrimitiveNodeMaterial(mat)) {
				delete (mat.userData as any)[pendingKeyFor(key)]
				return
			}
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
				delete (mat as any).userData[pendingKeyFor(key)]
			} else {
				this.assignClassicSlot(mat, key, tex, name, init)
			}
			return
		}
		if (isPrimitiveNodeMaterial(mat)) {
			// Native primitives carry a single albedo map; normal/env maps ride the classic
			// slots so lighting stays intact. EmissiveMap is intentionally ignored here (no
			// native primitive emissive path), so applyEmissiveMap is a no-op on these
			// materials even though IMaterialGenerator requires the method.
			if (key === 'map') {
				const changed = setPrimitiveMap(mat, tex, name)
				const cut = this.restoreCutout(mat, tex)
				if (changed || cut) mat.needsUpdate = true
				delete (mat as any).userData[pendingKeyFor(key)]
			} else if (key === 'normalMap' || key === 'envMap') {
				this.assignClassicSlot(mat, key, tex, name, init)
			} else {
				delete (mat as any).userData[pendingKeyFor(key)]
			}
			return
		}
		if (!this.assignClassicSlot(mat, key, tex, name, init)) return
		const userData = (mat as any).userData as any
		const restoredCutout = key === 'map' ? this.restoreCutout(mat, tex) : false
		if (key === 'map' && userData?.__isBaked) {
			this.refreshBakedMapTint(mat, tex, userData)
			mat.needsUpdate = true
		} else if (!restoredCutout) {
			mat.needsUpdate = true
		}
	}

	public resolvePendingTextures(): number {
		let fixed = 0
		for (const mat of Object.values(this.cachedMaterials)) fixed += this.resolvePendingOnMaterial(mat)
		return fixed
	}

	/** Resolve pending slots on every material under a scene root. Covers forked scene
	 * materials that never entered the cache (the same per-material logic as above). */
	public resolvePendingInScene(root: Object3D): number {
		let fixed = 0
		const seen = new Set<any>()
		root.traverse((node: any) => {
			const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
			for (const mat of mats) {
				if (seen.has(mat)) continue
				seen.add(mat)
				fixed += this.resolvePendingOnMaterial(mat)
			}
		})
		return fixed
	}

	private resolvePendingOnMaterial(mat: any): number {
		const userData = (mat as any).userData as any
		const keys = isBakedNodeMaterial(mat)
			? PENDING_KEYS_BY_KIND.baked
			: isPrimitiveNodeMaterial(mat)
				? PENDING_KEYS_BY_KIND.primitive
				: PENDING_KEYS_BY_KIND.classic
		let fixed = 0
		for (const texKey of keys) {
			const pendingKey = pendingKeyFor(texKey)
			const name = userData[pendingKey]
			if (!name || !this.mapGenerator.hasTexture(name)) continue
			const tex = this.mapGenerator.getTexture(name)
			if (this.applyArrivedTexture(mat, userData, texKey, tex, name)) fixed++
			delete userData[pendingKey]
		}
		return fixed
	}

	private applyArrivedTexture(mat: any, userData: any, texKey: PendingTexKey, tex: any, name: string): boolean {
		if (isBakedNodeMaterial(mat)) {
			if (texKey !== 'map') {
				return this.assignClassicSlot(mat, texKey, tex, name, (target: any) => {
					if (texKey === 'envMap') target.envMapIntensity = 1
				})
			}
			const changed = setBakedMap(mat, tex, name)
			const cut = this.restoreCutout(mat, tex)
			if (changed || cut) (mat as any).needsUpdate = true
			return changed || cut
		}
		if (isPrimitiveNodeMaterial(mat)) {
			// Short-circuit preserved: a remapped map already flags the program change,
			// so the cutout restore only runs when the map did not change.
			if (texKey === 'map') return setPrimitiveMap(mat, tex, name) || this.restoreCutout(mat, tex)
			if ((mat as any)[texKey] === tex) return false
			;(mat as any)[texKey] = tex
			;(tex as any).name = name
			if (texKey === 'envMap') (mat as any).envMapIntensity = 1
			;(mat as any).needsUpdate = true
			return true
		}
		;(mat as any)[texKey] = tex
		;(tex as any).name = name
		if (texKey === 'map' && userData.__isBaked) this.refreshBakedMapTint(mat, tex, userData)
		if (texKey === 'envMap') (mat as any).envMapIntensity = 1
		if (texKey === 'map') this.restoreCutout(mat, tex)
		;(mat as any).needsUpdate = true
		return true
	}

	private refreshBakedMapTint(mat: any, tex: any, userData: any): void {
		const uTint = (userData.__uTint as any) ?? uniform(new Color(0xffffff))
		if ((uTint as any).value) (uTint as any).value.set(0xffffff)
		const texNode = texture(tex, uv())
		mat.colorNode = Fn(() => vec4(texNode.rgb.mul(uTint), texNode.a))()
		userData.__uTint = uTint
		userData.__uTintColor = uTint
		mat.side = DoubleSide
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
