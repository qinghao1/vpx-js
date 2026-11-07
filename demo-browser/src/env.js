// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { installBvh } from '../../dist-esm/lib/render/threejs/three-bvh.js'

export const isDev = (() => {
	if (import.meta.env?.DEV) return true
	const h = typeof location !== 'undefined' ? location.hostname : ''
	return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0'
})()

let bvhInstalled = false
export const ensureBvh = () => {
	if (bvhInstalled) return
	try {
		installBvh()
		bvhInstalled = true
	} catch (e) {
		if (isDev) console.warn('installBvh failed', e)
	}
}

export {
	ADAPT_QUALITY,
	adaptPixelRatio,
	getHighPixelRatio,
	getLowPixelRatio,
	getMaxLights,
	getTargetPixelRatio,
	isLowQuality,
	isQualityPinned,
	QUALITY_CAPS,
} from '../../dist-esm/lib/util/quality.js'
