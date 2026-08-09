// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** refs.node.ts — Visual Pinball lib module. */
import { FileLoader } from 'three'

export { exportGltf } from './gltf/export-gltf.node.js'
export { NodeBinaryReader as BinaryReader } from './io/binary-reader.node.js'
export { storage } from './io/storage.js'
export * from './refs-three.js'
export { ThreeTextureLoaderNode as ThreeTextureLoader } from './render/threejs/three-texture-loader-node.js'
export { getTextFile, hasTextFile } from './scripting/vbs-scripts.node.js'

/**
 * Patch `FileLoader` to accept raw buffers as URLs.
 *
 * Three's loader normally expects a URL string; this lets callers pass a
 * pre-loaded `ArrayBuffer`/`Uint8Array` directly (useful for in-memory GLTF).
 *
 * The patch is applied lazily and idempotently — call once at startup.
 *
 * @returns restore function that reverts the patch
 */
export function patchFileLoader(): () => void {
	const proto = FileLoader.prototype as unknown as Record<string, unknown>
	if ((proto as { __vpxPatched?: boolean }).__vpxPatched) {
		return () => {}
	}
	const originalLoad = FileLoader.prototype.load as unknown as (
		url: unknown,
		onLoad?: (r: string | ArrayBuffer) => void,
		onProgress?: (e: ProgressEvent) => void,
		onError?: (e: ErrorEvent) => void,
	) => unknown
	FileLoader.prototype.load = function (
		urlOrBuffer: unknown,
		onLoad?: (r: string | ArrayBuffer) => void,
		onProgress?: (e: ProgressEvent) => void,
		onError?: (e: ErrorEvent) => void,
	) {
		if (typeof urlOrBuffer === 'string') {
			return (originalLoad as Function).call(this, urlOrBuffer, onLoad, onProgress, onError)
		}
		if (onLoad) onLoad(urlOrBuffer as string | ArrayBuffer)
	} as unknown as typeof FileLoader.prototype.load
	;(proto as { __vpxPatched?: boolean }).__vpxPatched = true
	return () => {
		FileLoader.prototype.load = originalLoad as typeof FileLoader.prototype.load
		;(proto as { __vpxPatched?: boolean }).__vpxPatched = false
	}
}

// Auto-patch on import for backward compatibility.
patchFileLoader()
