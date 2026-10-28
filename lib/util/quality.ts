// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export type Quality = 'low' | 'high'

export const QUALITY_CAPS = {
	low: { playfield: 2048, other: 512, floor: 256, aniso: 4 },
	high: { playfield: 4096, other: 4096, floor: 1024, aniso: 16 },
} as const

/** 8x ceiling: 16x is invisible at pinball angles; low-tier 4x passes through. */
export function cappedAniso(aniso: number): number {
	return Math.min(8, aniso)
}

export const QUALITY_MAX_LIGHTS = {
	low: 12,
	high: 16,
} as const

/**
 * Float (HDR/EXR) payloads above this are rejected before decode. EXR/HDR
 * decoders expand to a full-res half-float frame first (8192x8192 RGBA16F is
 * 512MB) and downsample only afterwards, so an uncapped worker decode OOMs
 * or stalls the tab. Regular images have their own 16MB worker cap in the
 * texture loader; this keeps the float path symmetric with it.
 */
export const MAX_FLOAT_TEXTURE_BYTES = 16 * 1024 * 1024

export function isPlayMode(): boolean {
	try {
		if (typeof location === 'undefined') return false
		const p = new URLSearchParams(location.search)
		if (p.get('mode') === 'play') return true
		if (p.get('viewerMode') === 'play') return true
		return false
	} catch {
		return false
	}
}

export function getEffectiveCaps(): { playfield: number; other: number; floor: number; aniso: number } {
	// Return a copy: callers must not mutate the shared table (a leaked write
	// would silently re-cap every later texture load).
	return { ...QUALITY_CAPS[getQuality()] }
}

let cachedLow: boolean | undefined

function computeIsLowQuality(): boolean {
	try {
		if (typeof window === 'undefined' || typeof location === 'undefined') return false
		const params = new URLSearchParams(location.search)
		const quality = params.get('quality')
		if (quality === 'low') return true
		if (quality === 'high') return false
		if (params.has('low') || params.has('mobile')) return true
		if (params.has('high')) return false
		const nav =
			typeof navigator !== 'undefined'
				? (navigator as unknown as {
						userAgentData?: { mobile?: boolean }
						deviceMemory?: number
						hardwareConcurrency?: number
						userAgent?: string
					})
				: null
		if (nav?.userAgentData?.mobile) return true
		const deviceMemory = nav?.deviceMemory
		if (typeof deviceMemory === 'number') {
			if (deviceMemory <= 4) return true
		} else if (typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) {
			return true
		}
		const ua = String(nav?.userAgent ?? '')
		if (/android|iphone|ipad|ipod|mobile|phone/i.test(ua)) return true
		if (
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(pointer: coarse)').matches &&
			Math.min(window.innerWidth, window.innerHeight) < 900
		)
			return true
		if (window.innerWidth < 768) return true
		return false
	} catch {
		return false
	}
}

export function isLowQuality(): boolean {
	if (cachedLow !== undefined) return cachedLow
	cachedLow = computeIsLowQuality()
	return cachedLow
}

export function _resetQualityCache(): void {
	cachedLow = undefined
}

export function getQuality(): Quality {
	return isLowQuality() ? 'low' : 'high'
}

export function getMaxLights(): number {
	return QUALITY_MAX_LIGHTS[getQuality()]
}

// Render resolution as a fraction of device pixels (1 = native sharpness). Values are vpx-js tuned, not upstream.
export function getTargetPixelRatio(mode?: string): number {
	if (isLowQuality()) {
		if (mode === 'play') return 0.65 // play mode: fewer pixels for FPS
		try {
			if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return 0.65
		} catch {}
		return 0.9 // low-quality desktop: near-native
	}
	const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1
	try {
		if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
			const area = window.innerWidth * window.innerHeight
			if (area > 1920 * 1080) return Math.min(dpr, 1)
		}
	} catch {}
	return Math.min(dpr, 1.5) // cap DPR: above 1.5x costs GPU with no visible gain
}
