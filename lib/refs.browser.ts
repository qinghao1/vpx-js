// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Platform entry (browser). Pairs with refs.node.ts: both entries must export
// the same surface — BinaryReader, storage, everything in refs-three.js,
// ThreeTextureLoader, getTextFile/hasTextFile — with platform-specific
// implementations behind each name, so shared code can import either entry.
export { BrowserBinaryReader as BinaryReader } from './io/binary-reader.js'
export { storage } from './io/storage.js'
export * from './refs-three.js'
export { ThreeTextureLoaderBrowser as ThreeTextureLoader } from './render/threejs/three-texture-loader-browser.js'
export { getTextFile, hasTextFile } from './scripting/vbs-scripts.browser.js'
