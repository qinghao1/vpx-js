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
const lastSigNums: number[] = [-1]
const curSigNums: number[] = []
const contribScratch: Array<{
	level: number
	color: number
	color2: number
	transmissionScale: number
	centerX: number
	centerY: number
	falloff: number
	power: number
}> = []

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
	const lightMap = (table as unknown as { lights?: Record<string, unknown> }).lights
	const right = (table as unknown as { data?: { right?: number } }).data?.right || 1
	const bottom = (table as unknown as { data?: { bottom?: number } }).data?.bottom || 1
	// Steady-state fast path: numeric pre-check with reused buffers. Static lamp
	// frames return here with no string/splat allocations; strings + splats are
	// built only when quantized inputs actually changed.
	curSigNums.length = 0
	contribScratch.length = 0
	if (lightMap) {
		for (const key in lightMap) {
			const lamp = lightMap[key] as LampLike
			if (lamp.data?.bulbLight !== true) continue
			let level = 0
			let color = 0xffffff
			let color2 = 0xffffff
			try {
				const s = lamp.getState?.() as { intensity?: number; color?: number; colorFull?: number } | undefined
				const d = lamp.data
				const raw = s && typeof s.intensity === 'number' ? s.intensity : (d?.intensity ?? 0)
				const sc = lamp.animation?.intensityScale ?? 1
				const scaled = raw * (Number.isFinite(sc) ? sc : 1)
				level = Number.isFinite(scaled) ? Math.max(0, scaled) : 0
				if (s && typeof s.color === 'number') color = s.color
				else if (typeof d?.color === 'number') color = d.color
				if (s && typeof s.colorFull === 'number') color2 = s.colorFull
				else if (typeof d?.color2 === 'number') color2 = d.color2
			} catch {
				continue
			}
			if (level <= 0) continue
			if ((color & 0xffffff) === 0 && (color2 & 0xffffff) === 0) continue
			const transmissionScale = lamp.data?.transmissionScale ?? 0
			const centerX = lamp.data?.center?.x ?? right / 2
			const centerY = lamp.data?.center?.y ?? bottom / 2
			const falloff = Math.max(lamp.data?.falloff ?? 50, 0.1)
			const power = lamp.data?.falloffPower ?? 2
			curSigNums.push(
				Math.round(centerX),
				Math.round(centerY),
				Math.round(level * 10),
				color,
				color2,
				Math.round(transmissionScale * 100),
				Math.round(falloff * 10),
				power,
			)
			if (transmissionScale > 0)
				contribScratch.push({ level, color, color2, transmissionScale, centerX, centerY, falloff, power })
		}
	}
	if (curSigNums.length === lastSigNums.length) {
		let same = true
		for (let i = 0; i < curSigNums.length; i++) {
			if (curSigNums[i] !== lastSigNums[i]) {
				same = false
				break
			}
		}
		if (same) return false
	}
	lastSigNums.length = 0
	for (let i = 0; i < curSigNums.length; i++) lastSigNums.push(curSigNums[i] as number)
	// Native (Renderer::DrawBulbLightBuffer + Light::Render LIGHT_BUFFER + fs_light.sc
	// bulb_light): only bulb lights with a nonzero transmission scale contribute, each
	// as a finite disc of its own falloff radius with a (1-r/falloff)^power profile
	// (rim color2 morphing to hub color by sqrt(t)), blurred ~19px on the small bloom
	// buffer. Infinite-support Gaussians over every lamp washed the whole playfield,
	// so support here ends exactly at the falloff radius.
	const splats: TransmissionSplat[] = []
	for (const c of contribScratch) {
		// Native (Light::Render LIGHT_BUFFER halo block): the halo lands in the
		// buffer at full m_currentIntensity * transmissionScale. The 0.02 term
		// belongs to the main-pass bulb-hull block, which is explicitly
		// excluded from the light buffer (!isLightBuffer).
		const entry = (amount: number): TransmissionSplat => {
			const [red, green, blue] = splitTransmissionRgb(c.color, amount)
			const [red2, green2, blue2] = splitTransmissionRgb(c.color2, amount)
			return {
				x: c.centerX,
				y: c.centerY,
				falloff: c.falloff,
				power: c.power,
				red,
				green,
				blue,
				red2,
				green2,
				blue2,
			}
		}
		splats.push(entry(c.level * c.transmissionScale))
	}
	// Signature covers every lit bulb lamp; splats only scale > 0 ones.
	const parts: string[] = []
	for (let i = 0; i + 7 < curSigNums.length; i += 8) {
		parts.push(
			`${curSigNums[i]},${curSigNums[i + 1]},${curSigNums[i + 2]},${(curSigNums[i + 3] as number).toString(16)},${(curSigNums[i + 4] as number).toString(16)},${curSigNums[i + 5]},${curSigNums[i + 6]},${curSigNums[i + 7]}`,
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
	lastSigNums.length = 0
	lastSigNums.push(-1)
	curSigNums.length = 0
	contribScratch.length = 0
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
