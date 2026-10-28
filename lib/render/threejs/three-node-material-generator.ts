import { Color, DoubleSide, type Object3D } from 'three'
import { Fn, texture, uniform, uv, vec4 } from 'three/tsl'
import type { RenderInfo } from '../../game/interfaces.js'
import type { Material } from '../../vpt/material.js'
import { resolveTransparency } from '../../vpt/primitive/primitive-material-protocol.js'
import type { MeshConvertOptions } from '../irender-api.js'
import type { IMaterialGenerator } from './imaterial-generator.js'
import {
	BALL_METALNESS,
	BALL_ROUGHNESS,
	isBaked,
	normalizePendingKeys,
	pendingKeyFor,
	setGlobalEmissionScale,
} from './material-shared.js'
import { getSlots } from './material-slots.js'
import { createDynamicBallNodeMaterial } from './nodes/ball-reflection-node.js'
import { createBulbGlowNodeMaterial } from './nodes/bulb-glow-node.js'
import {
	applyAbsorbBlendState,
	createPrimitiveAdditiveMaterial,
	createPrimitiveBdlMaterial,
	isPrimitiveNodeMaterial,
	setPrimitiveMap,
	sideFor,
} from './nodes/primitive-bdl-node.js'
import { createUnshadedBakedNodeMaterial, isBakedNodeMaterial, setBakedMap } from './nodes/unshaded-baked-node.js'
import type { ThreeMapGenerator } from './three-map-generator.js'

export { getGlobalEmissionScale, setGlobalEmissionScale } from './material-shared.js'

/**
 * Tri-state additive blend mode mirrored from FlasherData::AddBlendMode
 * (src/parts/flasher.h) without importing the vpt layer: 0 plain alpha,
 * 1 additive, 2 absorb. Only absorb needs distinct handling here — plain and
 * additive both take the established material paths.
 */
export const ADD_BLEND_ABSORB = 2

type PendingTexKey = 'map' | 'normalMap' | 'envMap' | 'emissiveMap'

type MaterialKind = 'baked' | 'primitive' | 'classic'

/** Where one texture slot binds for one material kind. */
type SlotRoute = 'node-map' | 'classic' | 'ignore'

/**
 * Single kind×key routing table replacing the three parallel kind×key
 * dispatches (pending-key enumeration, `applyTexture`, `applyArrivedTexture`).
 * Baked maps ride the baked node slot; normal/env maps ride the classic slots
 * on every kind. Primitives carry no emissive path (native has no primitive
 * emissive slot), so `emissiveMap` on primitives is `ignore`: never stashed,
 * so `demandPendingMaps` loads no texture nobody binds.
 */
const SLOT_ROUTES: Record<MaterialKind, Record<PendingTexKey, SlotRoute>> = {
	baked: { map: 'node-map', normalMap: 'classic', envMap: 'classic', emissiveMap: 'classic' },
	primitive: { map: 'node-map', normalMap: 'classic', envMap: 'classic', emissiveMap: 'ignore' },
	classic: { map: 'classic', normalMap: 'classic', envMap: 'classic', emissiveMap: 'classic' },
}

const PENDING_TEX_KEYS: readonly PendingTexKey[] = ['map', 'normalMap', 'envMap', 'emissiveMap']

const kindOf = (mat: unknown): MaterialKind =>
	isBakedNodeMaterial(mat) ? 'baked' : isPrimitiveNodeMaterial(mat) ? 'primitive' : 'classic'

export class ThreeNodeMaterialGenerator implements IMaterialGenerator {
	private readonly cachedMaterials: Record<string, any> = {}

	constructor(private readonly mapGenerator: ThreeMapGenerator) {}

	private stashCutout(mat: any, alphaTestValue: number, depthBias: number, additive: boolean): void {
		const userData = getSlots(mat)
		const validCutout = alphaTestValue > 0 && alphaTestValue <= 1 ? alphaTestValue : 0
		userData.__alphaTestValue = validCutout
		userData.__depthBias = depthBias
		if (!additive && validCutout > 0 && !(mat.alphaTest > 0)) mat.alphaTest = validCutout
	}

	private restoreCutout(mat: any, tex?: any): boolean {
		if (!mat?.userData) return false
		const userData = getSlots(mat)
		if (userData.__addBlend || mat.alphaTest > 0) return false
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
			obj.addBlendMode,
			(obj as { disableLightingBelow?: number }).disableLightingBelow ?? 0,
			obj.depthWrite,
			// File-level alpha for the base image (VPT Texture.isOpaque), so an
			// alpha-carrying image blends from the first frame — upstream
			// primitive.cpp blends on `!img->IsOpaque()` regardless of the file
			// opacity value.
			(opts.applyTextures ? (obj.map as { isOpaque?: boolean } | undefined) : undefined) ?? null,
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
		addBlendMode?: number,
		disableLightingBelow = 0,
		depthWrite?: boolean,
		// File-level alpha signal for the base image. Textures stream after
		// materials are created, so the bound three.js texture is usually null
		// here and carries no isOpaque flag anyway — the VPT record does.
		vptMap?: { isOpaque?: boolean } | null,
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
			addBlendMode,
			disableLightingBelow,
			depthWrite,
		)
		const cached = this.cachedMaterials[key]
		if (cached) return cached

