import {
	ClampToEdgeWrapping,
	DataTexture,
	DataUtils,
	HalfFloatType,
	LinearFilter,
	NoColorSpace,
	RGBAFormat,
} from 'three'
import type { Table } from '../../vpt/table/table.js'

export const TRANSMISSION_WIDTH = 96
export const TRANSMISSION_HEIGHT = 48
// Native (fs_basic.sc) adds the bulb buffer only to non-opaque pixels (color.a < 1.0).
// Texels at or above this cutoff count as opaque; the epsilon below strict 1.0 absorbs
// filtering and half-float precision around fully opaque art.
export const TRANSMISSION_OPAQUE_CUTOFF = 0.999

let texture: DataTexture | null = null
let lastSignature = '\0'
let lastSplatCount = 0

export function getTransmissionTexture(): DataTexture {
	if (!texture) {
		texture = makeBuffer()
	}
	return texture
}

function makeBuffer(): DataTexture {
	const data = new Uint16Array(TRANSMISSION_WIDTH * TRANSMISSION_HEIGHT * 4)
	const tex = new DataTexture(data, TRANSMISSION_WIDTH, TRANSMISSION_HEIGHT, RGBAFormat, HalfFloatType)
	tex.colorSpace = NoColorSpace
	tex.minFilter = LinearFilter
	tex.magFilter = LinearFilter
	tex.wrapS = ClampToEdgeWrapping
	tex.wrapT = ClampToEdgeWrapping
	tex.generateMipmaps = false
	tex.needsUpdate = true
	return tex
}

interface LampLike {
	getState?: () => { intensity?: number; color?: number; colorFull?: number }
	data?: {
		intensity?: number
		color?: number
		color2?: number
		bulbLight?: boolean
		transmissionScale?: number
		center?: { x?: number; y?: number }
		falloff?: number
		falloffPower?: number
	}
	animation?: { intensityScale?: number }
}

function lampField(light: unknown): {
	state: { intensity?: number; color?: number; colorFull?: number }
	data: LampLike['data']
	scale: number
} {
	try {
		const lamp = light as LampLike
		return { state: lamp.getState?.() ?? {}, data: lamp.data, scale: lamp.animation?.intensityScale ?? 1 }
	} catch {
		return { state: {}, data: undefined, scale: 1 }
	}
}

function lampLevel(light: unknown): number {
	const { state, data, scale } = lampField(light)
	const raw = typeof state.intensity === 'number' ? state.intensity : undefined
	const level = raw ?? data?.intensity ?? 0
	const scaled = level * (Number.isFinite(scale) ? scale : 1)
	return Number.isFinite(scaled) ? Math.max(0, scaled) : 0
}

function lampColor(light: unknown): number {
	const { state, data } = lampField(light)
	return state.color ?? data?.color ?? 0xffffff
}

function lampColor2(light: unknown): number {
	const { state, data } = lampField(light)
	return state.colorFull ?? data?.color2 ?? 0xffffff
}

interface TransmissionSplat {
	x: number
	y: number
	falloff: number
	power: number
	red: number
	green: number
	blue: number
	red2: number
	green2: number
	blue2: number
}

function splitTransmissionRgb(color: number, amount: number): [number, number, number] {
	return [
		(((color >> 16) & 255) / 255) * amount,
		(((color >> 8) & 255) / 255) * amount,
		((color & 255) / 255) * amount,
	]
}

