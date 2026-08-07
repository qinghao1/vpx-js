// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ItemApi } from '../item-api.js'
import type { TextboxData } from './textbox-data.js'

export class TextboxApi extends ItemApi<TextboxData> {
	get BackColor() {
		return this.data.backColor
	}
	set BackColor(v) {
		this.data.backColor = v
	}
	get FontColor() {
		return this.data.fontColor
	}
	set FontColor(v) {
		this.data.fontColor = v
	}
	get Text() {
		return this.data.text
	}
	set Text(v) {
		this.data.text = v
	}
	get Width() {
		return this.data.v2.x - this.data.v1.x
	}
	set Width(v) {
		this.data.v2.x = this.data.v1.x + v
	}
	get Height() {
		return this.data.v2.y - this.data.v1.y
	}
	set Height(v) {
		this.data.v2.y = this.data.v1.y + v
	}
	get X() {
		return this.data.v1.x
	}
	set X(v) {
		const delta = v - this.data.v1.x
		this.data.v1.x += delta
		this.data.v2.x += delta
	}
	get Y() {
		return this.data.v1.y
	}
	set Y(v) {
		const delta = v - this.data.v1.y
		this.data.v1.y += delta
		this.data.v2.y += delta
	}
	get IntensityScale() {
		return this.data.intensityScale
	}
	set IntensityScale(v) {
		this.data.intensityScale = v
	}
	get Alignment() {
		return this.data.align
	}
	set Alignment(v) {
		this.data.align = v
	}
	get IsTransparent() {
		return this.data.isTransparent
	}
	set IsTransparent(v) {
		this.data.isTransparent = v
	}
	get DMD() {
		return this.data.isDMD
	}
	set DMD(v) {
		this.data.isDMD = v
	}
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}

	/**
	 * No idea wtf this is supposed to do.
	 */
	public InterfaceSupportsErrorInfo(riid: any): boolean {
		return false
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(TextboxApi.prototype)
	}
}
