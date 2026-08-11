// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IRenderApi } from '../render/irender-api.js'
import type { ItemState } from '../vpt/item-state.js'
import type { ItemUpdater } from '../vpt/item-updater.js'
import type { Material } from '../vpt/material.js'
import type { Mesh } from '../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../vpt/table/table.js'
import type { Texture } from '../vpt/texture.js'
import type { IItem } from './iitem.js'

/** Renderable table element. */
export interface IRenderable<STATE extends ItemState> extends IItem {
	getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableGenerateOptions,
	): Meshes<GEOMETRY>
	getState(): STATE
	getUpdater(): ItemUpdater<STATE>
}

export function isRenderable(arg: unknown): arg is IRenderable<ItemState> {
	return typeof arg === 'object' && arg !== null && 'getMeshes' in arg
}

export interface Meshes<GEOMETRY> {
	[key: string]: RenderInfo<GEOMETRY>
}

export interface RenderInfo<GEOMETRY> {
	isVisible: boolean
	mesh?: Mesh
	geometry?: GEOMETRY
	map?: Texture
	normalMap?: Texture
	envMap?: Texture
	material?: Material
	isTransparent?: boolean
	depthBias?: number
	// vpinball primitive: m_disableLightingTop (0..1). When >0.5 the primitive is pre-baked / unlit
	// (see ~/projects/vpinball/src/parts/primitive.cpp:1135 SHADER_fDisableLighting_top_below and
	//   SHADER_TECHNIQUE_unshaded_with_texture selection). Used to emulate unlit without name hacks.
	disableLighting?: number
	// vpinball primitive: m_d.m_addBlend (see ~/projects/vpinball/src/parts/primitive.cpp:102)
	// Additive primitives are unlit and use SRC_ALPHA ONE blending (RenderDevice.cpp:2497 EnableAlphaBlend)
	// with premultiplied color*alpha (primitive.cpp:107 convertColor(alpha/100)).
	addBlend?: boolean
	backfacesEnabled?: boolean
}
