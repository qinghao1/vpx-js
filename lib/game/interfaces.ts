// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { HitObject } from '../physics/hit-object.js'
import type { MoverObject } from '../physics/mover-object.js'
import type { IRenderApi } from '../render/irender-api.js'
import type { ItemApi } from '../vpt/item-api.js'
import type { ItemData } from '../vpt/item-data.js'
import type { ItemState } from '../vpt/item-state.js'
import type { ItemUpdater } from '../vpt/item-updater.js'
import type { Material } from '../vpt/material.js'
import type { Mesh } from '../vpt/mesh.js'
import type { Table, TableGenerateOptions } from '../vpt/table/table.js'
import type { Texture } from '../vpt/texture.js'
import type { EventProxy } from './event-proxy.js'
import type { Player } from './player.js'

/** Named table item base interface. */
export interface IItem {
	getName(): string
}
export type { IItem as ItemEntity }

/** Table element that participates in gameplay (≈ IEditable in VPinball). */
export interface IPlayable extends IItem {
	setupPlayer(player: Player, table: Table): void
}
export type { IPlayable as Playable }

export function isPlayable(arg: unknown): arg is IPlayable {
	return typeof arg === 'object' && arg !== null && 'setupPlayer' in arg
}

/** Renderable table element. */
export interface IRenderable<STATE extends ItemState = ItemState> extends IItem {
	getMeshes<NODE, GEOMETRY, POINT_LIGHT>(
		table: Table,
		renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		opts: TableGenerateOptions,
	): Meshes<GEOMETRY>
	getState(): STATE
	getUpdater(): ItemUpdater<STATE>
}
export type { IRenderable as Renderable }

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
	disableLighting?: number
	addBlend?: boolean
	backfacesEnabled?: boolean
}

/** Collidable table element. */
export interface IHittable extends IPlayable {
	isCollidable(): boolean
	getHitShapes(): HitObject[]
	getEventProxy(): EventProxy
}
export type { IHittable as Hittable }

export function isHittable(arg: unknown): arg is IHittable {
	return typeof arg === 'object' && arg !== null && 'getHitShapes' in arg
}

/** Physics mover (1000Hz update). */
export interface IMovable extends IPlayable {
	getMover(): MoverObject
}
export type { IMovable as Movable }

export function isMovable(arg: unknown): arg is IMovable {
	return typeof arg === 'object' && arg !== null && 'getMover' in arg
}

/** Updated once per frame (vs movables at 1000Hz). Mirrors VPinball's `RenderDynamic`. */
export interface IAnimatable extends IPlayable {
	getAnimation(): IAnimation
}
export type { IAnimatable as Animatable }

export interface IAnimation {
	init(timeMsec: number): void
	updateAnimation(timeMsec: number, table: Table): boolean | void
}
export type { IAnimation as Animation }

export function isAnimatable(arg: unknown): arg is IAnimatable {
	return typeof arg === 'object' && arg !== null && 'getAnimation' in arg
}

/** Script-exposed table element. */
export interface IScriptable<T extends ItemApi<ItemData> = ItemApi<ItemData>> extends IPlayable {
	getApi(): T
	getEventNames(): string[]
}
export type { IScriptable as Scriptable }

export function isScriptable<T extends ItemApi<ItemData>>(arg: unknown): arg is IScriptable<T> {
	return typeof arg === 'object' && arg !== null && 'getApi' in arg
}
