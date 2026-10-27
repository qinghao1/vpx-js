import { AdditiveBlending, Color, DoubleSide, Vector2 } from 'three'
import { clamp, Fn, float, length, max, mix, positionLocal, pow, sqrt, uniform, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export interface BulbGlowOptions {
	color: number
	color2: number
	centerX: number
	centerY: number
	falloff: number
	falloffPower: number
	intensity: number
	/** Native `m_modulate_vs_add` (default 0.9): 0 = pure additive, 1 = pure modulate. */
	modulateVsAdd?: number
}

export function createBulbGlowNodeMaterial(options: BulbGlowOptions): MeshBasicNodeMaterial {
	const mat = new MeshBasicNodeMaterial()
	const uColor = uniform(new Color(options.color))
	const uColor2 = uniform(new Color(options.color2))
	const uCenter = uniform(new Vector2(options.centerX, options.centerY))
	const uInvFalloff = uniform(1 / Math.max(options.falloff, 0.1))
	const uFalloffPower = uniform(options.falloffPower)
	const uIntensity = uniform(options.intensity)
	// Native bulb blend (`fs_light.sc`, REVSUBTRACT with SRC_ALPHA/INVSRC_COLOR) adds
	// `atten·intensity·(dst·modulate + (1−modulate))`. The dst-modulated term needs
	// framebuffer feedback, unavailable in a single forward pass, so this composite
	// emits the constant-add term `atten·intensity·(1−modulate)` with plain additive
	// blending. The modulated part is carried by lightmap-driven primitives instead.
	const clampedModulate = Math.max(0.0001, Math.min(0.9999, options.modulateVsAdd ?? 0.9))
	const uAddScale = uniform(1 - clampedModulate)

	mat.colorNode = Fn(() => {
		// Matches fs_light.sc: atten = pow(max(1 - saturate(len), 0.0001),
		// falloff_power) with the color ramp on the unclamped sqrt(len) —
		// the floor keeps a fully covered pixel from going exactly 0 and
		// the ramp extrapolates past the rim instead of clamping.
		const len = length(positionLocal.xy.sub(uCenter)).mul(uInvFalloff)
		const atten = pow(max(float(1).sub(clamp(len, float(0), float(1))), float(0.0001)), uFalloffPower)
		const glowColor = mix(uColor2, uColor, sqrt(len))
		const rgb = glowColor.mul(atten).mul(uIntensity).mul(uAddScale)
		return vec4(rgb, float(1))
	})()

	mat.blending = AdditiveBlending
	mat.transparent = true
	mat.depthWrite = false
	mat.depthTest = true
	mat.toneMapped = true
	mat.side = DoubleSide

	const ud = mat.userData as Record<string, unknown>
	ud.__bulbGlow = true
	ud.__uColor = uColor
	ud.__uColor2 = uColor2
	ud.__uIntensity = uIntensity
	ud.__uAddScale = uAddScale
	return mat
}

export function isBulbGlowMaterial(mat: unknown): boolean {
	return !!(mat as { userData?: Record<string, unknown> } | null)?.userData?.__bulbGlow
}

export function setBulbGlowState(mat: unknown, state: { intensity?: number; color?: number; color2?: number }): void {
	const ud = (mat as { userData?: Record<string, unknown> } | null)?.userData
	if (!ud || !ud.__bulbGlow) return
	if (
		state.intensity !== undefined &&
		ud.__uIntensity &&
		typeof (ud.__uIntensity as { value: unknown }).value === 'number'
	) {
		;(ud.__uIntensity as { value: number }).value = state.intensity
	}
	if (state.color !== undefined && ud.__uColor) {
		;(ud.__uColor as { value: Color }).value.set(state.color)
	}
	if (state.color2 !== undefined && ud.__uColor2) {
		;(ud.__uColor2 as { value: Color }).value.set(state.color2)
	}
}
