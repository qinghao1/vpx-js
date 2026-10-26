// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import { Enums } from '../enums.js'
import { ItemApi } from '../item-api.js'
import type { Table } from '../table/table.js'
import { clampAddBlend, type FlasherData } from './flasher-data.js'
import type { FlasherState } from './flasher-state.js'

/** Flasher API — VBS surface for `Flasher`. @see https://github.com/vpinball/vpinball/blob/master/flasher.cpp */
export class FlasherApi extends ItemApi<FlasherData> {
	constructor(
		data: FlasherData,
		events: EventProxy,
		player: Player,
		table: Table,
		private readonly _state?: FlasherState,
	) {
		super(data, events, player, table)
	}

	get X() {
		return this.data.getCenter().x
	}
	set X(value) {
		const center = this.data.getCenter().x
		if (center !== value) {
			const delta = value - center
			for (const dragPoint of this.data.dragPoints) {
				dragPoint.vertex.x += delta
			}
		}
	}
	get Y() {
		return this.data.getCenter().y
	}
	set Y(value) {
		const center = this.data.getCenter().y
		if (center !== value) {
			const delta = value - center
			for (const dragPoint of this.data.dragPoints) {
				dragPoint.vertex.y += delta
			}
		}
	}
	get RotX() {
		return this._state?.rotX ?? this.data.rotX
	}
	set RotX(value) {
		this.data.rotX = value
		if (this._state) this._state.rotX = value
	}
	get RotY() {
		return this._state?.rotY ?? this.data.rotY
	}
	set RotY(value) {
		this.data.rotY = value
		if (this._state) this._state.rotY = value
	}
	get RotZ() {
		return this._state?.rotZ ?? this.data.rotZ
	}
	set RotZ(value) {
		this.data.rotZ = value
		if (this._state) this._state.rotZ = value
	}
	get Height() {
		return this._state?.height ?? this.data.height
	}
	set Height(value) {
		this.data.height = value
		if (this._state) this._state.height = value
	}
	get Color() {
		return this._state?.color ?? this.data.color
	}
	set Color(value) {
		this.data.color = value
		if (this._state) this._state.color = value
	}
	get ImageA() {
		return this.data.szImageA
	}
	set ImageA(value) {
		this.data.szImageA = value
	}
	get ImageB() {
		return this.data.szImageB
	}
	set ImageB(value) {
		this.data.szImageB = value
	}
	get Alpha() {
		return this._state?.alpha ?? this.data.alpha
	}
	set Alpha(value) {
		const val = Math.max(0, value)
		this.data.alpha = val
		if (this._state) this._state.alpha = val
	}
	get ModulateVsAdd() {
		return this.data.modulateVsAdd
	}
	set ModulateVsAdd(value) {
		this.data.modulateVsAdd = Math.max(0, Math.min(1, value))
	}
	get Visible() {
		return this._state?.isVisible ?? this.data.isVisible
	}
	set Visible(value) {
		// Upstream put_Visible writes m_d only; the sequencer lock lives in
		// FlasherState and is never touched here, so mid-run script writes survive unlock.
		const val = !!value
		this.data.isVisible = val
		if (this._state) this._state.isVisible = val
	}
	get AddBlend() {
		return this.data.addBlend
	}
	set AddBlend(value) {
		this.data.addBlend = value
	}
	get AddBlendMode() {
		return this.data.addBlendMode
	}
	set AddBlendMode(value) {
		this.data.addBlendMode = clampAddBlend(value)
	}
	get DMD() {
		return this.data.isDMD
	}
	set DMD(value) {
		this.data.isDMD = value
	}
	get DisplayTexture() {
		return this.data.displayTexture
	}
	set DisplayTexture(value) {
		this.data.displayTexture = value
	}
	get DepthBias() {
		return this.data.depthBias
	}
	set DepthBias(value) {
		this.data.depthBias = value
	}
	get ImageAlignment() {
		return this.data.imageAlignment
	}
	set ImageAlignment(value) {
		this.data.imageAlignment = value
	}
	get Filter() {
		return filterToName(this.data.filter)
	}
	set Filter(value) {
		const filter = nameToFilter(value)
		if (filter !== undefined) {
			this.data.filter = filter
		}
	}
	get Opacity() {
		return this._state?.alpha ?? this.data.alpha
	}
	set Opacity(value) {
		const val = Math.max(0, value)
		this.data.alpha = val
		if (this._state) this._state.alpha = val
	}
	get Amount() {
		return this.data.filterAmount
	}
	set Amount(value) {
		this.data.filterAmount = Math.max(0, value)
	}
	get FilterAmount() {
		return this.data.filterAmount
	}
	set FilterAmount(value) {
		this.data.filterAmount = Math.max(0, value)
	}
	get IntensityScale() {
		return this.data.intensityScale
	}
	set IntensityScale(v) {
		this.data.intensityScale = v
	}
}

function filterToName(filter: number): string {
	switch (filter) {
		case Enums.Filters.Filter_Additive:
			return 'Additive'
		case Enums.Filters.Filter_Multiply:
			return 'Multiply'
		case Enums.Filters.Filter_Overlay:
			return 'Overlay'
		case Enums.Filters.Filter_Screen:
			return 'Screen'
		case Enums.Filters.Filter_None:
			return 'None'
	}
	return 'None'
}

function nameToFilter(name?: string): number | undefined {
	switch ((name || '').toLowerCase()) {
		case 'additive':
			return Enums.Filters.Filter_Additive
		case 'multiply':
			return Enums.Filters.Filter_Multiply
		case 'overlay':
			return Enums.Filters.Filter_Overlay
		case 'screen':
			return Enums.Filters.Filter_Screen
		case 'none':
			return Enums.Filters.Filter_None
	}
	return undefined
}
