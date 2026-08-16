import { Buffer } from 'buffer'
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

let globalsEnsured = false
export const ensureGlobals = () => {
	if (globalsEnsured) return
	if (typeof window !== 'undefined') {
		window.Buffer ??= Buffer
		window.global ??= window
	}
	globalsEnsured = true
}

export {
	getMaxLights,
	getQuality,
	getTargetPixelRatio,
	isLowQuality,
	QUALITY_CAPS,
	QUALITY_MAX_LIGHTS,
} from '../../dist-esm/lib/util/quality.js'
