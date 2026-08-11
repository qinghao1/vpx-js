import { Buffer } from 'buffer'
import { installBvh } from '../../dist-esm/lib/render/threejs/three-bvh.js'

export const isDev = (() => {
	try {
		if (import.meta.env?.DEV) return true
	} catch {}
	try {
		const h = typeof location !== 'undefined' ? location.hostname : ''
		return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0'
	} catch {
		return false
	}
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
	try {
		if (typeof window !== 'undefined') {
			window.Buffer ??= Buffer
			window.global ??= window
		}
	} catch {}
	globalsEnsured = true
}

export const getTargetPixelRatio = mode =>
	Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, mode === 'play' ? 1 : 1.5)
