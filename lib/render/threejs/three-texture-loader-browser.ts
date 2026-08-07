/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import {
	DataTexture,
	RGBAFormat,
	SRGBColorSpace,
	TextureLoader,
	type Texture as ThreeTexture,
	UnsignedByteType,
} from '../../refs.browser.js'
import type { ITextureLoader } from '../irender-api'
import { RGBELoader } from './vendor/RGBELoader'

const imageMap: { [key: string]: string } = {
	bumperbase: new URL('../../../res/maps/bumperbase.png', import.meta.url).href,
	bumperCap: new URL('../../../res/maps/bumperCap.png', import.meta.url).href,
	bumperring: new URL('../../../res/maps/bumperring.png', import.meta.url).href,
	bumperskirt: new URL('../../../res/maps/bumperskirt.png', import.meta.url).href,
	kickerCup: new URL('../../../res/maps/kickerCup.png', import.meta.url).href,
	kickerGottlieb: new URL('../../../res/maps/kickerGottlieb.png', import.meta.url).href,
	kickerHoleWood: new URL('../../../res/maps/kickerHoleWood.png', import.meta.url).href,
	kickerT1: new URL('../../../res/maps/kickerT1.png', import.meta.url).href,
	kickerWilliams: new URL('../../../res/maps/kickerWilliams.png', import.meta.url).href,
	ball: new URL('../../../res/maps/ball.png', import.meta.url).href,
}

export class ThreeTextureLoaderBrowser implements ITextureLoader<ThreeTexture> {
	public async loadDefaultTexture(name: string, ext: string, fileName: string): Promise<ThreeTexture> {
		const key = fileName.substr(0, fileName.lastIndexOf('.'))
		if (!imageMap[key]) {
			throw new Error('Unknown local texture "' + key + '".')
		}
		return new TextureLoader().load(imageMap[key])
	}

	public async loadRawTexture(name: string, data: Uint8Array, width: number, height: number): Promise<ThreeTexture> {
		const texture = new DataTexture(data as any, width, height, RGBAFormat as any)
		texture.flipY = true
		texture.colorSpace = SRGBColorSpace
		texture.needsUpdate = true
		return texture
	}

	public async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const mimeType = getMimeType(data, ext)
		if (!mimeType) {
			throw new Error('Unknown image format for texture "' + name + '".')
		}
		const objectUrl = URL.createObjectURL(new Blob([data.buffer as any], { type: mimeType as any }))
		const texture = await load(mimeType, objectUrl)
		texture.name = `texture:${name}`
		texture.colorSpace = SRGBColorSpace
		texture.needsUpdate = true
		texture.anisotropy = 4
		return texture
	}
}

function getMimeType(data: Uint8Array, ext: string): string | null {
	const header = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength).getUint16(0)
	switch (header) {
		case 0x8950:
			return 'image/png'
		case 0xffd8:
			return 'image/jpeg'
		case 0x4749:
			return 'image/gif'
		case 0x424d:
			return 'image/bmp'
		default:
			if (ext === '.hdr' || ext === '.exr') return 'application/octet-stream'
			if (ext === '.png') return 'image/png'
			if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
			return null
	}
}

function load(mimeType: string, url: string): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/bmp' || mimeType === 'image/gif') {
			new TextureLoader().load(url, resolve as any, undefined, reject)
		} else {
			new RGBELoader().load(url, resolve as any, undefined, reject)
		}
	})
}
