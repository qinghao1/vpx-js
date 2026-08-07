// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemApi } from '../item-api.js'
import type { DecalData } from './decal-data.js'

/** Decal API — VBS surface for `Decal`. @see https://github.com/vpinball/vpinball/blob/master/decal.cpp */
export class DecalApi extends ItemApi<DecalData> {
	get Rotation() {
		return this.data.rotation
	}
	set Rotation(v) {
		this.data.rotation = v
	}
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	get Width() {
		return this.data.width
	}
	set Width(v) {
		this.data.width = v
	}
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = v
	}
	get X() {
		return this.data.center.x
	}
	set X(v) {
		this.data.center.x = v
	}
	get Y() {
		return this.data.center.y
	}
	set Y(v) {
		this.data.center.y = v
	}
	get Surface() {
		return this.data.szSurface
	}
	set Surface(v) {
		this.data.szSurface = v
	}
	get Type() {
		return this.data.decalType
	}
	set Type(v) {
		this.data.decalType = v
	}
	get Text() {
		return this.data.text
	}
	set Text(v) {
		this.data.text = v
	}
	get SizingType() {
		return this.data.sizingType
	}
	set SizingType(v) {
		this.data.sizingType = v
	}
	get FontColor() {
		return this.data.color
	}
	set FontColor(v) {
		this.data.color = v
	}
	get Material() {
		return this.data.szMaterial
	}
	set Material(v) {
		this.data.szMaterial = v
	}
	get Font() {
		return this.data.font
	}
	set Font(v) {
		this.data.font = v
	}
	get HasVerticalText() {
		return this.data.verticalText
	}
	set HasVerticalText(v) {
		this.data.verticalText = v
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(DecalApi.prototype)
	}
}
