// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { MAX_REELS } from '../../physics/constants.js'
import { ItemApi } from '../item-api.js'
import type { DispReelData } from './dispreel-data.js'

/** DispReelApi API.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/dispreel.cpp */
export class DispReelApi extends ItemApi<DispReelData> {
	/** Get BackColor. */
	get BackColor() {
		return this.data.backColor
	}
	set BackColor(v) {
		this.data.backColor = v
	}
	/** Get Reels. */
	get Reels() {
		return this.data.reelCount
	}
	set Reels(v) {
		this.data.reelCount = Math.min(Math.max(1, v), MAX_REELS) // must have at least 1 reel and a max of MAX_REELS
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	/** Get Width. */
	get Width() {
		return this.data.width
	}
	set Width(v) {
		this.data.width = Math.max(0.0, v)
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
	}
	/** Get Height. */
	get Height() {
		return this.data.height
	}
	set Height(v) {
		this.data.height = Math.max(0.0, v)
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	/** Get X. */
	get X() {
		return this.data.v1.x
	}
	set X(v) {
		const delta = v - this.data.v1.x
		this.data.v1.x += delta
		this.data.v2.x = this.data.v1.x + this.data.getBoxWidth()
	}
	/** Get Y. */
	get Y() {
		return this.data.v1.y
	}
	set Y(v) {
		const delta = v - this.data.v1.y
		this.data.v1.y += delta
		this.data.v2.y = this.data.v1.y + this.data.getBoxHeight()
	}
	/** Get IsTransparent. */
	get IsTransparent() {
		return this.data.isTransparent
	}
	set IsTransparent(v) {
		this.data.isTransparent = v
	}
	/** Get Image. */
	get Image() {
		return this.data.szImage
	}
	set Image(v) {
		this._assertNonHdrImage(v)
		this.data.szImage = v
	}
	/** Get Spacing. */
	get Spacing() {
		return this.data.reelSpacing
	}
	set Spacing(v) {
		this.data.reelSpacing = v
	}
	/** Get Sound. */
	get Sound() {
		return this.data.szSound
	}
	set Sound(v) {
		this.data.szSound = v
	}
	/** Get Steps. */
	get Steps() {
		return this.data.motorSteps
	}
	set Steps(v) {
		this.data.motorSteps = Math.max(1, v)
	}
	/** Get Range. */
	get Range() {
		return this.data.digitRange
	}
	set Range(v) {
		this.data.digitRange = Math.max(0, v) // must have at least 1 digit (0 is a digit)
		if (this.data.digitRange > 512 - 1) {
			this.data.digitRange = 512 - 1 // and a max of 512 (0->511) //!! 512 requested by highrise
		}
	}
	/** Get UpdateInterval. */
	get UpdateInterval() {
		return this.data.updateInterval
	}
	set UpdateInterval(v) {
		this.data.updateInterval = Math.max(5, v)
	}
	/** Get UseImageGrid. */
	get UseImageGrid() {
		return this.data.useImageGrid
	}
	set UseImageGrid(v) {
		this.data.useImageGrid = v
	}
	/** Get Visible. */
	get Visible() {
		return this.data.isVisible
	}
	set Visible(v) {
		this.data.isVisible = v
	}
	/** Get ImagesPerGridRow. */
	get ImagesPerGridRow() {
		return this.data.imagesPerGridRow
	}
	set ImagesPerGridRow(v) {
		this.data.imagesPerGridRow = v
	}

	public AddValue(value: number): void {
		// TODO implement
	}

	public SetValue(value: number): void {
		// TODO implement
	}

	public ResetToZero(): void {
		// TODO implement
	}

	public SpinReel(reelNumber: number, pulseCount: number): void {
		// TODO implement
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(DispReelApi.prototype)
	}
}
