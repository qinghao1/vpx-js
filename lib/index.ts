// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** index.ts — Visual Pinball lib module. */
export const VP_VERSION_MAJOR = 10 // X Digits
export const VP_VERSION_MINOR = 8 // Max 2 Digits
export const VP_VERSION_REV = 1 // Max 1 Digit

export { Player } from './game/player.js'
export { BrowserBinaryReader } from './io/binary-reader.browser.js'
export { OleCompoundDoc, Storage } from './io/ole-doc.js'
export { BinaryReader, storage, ThreeTextureLoader } from './refs.node.js'
export { ThreeRenderApi } from './render/threejs/three-render-api.js'
export { Logger, Progress, progress } from './util/logger.js'
export { Ball } from './vpt/ball/ball.js'
export { Table } from './vpt/table/table.js'
export { TableExporter } from './vpt/table/table-exporter.js'