export function updateTransmissionBuffer(table: Table): boolean {
	const tex = getTransmissionTexture()
	const data = tex.image.data as Uint16Array
	const lights = Object.values((table as unknown as { lights?: Record<string, unknown> }).lights ?? {})
	const right = (table as unknown as { data?: { right?: number } }).data?.right || 1
	const bottom = (table as unknown as { data?: { bottom?: number } }).data?.bottom || 1
	const parts: string[] = []
	// Native (Renderer::DrawBulbLightBuffer + Light::Render LIGHT_BUFFER + fs_light.sc
	// bulb_light): only bulb lights with a nonzero transmission scale contribute, each
	// as a finite disc of its own falloff radius with a (1-r/falloff)^power profile
	// (rim color2 morphing to hub color by sqrt(t)), blurred ~19px on the small bloom
	// buffer. Infinite-support Gaussians over every lamp washed the whole playfield,
	// so support here ends exactly at the falloff radius.
	const splats: TransmissionSplat[] = []
	for (const light of lights) {
		const lamp = light as LampLike
		if (lamp.data?.bulbLight !== true) continue
		const level = lampLevel(light)
		if (level <= 0) continue
		const color = lampColor(light)
		const color2 = lampColor2(light)
		if ((color & 0xffffff) === 0 && (color2 & 0xffffff) === 0) continue
		const transmissionScale = lamp.data?.transmissionScale ?? 0
		// Native (Light::Render LIGHT_BUFFER halo block): the halo lands in the
		// buffer at full m_currentIntensity * transmissionScale. The 0.02 term
		// belongs to the main-pass bulb-hull block, which is explicitly
		// excluded from the light buffer (!isLightBuffer).
		// Upstream then applies a normalized 19px Gaussian on an RGBA16F buffer,
		// which conserves energy, so its transmitted energy matches this exactly.
		// vpx-js omits the blur: its sigma is screen-space (view-dependent) while
		// this buffer is playfield-UV, and the coarse 96x48 grid plus bilinear
		// sampling already low-passes near that scale. Open gap: narrow-splat
		// peaks run hotter and disc edges harder than upstream; wide splats
		// (falloff >> blur width) match.
		const centerX = lamp.data?.center?.x ?? right / 2
		const centerY = lamp.data?.center?.y ?? bottom / 2
		const falloff = Math.max(lamp.data?.falloff ?? 50, 0.1)
		const power = lamp.data?.falloffPower ?? 2
		const entry = (amount: number): TransmissionSplat => {
			const [red, green, blue] = splitTransmissionRgb(color, amount)
			const [red2, green2, blue2] = splitTransmissionRgb(color2, amount)
			return { x: centerX, y: centerY, falloff, power, red, green, blue, red2, green2, blue2 }
		}
		if (transmissionScale > 0) splats.push(entry(level * transmissionScale))
		parts.push(
			`${Math.round(centerX)},${Math.round(centerY)},${Math.round(level * 10)},${color.toString(16)},${color2.toString(16)},${Math.round(transmissionScale * 100)},${Math.round(falloff * 10)},${power}`,
		)
	}
	const signature = parts.join(';')
	if (signature === lastSignature) return false
	lastSignature = signature
	lastSplatCount = splats.length
	// Accumulate in float and quantize once per texel: per-splat half-float
	// round-trips cost milliseconds once attract lights dozens of wide
	// (falloff 1500) splats, enough to collapse the frame rate on their own.
	fillBuffer(data, splats, right, bottom)
	tex.needsUpdate = true
	return true
}

/** Module-scope scratch: per-rebuild allocs showed up as GC churn on profiles. */
const scratchAcc = new Float32Array(TRANSMISSION_WIDTH * TRANSMISSION_HEIGHT * 4)

/** Splats one lamp list into a half-float playfield-UV buffer. */
function fillBuffer(data: Uint16Array, list: TransmissionSplat[], right: number, bottom: number): void {
	const acc = scratchAcc
	acc.fill(0)
	for (const splat of list) {
		const minPx = Math.max(0, Math.floor(((splat.x - splat.falloff) / right) * TRANSMISSION_WIDTH))
		const maxPx = Math.min(
			TRANSMISSION_WIDTH - 1,
			Math.ceil(((splat.x + splat.falloff) / right) * TRANSMISSION_WIDTH),
		)
		// Buffer rows run top-down (row 0 is table y=bottom), so bound in v-space.
		const vCenter = 1 - splat.y / bottom
		const vRadius = splat.falloff / bottom
		const minPy = Math.max(0, Math.floor((vCenter - vRadius) * TRANSMISSION_HEIGHT))
		const maxPy = Math.min(TRANSMISSION_HEIGHT - 1, Math.ceil((vCenter + vRadius) * TRANSMISSION_HEIGHT))
		for (let py = minPy; py <= maxPy; py++) {
			const ty = (1 - (py + 0.5) / TRANSMISSION_HEIGHT) * bottom
			for (let px = minPx; px <= maxPx; px++) {
				const tx = ((px + 0.5) / TRANSMISSION_WIDTH) * right
				const dx = tx - splat.x
				const dy = ty - splat.y
				const dist = Math.sqrt(dx * dx + dy * dy)
				if (dist >= splat.falloff) continue
				const normDist = dist / splat.falloff
				const atten = (1 - normDist) ** splat.power
				if (atten <= 0) continue
				const hub = Math.sqrt(normDist)
				const offset = (py * TRANSMISSION_WIDTH + px) * 4
				acc[offset] += (splat.red2 + (splat.red - splat.red2) * hub) * atten
				acc[offset + 1] += (splat.green2 + (splat.green - splat.green2) * hub) * atten
				acc[offset + 2] += (splat.blue2 + (splat.blue - splat.blue2) * hub) * atten
				acc[offset + 3] = 1
			}
		}
	}
	for (let i = 0; i < acc.length; i++) data[i] = DataUtils.toHalfFloat(acc[i])
}

export function resetTransmissionBuffer(): void {
	lastSignature = '\0'
	lastSplatCount = 0
}

export function getTransmissionDebug(): {
	signature: string
	splats: number
	peak: number
} {
	const tex = getTransmissionTexture()
	const data = (tex.image.data as Uint16Array | undefined) ?? new Uint16Array(0)
	let peak = 0
	for (let i = 0; i < data.length; i++) peak = Math.max(peak, DataUtils.fromHalfFloat(data[i]))
	return {
		signature: lastSignature.slice(0, 200),
		splats: lastSplatCount,
		peak,
	}
}
