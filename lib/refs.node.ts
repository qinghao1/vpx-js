// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FileLoader } from 'three'

export { NodeBinaryReader as BinaryReader } from './io/binary-reader.node.js'
export { storage } from './io/storage.js'
export * from './refs-three.js'
export { ThreeTextureLoaderNode as ThreeTextureLoader } from './render/threejs/three-texture-loader-node.js'
export { getTextFile, hasTextFile } from './scripting/vbs-scripts.node.js'

// Allow FileLoader.load to accept ArrayBuffer directly for in-memory GLTF.
export function patchFileLoader(): () => void {
	const proto = FileLoader.prototype as unknown as { __vpxPatched?: boolean }
	if (proto.__vpxPatched) return () => {}
	const orig = FileLoader.prototype.load as unknown as (...args: unknown[]) => unknown
	FileLoader.prototype.load = function (
		urlOrBuffer: unknown,
		onLoad?: (r: string | ArrayBuffer) => void,
		...rest: unknown[]
	) {
		if (typeof urlOrBuffer === 'string')
			return (orig as (...args: unknown[]) => unknown).call(this, urlOrBuffer, onLoad, ...rest)
		if (onLoad) onLoad(urlOrBuffer as string | ArrayBuffer)
	} as unknown as typeof FileLoader.prototype.load
	proto.__vpxPatched = true
	return () => {
		FileLoader.prototype.load = orig as typeof FileLoader.prototype.load
		proto.__vpxPatched = false
	}
}

patchFileLoader()
