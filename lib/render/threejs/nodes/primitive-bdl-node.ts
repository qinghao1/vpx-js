import {
	AddEquation,
	AdditiveBlending,
	Color,
	CustomBlending,
	DataTexture,
	DoubleSide,
	FrontSide,
	NoBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	SRGBColorSpace,
	SrcAlphaFactor,
	type Texture as ThreeTexture,
	Vector2,
} from 'three'
import { Fn, float, positionWorld, saturate, sqrt, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { clampModulateVsAdd, DEFAULT_MODULATE } from '../../../vpt/flasher/flasher-blend.js'
import {
	bdlDiffuseFactor,
	bdlEmissiveCarry,
	belowFactor,
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	isValidCutout,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	type PrimitiveAdditiveUpdate,
	type PrimitiveBdlUpdate,
	type ProtocolColor,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
} from '../../../vpt/primitive/primitive-material-protocol.js'
import { copyForkedRenderState, defineEmissiveIntensityCompat, setNodeMapSlot } from '../material-shared.js'
import { getTransmissionTexture, TRANSMISSION_OPAQUE_CUTOFF } from '../transmission-buffer.js'

export type { PrimitiveAdditiveUpdate, PrimitiveBdlUpdate, ProtocolColor }
export {
	bdlDiffuseFactor,
	bdlEmissiveCarry,
	belowFactor,
	getPrimitiveKind,
	isPrimitiveNodeMaterial,
	PRIMITIVE_ADDITIVE_KIND,
	PRIMITIVE_BDL_KIND,
	updatePrimitiveAdditive,
	updatePrimitiveBdl,
}

// Scaled playfield extents for the bulb-light buffer lookup, shared by every BDL
// fork. Native (fs_basic.sc) samples its bulb buffer per-pixel in screen space;
// the table-space analog is the fragment's own playfield UV, so each pixel reads
// the light that actually falls on it instead of one anchor texel per primitive.
// The scene root maps table units to world via translate(-w/2,-h/2,0) * rotX(90)
// * scale(s) (see ThreeRenderApi.transformScene; translates apply in the rotated
// frame, so x centers about 0 and table-y lands on world-z centered about 0).
// Hence u = x/(w*s)+0.5 and v = 0.5-z/(h*s) with the scaled extents stored here.
export const uTransArea = uniform(new Vector2(1, 1))

/** Planar playfield UV of the fragment's world position (matches the
 * playfield slab's 1:1 mapping, so taps sample the texel behind the fragment). */
export const playfieldUv = (): ReturnType<typeof vec2> =>
	vec2(
		positionWorld.x.div(uTransArea.x).add(float(0.5)),
		float(0.5).sub(positionWorld.z.div(uTransArea.y)),
	) as ReturnType<typeof vec2>

/**
 * World-space height of the playfield surface (the table z=0 plane after the
 * scene-root transform). Fragments below it share the playfield's x/z
 * footprint (cabinet bottom, under-table grates), so the 2D footprint mask
 * alone cannot tell them apart from the playfield itself.
 */
export const uPlayfieldSurfaceY = uniform(0)

/**
 * Enables the playfield-footprint mask on bulb-glow quads. Bulb halos are
 * authored drag-point polygons (`Light::UpdateMeshBuffer`) that routinely
 * extend past the cabinet walls (giant GI discs, flasher sheets); their
 * overhanging fragments are closer to an outside camera than the wall, so
 * they composite additively OVER the side art as red wash and edge-on
 * streak lines. Masking them to the playfield footprint confines the halo to
 * the playfield the lamp actually lights, mirroring the transmission-buffer
 * lookup mask below. Defaults to 0 (unmasked) so glow renders unchanged
 * until the viewer configures the playfield area; setPrimitiveTransmissionArea
 * flips it on alongside the area it gates on.
 */
export const uBulbGlowFootprintClip = uniform(0)

/**
 * How far below the playfield surface the bulb-buffer lift still applies, in
 * world units. Extruded playfield overlays (VLM bakes, additive lightmaps)
 * hang about one unit below the surface, while the cabinet body and the room
 * sit several units down; the cutoff sits between so the playfield keeps its
 * lamp response and below-table geometry stays dark.
 */
export const BULB_LIFT_BELOW_EPS = 1.5

/**
 * Masks bulb-buffer lookups to the playfield itself. Room geometry (VR floor,
 * walls) extends far beyond the playfield, and out-of-range UVs would sample
 * the clamped edge texel (ClampToEdgeWrapping), smearing live lamp energy
 * across the whole floor. Native has no such contribution: its bulb buffer is
 * sampled per-pixel in screen space with projected bounds.
 */
export const inPlayfieldBounds = (playfieldUv: ReturnType<typeof vec2>): ReturnType<typeof float> =>
	step(0, playfieldUv.x)
		.mul(step(playfieldUv.x, 1))
		.mul(step(0, playfieldUv.y))
		.mul(step(playfieldUv.y, 1)) as ReturnType<typeof float>

/**
 * Full bulb-lift volume: the playfield footprint plus a height gate. The 2D
 * mask above still passes fragments BELOW the playfield that share its x/z
 * footprint (cabinet bottom faces, under-table grates and floors), lighting
 * them with live lamp energy that shines through the cabinet bottom onto the
 * floor. Native samples its bulb buffer in screen space
 * (fs_basic.sc transmission tail), which never reaches occluded below-table
 * pixels, so gate the lookup to at/above-surface fragments here.
 */
export const inLiftVolume = (
	playfieldUv: ReturnType<typeof vec2>,
	worldY: (typeof positionWorld)['y'],
): ReturnType<typeof float> =>
	inPlayfieldBounds(playfieldUv).mul(step(uPlayfieldSurfaceY.sub(BULB_LIFT_BELOW_EPS), worldY)) as ReturnType<
		typeof float
	>

export function setPrimitiveTransmissionArea(width: number, height: number, scale = 1, surfaceY = 0): void {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
	const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
	uTransArea.value.set(safeWidth * safeScale, safeHeight * safeScale)
	uPlayfieldSurfaceY.value = Number.isFinite(surfaceY) ? surfaceY : 0
	uBulbGlowFootprintClip.value = 1
}

export interface PrimitiveBdlOptions {
	map?: ThreeTexture
	mapName?: string
	albedo?: number
	opacity?: number
	bdl?: number
	below?: number
	metalness?: number
	roughness?: number
	alphaTestValue?: number
	doubleSided?: boolean
	depthBias?: number
}

export interface PrimitiveAdditiveOptions {
	map?: ThreeTexture
	mapName?: string
	tint?: number
	intensity?: number
	alphaTestValue?: number
	doubleSided?: boolean
	depthBias?: number
	modulateVsAdd?: number
	absorb?: boolean
	plain?: boolean
	/** Bound playfield art for the backdrop tap (null until it streams in). */
	backdropMap?: ThreeTexture | null
	/** Pending playfield art name; the streaming drain binds it. */
	backdropMapName?: string
}

export type FlasherBlendTarget = 'absorb' | 'additive' | 'plain'

/**
 * Reference backdrop albedo for the additive modulate approximation, in
 * sRGB (102/255, the stub bytes below — keep the two in sync). Native
 * composites `dst + atten·I·l·((1−m) + m·dst)` per channel (fs_light.sc);
 * the additive port cannot read dst, so pre-stream fragments pin the dst
 * term to this mid-playfield gray. Once the playfield art streams in, the
 * backdrop tap below samples the true albedo at the fragment's playfield
 * UV instead. See the bulb-glow factory for the derivation.
 */
export const ADDITIVE_MODULATE_DST_REF = 0.4

/**
 * Backdrop tap: the playfield albedo behind an additive halo/flasher,
 * standing in for the unreadable framebuffer dst in the native closed form
 * `dst + atten·I·l·((1−m) + m·dst)`. The substitution is albedo-only: live
 * GI, ball shadows, and overlapping halos present in the true dst are not
 * in the tap, so halos under strong GI read slightly dimmer than native.
 * The tap compiles against a 1x1 stub holding the reference constant, so
 * pre-stream frames match the constant path exactly; the streaming drain
 * rebinds the node value to the decoded art when it arrives (no graph
 * rebuild, same as `__mapNodes`).
 */
let backdropStub: DataTexture | null = null
export function backdropStubTexture(): ThreeTexture {
	if (!backdropStub) {
		const data = new Uint8Array([102, 102, 102, 255])
		backdropStub = new DataTexture(data, 1, 1)
		// Streamed art decodes from sRGB; the stub must decode the same way
		// or pre/post-stream frames pop between color spaces.
		backdropStub.colorSpace = SRGBColorSpace
		backdropStub.needsUpdate = true
	}
	return backdropStub
}

export function createBackdropTap(pfUv: ReturnType<typeof vec2>, map?: ThreeTexture | null) {
	const node = texture(map ?? backdropStubTexture(), pfUv)
	return { rgb: node.rgb, node }
}

/**
 * Native per-channel backdrop weight `(1−m) + m·dst` with the albedo tap
 * as dst; the halo light multiplies it (all four tap sites share this tail).
 * Params stay untyped: TSL node algebra is duck-typed, and inference keeps
 * the call-site chains precisely checked exactly as when spelled inline.
 */
export function tapBackdropWeight(modulate: any, tapRgb: any) {
	return float(1).sub(modulate).add(modulate.mul(tapRgb))
}

/** Attaches a backdrop tap to an additive material's userData; returns the tap. */
export function attachBackdropTap(
	userData: Record<string, unknown>,
	map?: ThreeTexture | null,
): ReturnType<typeof createBackdropTap> {
	const tap = createBackdropTap(playfieldUv(), map)
	userData.__backdropArm = true
	userData.__backdropNodes = [tap.node]
	return tap
}

/**
 * Idempotently rebinds an additive backdrop tap to streamed playfield art;
 * returns false when already bound (same map+name) or when the material has
 * no tap; sets needsUpdate only on attach/detach transitions (value swaps
 * rebind in place); a null texture unbinds back to the stub. The stamped
 * backdrop name is untouched.
 */
export function setAdditiveBackdrop(mat: unknown, tex: ThreeTexture | null, name?: string): boolean {
	const target = mat as { userData?: Record<string, unknown>; needsUpdate?: boolean } | null | undefined
	const userData = target?.userData
	if (!userData?.__backdropArm) return false
	if (userData.__backdropMap === (tex ?? null) && (name === undefined || userData.__backdropName === name)) {
		return false
	}
	const prev = (userData.__backdropMap as ThreeTexture | null) ?? null
	const nodes = userData.__backdropNodes as { value: unknown }[] | undefined
	if (nodes?.length) for (const node of nodes) node.value = tex ?? backdropStubTexture()
	userData.__backdropMap = tex ?? null
	if (name !== undefined) userData.__backdropName = name
	// A texture value swap rebinds in place (same program); only
	// attach/detach transitions need a recompile, like the map slots.
	if (target && (prev == null || tex == null)) target.needsUpdate = true
	return true
}

function applyTargetBlend(mat: MeshBasicNodeMaterial, target: FlasherBlendTarget): void {
	// Additive overlays composite in draw order (depthBias tiers +
	// transparent sort). Bulb halos are additive too: the native
	// REVSUBTRACT form draws nothing on the WebGPU backend.
	if (target === 'absorb') applyAbsorbBlendState(mat)
	else if (target === 'plain') mat.blending = NoBlending
	else mat.blending = AdditiveBlending
}

/** Converts an additive overlay toward the live blend mode. */
export function convertFlasherBlend(mat: MeshBasicNodeMaterial, target: FlasherBlendTarget): boolean {
	const userData = mat.userData as Record<string, unknown>
	if (userData.__addBlend !== true || userData.__blend === target) return false
	userData.__blend = target
	applyTargetBlend(mat, target)
	// The texture alpha-test applies only for plain; the additive targets never discard.
	const cutout = userData.__alphaTestValue
	mat.alphaTest = target === 'plain' && isValidCutout(cutout) ? cutout : 0
	;(userData.__rebuild as ((map: unknown) => void) | undefined)?.(userData.__map)
	mat.needsUpdate = true
	return true
}

// Single-sided fallback shared by every material path: converted VPX meshes are
// stored winding-reversed (see ThreeMeshGenerator), so their fronts are CCW on
// screen and single-sided rendering takes FrontSide, not BackSide.
export function sideFor(doubleSided?: boolean): typeof DoubleSide | typeof FrontSide {
	return doubleSided !== false ? DoubleSide : FrontSide
}

export function createPrimitiveBdlMaterial(opts: PrimitiveBdlOptions): MeshStandardNodeMaterial {
	const mat = new MeshStandardNodeMaterial()
	const uAlbedo = uniform(new Color(opts.albedo ?? 0xffffff))
	const uBDL = uniform(opts.bdl ?? 0)
	const uLitF = uniform(bdlDiffuseFactor(opts.bdl ?? 0))
	const uCarry = uniform(bdlEmissiveCarry(opts.bdl ?? 0))
	const uAlpha = uniform(opts.opacity ?? 1)
	const uBelowF = uniform(belowFactor(opts.below ?? 0))
	const uTransTex = getTransmissionTexture()
	const userData = mat.userData as Record<string, unknown>
	userData.__primitiveKind = PRIMITIVE_BDL_KIND
	userData.__uAlbedo = uAlbedo
	userData.__uBDL = uBDL
	userData.__uLitF = uLitF
	userData.__uCarry = uCarry
	userData.__uAlpha = uAlpha
	userData.__uBelowF = uBelowF
	userData.__below = opts.below ?? 0
	userData.__mapName = opts.mapName
	userData.__depthBias = opts.depthBias ?? 0
	userData.__alphaTestValue = opts.alphaTestValue ?? 0
	userData.__doubleSided = opts.doubleSided !== false
	const rebuild = (map: ThreeTexture | null): void => {
		// Composite BDL + transmission math: see the canonical explanation in
		// primitive-material-protocol.ts (bdlDiffuseFactor/bdlEmissiveCarry/belowFactor).
		// Keep one texture node per slot: sharing a single texture node across
		// color/opacity/emissive slots breaks the TSL graph on some drivers, while
		// separate fetches stay correct.
		if (map) {
			const texColor = texture(map, uv())
			const texAlpha = texture(map, uv())
			const texDiffuse = texture(map, uv())
			const texTransmission = texture(map, uv())
			// Stashed for same-branch swaps (see setNodeMapSlot): rebinding
			// the values in place skips the graph rebuild + revalidation.
			userData.__mapNodes = [texColor, texAlpha, texDiffuse, texTransmission]
			mat.colorNode = Fn(() => texColor.rgb.mul(uAlbedo).mul(uLitF))()
			mat.opacityNode = Fn(() => texAlpha.a.mul(uAlpha))()
			mat.emissiveNode = Fn(() => {
				const diffuse = texDiffuse.rgb.mul(uAlbedo)
				const carry = diffuse.mul(uCarry)
				// Native (fs_basic.sc) adds the bulb buffer only to non-opaque
				// pixels (color.a < 1.0), scaled by the pixel alpha; opaque lens
				// pixels carry the lamp purely through the BDL term above.
				const alphaBelow = texTransmission.a.mul(uAlpha)
				const gate = step(alphaBelow, TRANSMISSION_OPAQUE_CUTOFF)
				const pfUv = playfieldUv()
				const lift = sqrt(diffuse)
					.mul(texture(uTransTex, pfUv).rgb)
					.mul(uBelowF)
					.mul(alphaBelow)
					.mul(gate)
					.mul(inLiftVolume(pfUv, positionWorld.y))
				return carry.add(lift)
			})()
		} else if (userData.__mapName != null) {
			mat.colorNode = Fn(() => float(0))()
			mat.opacityNode = Fn(() => float(0))()
			mat.emissiveNode = Fn(() => float(0))()
		} else {
			mat.colorNode = Fn(() => uAlbedo.mul(uLitF))()
			mat.opacityNode = Fn(() => uAlpha)()
			mat.emissiveNode = Fn(() => uAlbedo.mul(uCarry))()
		}
		if (!map) userData.__mapNodes = undefined
		mat.outputNode = null
	}
	userData.__rebuild = rebuild
	const map = opts.map ?? null
	userData.__map = map
	rebuild(map)
	mat.metalness = opts.metalness ?? 0
	mat.roughness = opts.roughness ?? 0.4
	mat.side = sideFor(opts.doubleSided)
	mat.alphaTest = isValidCutout(opts.alphaTestValue) ? opts.alphaTestValue : 0
	mat.blending = CustomBlending
	mat.blendSrc = SrcAlphaFactor
	mat.blendDst = OneMinusSrcAlphaFactor
	mat.blendEquation = AddEquation
	mat.blendSrcAlpha = OneFactor
	mat.blendDstAlpha = OneMinusSrcAlphaFactor
	mat.blendEquationAlpha = AddEquation
	mat.toneMapped = true
	return mat
}

/** Premultiplied-over blend factors for AB_ABSORB (flasher.cpp SetupAddBlendState). */
export function applyAbsorbBlendState(mat: MeshBasicNodeMaterial): void {
	mat.blending = CustomBlending
	mat.blendSrc = OneFactor
	mat.blendDst = OneMinusSrcAlphaFactor
	mat.blendEquation = AddEquation
	mat.blendSrcAlpha = OneFactor
	mat.blendDstAlpha = OneMinusSrcAlphaFactor
	mat.blendEquationAlpha = AddEquation
}

export function createPrimitiveAdditiveMaterial(opts: PrimitiveAdditiveOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uTint = uniform(new Color(opts.tint ?? 0xffffff))
	const uIntensity = uniform(opts.intensity ?? 1)
	const uFlat = uniform(new Color(opts.tint ?? 0xffffff).multiplyScalar(opts.intensity ?? 1))
	// Absent modulate on absorb defaults to 0.9 (`Settings_properties.inl`).
	const modulateValue = opts.modulateVsAdd ?? (opts.absorb ? DEFAULT_MODULATE : undefined)
	const uModulate = modulateValue === undefined ? undefined : uniform(clampModulateVsAdd(modulateValue))
	const userData = mat.userData as Record<string, unknown>
	userData.__primitiveKind = PRIMITIVE_ADDITIVE_KIND
	userData.__addBlend = true
	// The updater flips the mode after creation; rebuilds read it late.
	const blend: FlasherBlendTarget = opts.plain === true ? 'plain' : opts.absorb === true ? 'absorb' : 'additive'
	userData.__blend = blend
	userData.__uTint = uTint
	userData.__uIntensity = uIntensity
	userData.__uFlat = uFlat
	userData.__uModulate = uModulate
	userData.__mapName = opts.mapName
	userData.__depthBias = opts.depthBias ?? 0
	userData.__alphaTestValue = opts.alphaTestValue ?? 0
	userData.__doubleSided = opts.doubleSided !== false
	userData.__backdropMap = opts.backdropMap ?? null
	if (opts.backdropMapName !== undefined) userData.__backdropName = opts.backdropMapName
	const rebuild = (map: ThreeTexture | null): void => {
		// Only the modulate-weighted arms below read the backdrop; plain,
		// absorb, and unmodulated arms leave any tap in place but unused.
		userData.__backdropArm = false
		if (map) {
			const tex = texture(map, uv())
			// Stashed for same-branch swaps (see setNodeMapSlot): rebinding
			// the value in place skips the graph rebuild + revalidation.
			userData.__mapNodes = [tex]
			if (userData.__blend === 'plain') {
				// Native AB_NONE (`fs_flasher.sc` plain arm): static color
				// through the texture under the blend below; intensity folds
				// into coverage only.
				mat.colorNode = Fn(() => {
					const resultA = tex.a.mul(uIntensity)
					return vec4(tex.rgb.mul(uTint), saturate(resultA))
				})()
			} else if (uModulate) {
				if (userData.__blend === 'absorb') {
					// Native AB_ABSORB (`fs_flasher.sc` absorb arm): positive
					// premultiplied output under the premul-over blend below.
					mat.colorNode = Fn(() => {
						const resultA = tex.a.mul(uIntensity)
						return vec4(tex.rgb.mul(uTint).mul(resultA), saturate(uModulate.mul(resultA)))
					})()
				} else {
					// AB_ADD (native flasherMode 2): static color modded by the
					// texture, composited additively; the dst term samples
					// the playfield albedo behind the sheet (pre-stream: the
					// stub constant), matching the bulb-glow port.
					const tap = attachBackdropTap(userData, userData.__backdropMap as ThreeTexture | null)
					mat.colorNode = Fn(() => {
						const resultA = tex.a.mul(uIntensity)
						const rgb = tex.rgb.mul(uTint).mul(resultA).mul(tapBackdropWeight(uModulate, tap.rgb))
						return vec4(rgb, float(1))
					})()
				}
			} else {
				// Native (primitive.cpp additive path + fs_unshaded.sc): staticColor is
				// premultiplied (rgb = tint * alpha), result = staticColor * tex, blended
				// SRC_ALPHA,ONE, so the framebuffer receives tint * tex * alpha^2. The rgb
				// term carries intensity to reproduce the native quadratic falloff.
				mat.colorNode = Fn(() => {
					const rgb = tex.rgb.mul(uTint).mul(uIntensity)
					return vec4(rgb, tex.a.mul(uIntensity))
				})()
			}
		} else if (userData.__mapName != null) {
			// The file references a texture that has not streamed in yet. Native loads
			// textures synchronously so it has no placeholder state; emitting nothing
			// until arrival avoids a full-strength flat quad flashing in its place.
			// Overlays with no texture by design (mapName unset) keep the flat color.
			// A zero src is a no-op under either blend below, so this branch is shared.
			mat.colorNode = Fn(() => vec4(0, 0, 0, 0))()
		} else if (userData.__blend === 'plain') {
			// Untextured AB_NONE: tex ≡ 1 in the plain formula above.
			mat.colorNode = Fn(() => vec4(uTint, saturate(uIntensity)))()
		} else if (uModulate) {
			if (userData.__blend === 'absorb') {
				// Untextured AB_ABSORB: tex ≡ 1, so rgb rides uFlat
				// (tint·intensity) with a saturated modulate·intensity alpha.
				mat.colorNode = Fn(() => vec4(uFlat, saturate(uModulate.mul(uIntensity))))()
			} else {
				// Untextured AB_ADD (native flasherMode 2): the static color
				// rides through with the playfield-albedo dst term, as above.
				const tap = attachBackdropTap(userData, userData.__backdropMap as ThreeTexture | null)
				mat.colorNode = Fn(() => {
					const rgb = uFlat.mul(tapBackdropWeight(uModulate, tap.rgb))
					return vec4(rgb, float(1))
				})()
			}
		} else {
			mat.colorNode = uFlat
		}
		if (!map) userData.__mapNodes = undefined
	}
	userData.__rebuild = rebuild
	const map = opts.map ?? null
	userData.__map = map
	rebuild(map)
	applyTargetBlend(mat, blend)
	// The stashed cutout applies only for plain; the additive targets never discard.
	if (blend === 'plain' && isValidCutout(opts.alphaTestValue)) mat.alphaTest = opts.alphaTestValue
	// All overlays stay in the transparent pass like native.
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	// Coplanar with the opaque bake below; the offset wins that tie while
	// nearer toys still occlude (same overlay convention as the classic path).
	mat.polygonOffset = true
	mat.polygonOffsetFactor = -2
	mat.polygonOffsetUnits = -4
	mat.toneMapped = true
	mat.side = sideFor(opts.doubleSided)
	// Compat: legacy readers probe emissiveIntensity on overlays.
	defineEmissiveIntensityCompat(mat)
	;(mat as unknown as { emissiveIntensity: number }).emissiveIntensity = opts.intensity ?? 1
	return mat
}

export function setPrimitiveMap(mat: unknown, map: ThreeTexture | null, name?: string): boolean {
	return setNodeMapSlot(mat, map, name, isPrimitiveNodeMaterial)
}

function uniformHex(value: unknown, fallback: number): number {
	const colorCandidate = value as { getHex?: () => number; r?: number; g?: number; b?: number } | null | undefined
	if (colorCandidate?.getHex) return colorCandidate.getHex()
	// Recovery for uniforms flattened by a classic three.js clone() (userData JSON round-trip).
	if (
		colorCandidate &&
		typeof colorCandidate.r === 'number' &&
		typeof colorCandidate.g === 'number' &&
		typeof colorCandidate.b === 'number'
	) {
		try {
			return new Color().setRGB(colorCandidate.r, colorCandidate.g, colorCandidate.b).getHex()
		} catch {
			return fallback
		}
	}
	return fallback
}

function uniformNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

type CloneablePrimitiveMaterial = (MeshStandardNodeMaterial | MeshBasicNodeMaterial) & {
	userData: Record<string, unknown>
	normalMap?: ThreeTexture | null
	envMap?: ThreeTexture | null
	metalness?: number
	roughness?: number
}

function commonCloneOptions(
	userData: Record<string, unknown>,
	sourceMaterial: { alphaTest: number },
): Pick<
	PrimitiveBdlOptions & PrimitiveAdditiveOptions,
	'map' | 'mapName' | 'alphaTestValue' | 'doubleSided' | 'depthBias'
> {
	return {
		map: (userData.__map as ThreeTexture | null) ?? undefined,
		mapName: (userData.__mapName as string) ?? undefined,
		alphaTestValue: uniformNumber(userData.__alphaTestValue ?? sourceMaterial.alphaTest, 0),
		doubleSided: (userData.__doubleSided as boolean) !== false,
		depthBias: uniformNumber(userData.__depthBias, 0),
	}
}

function finishPrimitiveClone(
	sourceMaterial: CloneablePrimitiveMaterial,
	cloned: CloneablePrimitiveMaterial,
	blend: 'custom' | 'simple',
): void {
	copyForkedRenderState(sourceMaterial, cloned)
	if (blend === 'custom') {
		cloned.opacity = sourceMaterial.opacity
		cloned.blendSrc = sourceMaterial.blendSrc
		cloned.blendDst = sourceMaterial.blendDst
		cloned.blendEquation = sourceMaterial.blendEquation
		cloned.blendSrcAlpha = sourceMaterial.blendSrcAlpha
		cloned.blendDstAlpha = sourceMaterial.blendDstAlpha
		cloned.blendEquationAlpha = sourceMaterial.blendEquationAlpha
		cloned.alphaTest = sourceMaterial.alphaTest
	} else {
		cloned.toneMapped = sourceMaterial.toneMapped
	}
	for (const slot of ['normalMap', 'envMap'] as const) {
		if (sourceMaterial[slot]) cloned[slot] = sourceMaterial[slot]
	}
}

export function clonePrimitiveNodeMaterial<T>(mat: T): T {
	const sourceMaterial = mat as unknown as CloneablePrimitiveMaterial
	if (!sourceMaterial || !isPrimitiveNodeMaterial(sourceMaterial)) {
		return typeof (sourceMaterial as { clone?: () => unknown })?.clone === 'function'
			? ((sourceMaterial as { clone: () => unknown }).clone() as T)
			: mat
	}
	const userData = sourceMaterial.userData
	const common = commonCloneOptions(userData, sourceMaterial)
	if (userData.__primitiveKind === PRIMITIVE_BDL_KIND) {
		const cloned = createPrimitiveBdlMaterial({
			...common,
			albedo: uniformHex((userData.__uAlbedo as { value: unknown })?.value, 0xffffff),
			opacity: uniformNumber((userData.__uAlpha as { value: unknown })?.value, 1),
			bdl: uniformNumber((userData.__uBDL as { value: unknown })?.value, 0),
			below: uniformNumber(userData.__below, 0),
			metalness: uniformNumber(sourceMaterial.metalness, 0),
			roughness: uniformNumber(sourceMaterial.roughness, 0.4),
		})
		finishPrimitiveClone(sourceMaterial, cloned as unknown as CloneablePrimitiveMaterial, 'custom')
		return cloned as unknown as T
	}
	const modulateValue = (userData.__uModulate as { value: unknown } | undefined)?.value
	const blend = userData.__blend
	const cloned = createPrimitiveAdditiveMaterial({
		...common,
		tint: uniformHex((userData.__uTint as { value: unknown })?.value, 0xffffff),
		intensity: uniformNumber((userData.__uIntensity as { value: unknown })?.value, 1),
		// Plain ignores uModulate, but converting back needs it.
		modulateVsAdd: typeof modulateValue === 'number' ? modulateValue : undefined,
		absorb: blend === 'absorb',
		plain: blend === 'plain',
		backdropMap: (userData.__backdropMap as ThreeTexture | null) ?? undefined,
		backdropMapName: (userData.__backdropName as string) ?? undefined,
	})
	finishPrimitiveClone(sourceMaterial, cloned as unknown as CloneablePrimitiveMaterial, 'simple')
	return cloned as unknown as T
}