		// Native classifies purely by file flags (primitive.cpp): addBlend selects the unlit
		// additive path, everything else renders lit with a BlendDisableLighting mix. Names,
		// depthBias windows, and on/off substrings must not change the branch.
		// The unlit bake path additionally needs bake texels (present or still
		// streaming): without any referenced texture it would render the raw
		// author tint flat and unlit — near-black for dark bake materials such
		// as VLM.Bake.Active (Walking Dead flipper bats). Upstream renders those
		// live parts lit (src/parts/flipper.cpp Flipper::Render draws the bat
		// and rubber through the lit basic shader), so fall through to the lit
		// primitive path with the authored color as albedo instead.
		const baked = isBaked(material, map) && !!(map ?? emissiveMap)
		const isBall = material?.name === 'ball'
		const baseHex = material ? new Color(material.baseColor).getHex() : 0xffffff
		const mapName = map ?? emissiveMap

		let mat: any

		if (addBlend) {
			// Absent mode derives from the legacy boolean (additive), matching
			// every pre-existing caller. Only absorb takes its own blend setup.
			const absorb = (addBlendMode ?? 1) === ADD_BLEND_ABSORB
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
			getSlots(mat).__addBlend = true
			// Explicit RenderInfo.depthWrite wins over the non-writing additive default.
			mat.depthWrite = depthWrite ?? false
			if (absorb) {
				// AB_ADD stays plain additive by design; see applyAbsorbBlendState.
				applyAbsorbBlendState(mat)
			}
			this.stashCutout(mat, alphaTestValue, depthBias, true)
			if (!tex && mapName) getSlots(mat)[pendingKeyFor('map')] = mapName
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
				alphaTestValue,
				doubleSided: backfacesEnabled !== false,
			})
			mat.name = material ? `material:${material.name}` : 'material:baked'
			if (!tex && (map ?? emissiveMap)) getSlots(mat)[pendingKeyFor('map')] = (map ?? emissiveMap) as string
			getSlots(mat).__isBaked = true
			getSlots(mat).__backfacesEnabled = backfacesEnabled
			// Explicit RenderInfo.depthWrite wins over the opaque-bake default.
			mat.depthWrite = depthWrite ?? true
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
		// Shared with the updater (see resolveTransparency): the fresh material must already
		// carry the file-level blend state or the first frame disagrees with script updates.
		// Upstream blends when the image carries alpha (primitive.cpp SetMaterial
		// `!img->IsOpaque()`), even at file opacity ~1 — the VPT record carries that
		// signal before the texture streams in.
		const { opacity: matOpacity, transparent: matTransparent } = resolveTransparency(
			material,
			vptMap ?? tex ?? null,
		)
		mat = createPrimitiveBdlMaterial({
			map: tex ?? undefined,
			mapName,
			albedo: baseHex,
			opacity: matOpacity,
			bdl: Math.max(0, disableLighting ?? 0),
			below: Math.max(0, disableLightingBelow),
			metalness: isBall ? BALL_METALNESS : material?.isMetal ? 1 : 0,
			// Upstream roughness is exp2(10*r+1) shininess; three.js takes 0..1 roughness, so the file value is inverted.
			roughness: isBall ? BALL_ROUGHNESS : material ? Math.max(0, Math.min(1, 1 - material.roughness)) : 0.4,
			alphaTestValue,
			doubleSided: backfacesEnabled !== false || isTransparent,
			depthBias,
		})
		mat.name = material ? `material:${material.name}` : 'material:primitive'
		mat.transparent = matTransparent
		// Explicit RenderInfo.depthWrite wins over the transparent-derived default.
		mat.depthWrite = depthWrite ?? !matTransparent
		this.stashCutout(mat, alphaTestValue, depthBias, false)
		if (!tex && mapName) getSlots(mat)[pendingKeyFor('map')] = mapName
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
			threeMaterial.side = sideFor(isTransparent)
			return
		}
		threeMaterial.name = `material:${material.name}`
		if (material.name === 'ball') {
			threeMaterial.metalness = BALL_METALNESS
			threeMaterial.roughness = BALL_ROUGHNESS
		} else {
			threeMaterial.metalness = material.isMetal ? 1 : 0
			// Same inversion as creation: upstream exp2 shininess vs three.js 0..1 roughness.
			threeMaterial.roughness = Math.max(0, Math.min(1, 1 - material.roughness))
		}
		try {
			getSlots(threeMaterial).__baseColor = new Color(material.baseColor).getHex()
		} catch {
			// Expected: TypeError if userData is frozen — baked tint falls back to white.
		}
		if (isPrimitiveNodeMaterial(threeMaterial)) {
			// colorNode/opacityNode/emissiveNode override the classic slots, so
			// classic color/opacity/emissive writes are dead here — script tint
			// must go through updatePrimitiveBdl/updatePrimitiveAdditive instead.
			const doubleSided = getSlots(threeMaterial).__doubleSided
			threeMaterial.side = sideFor(isTransparent ? true : doubleSided)
			return
		}
		threeMaterial.color = new Color(material.baseColor)
		threeMaterial.opacity = material.isOpacityActive ? Math.min(1, Math.max(0, material.opacity)) : 1
		threeMaterial.side = sideFor(material.name === 'ball' || isTransparent)
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
		delete getSlots(mat)[pendingKeyFor(key)]
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
		// Single kind×key dispatch (see SLOT_ROUTES): `ignore` drops the key
		// unbound so demandPendingMaps loads no texture nobody binds, `node-map`
		// rebuilds the node graph, `classic` assigns the classic texture slot.
		const route = SLOT_ROUTES[kindOf(mat)][key]
		if (route === 'ignore') {
			delete getSlots(mat)[pendingKeyFor(key)]
			return
		}
		if (!this.mapGenerator.hasTexture(name)) {
			getSlots(mat)[pendingKeyFor(key)] = name
			if (route === 'node-map') {
				const changed =
					kindOf(mat) === 'baked' ? setBakedMap(mat, null, name) : setPrimitiveMap(mat, null, name)
				if (changed) mat.needsUpdate = true
			}
			return
		}
		const tex = this.mapGenerator.getTexture(name)
		if (route === 'node-map') {
			const changed = kindOf(mat) === 'baked' ? setBakedMap(mat, tex, name) : setPrimitiveMap(mat, tex, name)
			const cut = this.restoreCutout(mat, tex)
			if (changed || cut) mat.needsUpdate = true
			delete getSlots(mat)[pendingKeyFor(key)]
			return
		}
		if (!this.assignClassicSlot(mat, key, tex, name, init)) return
		const userData = getSlots(mat)
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
		const userData = getSlots(mat)
		normalizePendingKeys(userData)
		const kind = kindOf(mat)
		let fixed = 0
		for (const texKey of PENDING_TEX_KEYS) {
			const route = SLOT_ROUTES[kind][texKey]
			const pendingKey = pendingKeyFor(texKey)
			if (route === 'ignore') {
				// Legacy userData may still carry the key; drop it unbound (see SLOT_ROUTES).
				delete userData[pendingKey]
				continue
			}
			const name = userData[pendingKey]
			if (typeof name !== 'string' || !name || !this.mapGenerator.hasTexture(name)) continue
			const tex = this.mapGenerator.getTexture(name)
			if (this.applyArrivedTexture(mat, userData, texKey, tex, name, route)) fixed++
			delete userData[pendingKey]
		}
		return fixed
	}

	private applyArrivedTexture(
		mat: any,
		userData: any,
		texKey: PendingTexKey,
		tex: any,
		name: string,
		route: SlotRoute = SLOT_ROUTES[kindOf(mat)][texKey],
	): boolean {
		if (route === 'ignore') return false
		if (route === 'node-map') {
			// Short-circuit preserved: a remapped map already flags the program change,
			// so the cutout restore only runs when the map did not change.
			const changed = kindOf(mat) === 'baked' ? setBakedMap(mat, tex, name) : setPrimitiveMap(mat, tex, name)
			const cut = this.restoreCutout(mat, tex)
			if (changed || cut) (mat as any).needsUpdate = true
			return changed || cut
		}
		const changed = this.assignClassicSlot(mat, texKey, tex, name, (target: any) => {
			if (texKey === 'envMap') target.envMapIntensity = 1
		})
		if (texKey === 'map') {
			if (userData.__isBaked) {
				this.refreshBakedMapTint(mat, tex, userData)
				;(mat as any).needsUpdate = true
			} else {
				this.restoreCutout(mat, tex)
				;(mat as any).needsUpdate = true
			}
		}
		return changed
	}

	private refreshBakedMapTint(mat: any, tex: any, userData: any): boolean {
		if (isBakedNodeMaterial(mat)) {
			// Node materials refresh through the authored factory rebuild, which keeps
			// the transmission bulb lift. Hand-building colorNode here would drop it.
			return setBakedMap(mat, tex ?? null, (tex as { name?: string } | null)?.name)
		}
		const uTint = (userData.__uTint as any) ?? uniform(new Color(0xffffff))
		if ((uTint as any).value) (uTint as any).value.set(0xffffff)
		const texNode = texture(tex, uv())
		mat.colorNode = Fn(() => vec4(texNode.rgb.mul(uTint), texNode.a))()
		userData.__uTint = uTint
		mat.side = DoubleSide
		return false
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
		addBlendMode?: number,
		disableLightingBelow = 0,
		depthWrite?: boolean,
	): string {
		return `${material?.name ?? 'none'}:${map ?? 'none'}:${normalMap ?? 'none'}:${envMap ?? 'none'}:${emissiveMap ?? 'none'}:${isTransparent ? 't' : 'o'}:${depthBias}:${disableLighting ?? 'x'}:${addBlend ? 'a' : 'o'}:${backfacesEnabled ?? 'x'}:${alphaTestValue}:${addBlendMode ?? 'x'}:${disableLightingBelow}:${depthWrite ?? 'x'}`
	}
}
