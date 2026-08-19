// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export type Quality = 'low' | 'high'

export const QUALITY_CAPS = {
	low: { playfield: 1024, other: 128, floor: 64, aniso: 1 },
	high: { playfield: 4096, other: 4096, floor: 1024, aniso: 16 },
} as const

export const QUALITY_MAX_LIGHTS = {
	low: 8,
	high: 16,
} as const

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
	if (isLowQuality()) return QUALITY_CAPS.low
	return QUALITY_CAPS.high
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
	return isLowQuality() ? QUALITY_MAX_LIGHTS.low : QUALITY_MAX_LIGHTS.high
}

export function getTargetPixelRatio(_mode?: string): number {
	if (isLowQuality()) {
		if (_mode === 'play') return 0.4
		try {
			if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return 0.4
		} catch {}
		return 0.75
	}
	const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1
	try {
		if (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) {
			const area = window.innerWidth * window.innerHeight
			if (area > 1920 * 1080) return Math.min(dpr, 1)
		}
	} catch {}
	return Math.min(dpr, 1.5)
}
