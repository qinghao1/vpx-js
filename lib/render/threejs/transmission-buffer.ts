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

// Native bulb-buffer intensity coefficient (see amount below).
export const TRANSMISSION_INTENSITY_COEFFICIENT = 0.02

let texture: DataTexture | null = null
let lastSignature = '\0'

export function getTransmissionTexture(): DataTexture {
	if (!texture) {
		const data = new Uint16Array(TRANSMISSION_WIDTH * TRANSMISSION_HEIGHT * 4)
		texture = new DataTexture(data, TRANSMISSION_WIDTH, TRANSMISSION_HEIGHT, RGBAFormat, HalfFloatType)
		texture.colorSpace = NoColorSpace
		texture.minFilter = LinearFilter
		texture.magFilter = LinearFilter
		texture.wrapS = ClampToEdgeWrapping
		texture.wrapT = ClampToEdgeWrapping
		texture.generateMipmaps = false
		texture.needsUpdate = true
	}
	return texture
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

function lampLevel(light: unknown): number {
	try {
		const lamp = light as LampLike
		const state = lamp.getState?.() ?? {}
		const raw = typeof state.intensity === 'number' ? state.intensity : undefined
		const data = lamp.data
		const level = raw ?? data?.intensity ?? 0
		const scale = lamp.animation?.intensityScale ?? 1
		const scaled = level * (Number.isFinite(scale) ? scale : 1)
		return Number.isFinite(scaled) ? Math.max(0, scaled) : 0
	} catch {
		return 0
	}
}

function lampColor(light: unknown): number {
	try {
		const lamp = light as LampLike
		const state = lamp.getState?.() ?? {}
		const data = lamp.data
		return state.color ?? data?.color ?? 0xffffff
	} catch {
		return 0xffffff
	}
}

function lampColor2(light: unknown): number {
	try {
		const lamp = light as LampLike
		const state = lamp.getState?.() ?? {}
		const data = lamp.data
		return state.colorFull ?? data?.color2 ?? 0xffffff
	} catch {
		return 0xffffff
	}
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
		const transmissionScale = lamp.data?.transmissionScale ?? 0
		if (!(transmissionScale > 0)) continue
		const level = lampLevel(light)
		if (level <= 0) continue
		const color = lampColor(light)
		const color2 = lampColor2(light)
		if ((color & 0xffffff) === 0 && (color2 & 0xffffff) === 0) continue
		// Native (light.cpp bulb-light mesh: lightColor_intensity.w =
		// m_currentIntensity * 0.02, times transmissionScale in the light-buffer
		// pass): the bulb buffer carries two percent of the lamp level. Raw lamp
		// levels run 0..hundreds (file/script scale), so omitting the coefficient
		// overdrives the lift ~50x and washes the playfield.
		const amount = level * transmissionScale * TRANSMISSION_INTENSITY_COEFFICIENT
		const [red, green, blue] = splitTransmissionRgb(color, amount)
		const [red2, green2, blue2] = splitTransmissionRgb(color2, amount)
		const centerX = lamp.data?.center?.x ?? right / 2
		const centerY = lamp.data?.center?.y ?? bottom / 2
		splats.push({
			x: centerX,
			y: centerY,
			falloff: Math.max(lamp.data?.falloff ?? 50, 0.1),
			power: lamp.data?.falloffPower ?? 2,
			red,
			green,
			blue,
			red2,
			green2,
			blue2,
		})
		parts.push(
			`${Math.round(centerX)},${Math.round(centerY)},${Math.round(level * 10)},${color.toString(16)},${Math.round(transmissionScale * 100)}`,
		)
	}
	const signature = parts.join(';')
	if (signature === lastSignature) return false
	lastSignature = signature
	// Accumulate in float and quantize once per texel: per-splat half-float
	// round-trips cost milliseconds once attract lights dozens of wide
	// (falloff 1500) splats, enough to collapse the frame rate on their own.
	const acc = new Float32Array(TRANSMISSION_WIDTH * TRANSMISSION_HEIGHT * 4)
	for (const splat of splats) {
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
				acc[offset] = (acc[offset] ?? 0) + (splat.red2 + (splat.red - splat.red2) * hub) * atten
				acc[offset + 1] = (acc[offset + 1] ?? 0) + (splat.green2 + (splat.green - splat.green2) * hub) * atten
				acc[offset + 2] = (acc[offset + 2] ?? 0) + (splat.blue2 + (splat.blue - splat.blue2) * hub) * atten
				acc[offset + 3] = 1
			}
		}
	}
	for (let i = 0; i < acc.length; i++) data[i] = DataUtils.toHalfFloat(acc[i] ?? 0)
	tex.needsUpdate = true
	return true
}

export function resetTransmissionBuffer(): void {
	lastSignature = '\0'
}

export function getTransmissionDebug(): { signature: string; splats: number; peak: number } {
	const tex = getTransmissionTexture()
	const data = (tex.image.data as Uint16Array | undefined) ?? new Uint16Array(0)
	let peak = 0
	for (let i = 0; i < data.length; i++) peak = Math.max(peak, DataUtils.fromHalfFloat(data[i] ?? 0))
	return { signature: lastSignature.slice(0, 200), splats: lastSignature ? lastSignature.split(';').length : 0, peak }
}
