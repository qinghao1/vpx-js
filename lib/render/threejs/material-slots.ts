import type { Color, Texture } from 'three'

/** Live TSL uniform handle (`uniform(...)` node) stashed on the material. */
export type SlotUniform<T> = { value: T }

/**
 * Typed view over `material.userData` for the node-material slot protocol.
 *
 * Factories stash live uniform handles, the resolved map, and streaming keys
 * here because fork-safe clone (`cloneMaterialForWrite`) rebuilds node
 * materials from these slots — a classic `.clone()` would JSON-flatten the
 * TSL uniforms into inert literals. Key names are a cross-boundary contract
 * (viewer, e2e helpers, and harness scripts read `pendingMap`/`__isBaked`/…),
 * so they must stay byte-identical; this interface only types the access.
 * Read/write every slot through {@link getSlots}, never via `as any` casts.
 */
export interface MaterialSlots {
	__primitiveKind?: string
	__addBlend?: boolean
	__isBaked?: boolean
	__bakedNode?: boolean
	__bulbGlow?: boolean
	__transmission?: boolean
	__primitiveCloned?: boolean
	__map?: Texture | null
	__mapName?: string
	__below?: number
	__depthBias?: number
	__alphaTestValue?: number
	__doubleSided?: boolean
	__backfacesEnabled?: boolean
	__baseColor?: number
	__uAlbedo?: SlotUniform<Color>
	__uBDL?: SlotUniform<number>
	__uDim?: SlotUniform<number>
	__uLitF?: SlotUniform<number>
	__uCarry?: SlotUniform<number>
	__uAlpha?: SlotUniform<number>
	__uBelowF?: SlotUniform<number>
	__uTint?: SlotUniform<Color>
	__uTintColor?: SlotUniform<Color>
	__uIntensity?: SlotUniform<number>
	__uFlat?: SlotUniform<Color>
	__uEmissionScale?: SlotUniform<number>
	__uColor?: SlotUniform<Color>
	__uColor2?: SlotUniform<Color>
	__uAddScale?: SlotUniform<number>
	__rebuild?: (next: Texture | null) => void
	pendingMap?: string
	pendingmap?: string
	pendingNormalMap?: string
	pendingEnvMap?: string
	pendingEmissiveMap?: string
	[key: string]: unknown
}

/**
 * Typed accessor for a material's slots. Returns the live `userData` object
 * (writes go through); a missing carrier is attached, mirroring three.js
 * materials which always carry `userData`.
 */
export function getSlots(mat: { userData?: Record<string, unknown> } | null | undefined): MaterialSlots {
	if (!mat) return {}
	return (mat.userData ??= {}) as MaterialSlots
}
