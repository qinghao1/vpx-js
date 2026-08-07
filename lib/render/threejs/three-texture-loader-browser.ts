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

import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import {
	DataTexture,
	RGBAFormat,
	SRGBColorSpace,
	TextureLoader,
	type Texture as ThreeTexture,
	UnsignedByteType,
} from '../../refs.browser.js'
import type { ITextureLoader } from '../irender-api'
import { EXRLoader } from './vendor/EXRLoader'

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
		const MAX_TEXTURE_SIZE = 50 * 1024 * 1024
		if (data.length > MAX_TEXTURE_SIZE) {
			throw new Error(
				`Texture "${name}" too large (${(data.length / 1024 / 1024).toFixed(1)} MB > ${MAX_TEXTURE_SIZE / 1024 / 1024} MB), skipping to avoid OOM`,
			)
		}
		const mimeType = getMimeType(data, ext)
		if (!mimeType) {
			throw new Error('Unknown image format for texture "' + name + '".')
		}
		const objectUrl = URL.createObjectURL(
			new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as any], {
				type: mimeType as any,
			}),
		)
		// revoke after load to avoid leaks handled in load()
		const texture = await load(mimeType, objectUrl, ext)
		texture.name = `texture:${name}`
		texture.colorSpace = SRGBColorSpace
		texture.needsUpdate = true
		texture.anisotropy = 4
		return texture
	}
}

function getMimeType(data: Uint8Array, ext: string): string | null {
	if (data.length < 4) return null
	const view = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
	const header16 = view.getUint16(0, false)
	const header32 = data.length >= 4 ? view.getUint32(0, false) : 0
	switch (header16) {
		case 0x8950:
			return 'image/png'
		case 0xffd8:
			return 'image/jpeg'
		case 0x4749:
			return 'image/gif'
		case 0x424d:
			return 'image/bmp'
	}
	if (header32 === 0x89504e47) return 'image/png'
	if (
		data.length >= 12 &&
		data[0] === 0x52 &&
		data[1] === 0x49 &&
		data[2] === 0x46 &&
		data[3] === 0x46 &&
		data[8] === 0x57 &&
		data[9] === 0x45 &&
		data[10] === 0x42 &&
		data[11] === 0x50
	) {
		return 'image/webp'
	}
	if (data[0] === 0x23 && data[1] === 0x3f) return 'image/hdr'
	if (data[0] === 0x76 && data[1] === 0x2f) return 'image/exr'
	if (ext === '.hdr') return 'image/hdr'
	if (ext === '.exr') return 'image/exr'
	if (ext === '.png') return 'image/png'
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.bmp') return 'image/bmp'
	if (ext === '.gif') return 'image/gif'
	if (ext === '.webp') return 'image/webp'
	if (data.length > 100) {
		const head = String.fromCharCode(...data.slice(0, 10))
		if (head.includes('JFIF') || head.includes('Exif')) return 'image/jpeg'
		if (head.includes('PNG')) return 'image/png'
		if (head.includes('WEBP')) return 'image/webp'
	}
	return 'image/png'
}

function load(mimeType: string, url: string, ext?: string): Promise<ThreeTexture> {
	return new Promise((resolve, reject) => {
		if (
			mimeType === 'image/png' ||
			mimeType === 'image/jpeg' ||
			mimeType === 'image/bmp' ||
			mimeType === 'image/gif' ||
			mimeType === 'image/webp'
		) {
			new TextureLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(texture as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		} else if (mimeType === 'image/exr' || ext === '.exr') {
			new EXRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(texture as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		} else {
			new HDRLoader().load(
				url,
				(texture) => {
					URL.revokeObjectURL(url)
					resolve(texture as any)
				},
				undefined,
				(err) => {
					URL.revokeObjectURL(url)
					reject(err)
				},
			)
		}
	})
}
