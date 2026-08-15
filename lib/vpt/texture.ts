// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { basename } from 'node:path'
import { BiffParser } from '../io/biff-parser.js'
import { concatUint8Arrays } from '../io/binary-helpers.js'
import { LzwReader } from '../io/lzw-reader.js'
import type { Storage } from '../io/ole-doc.js'
import type { ITextureLoader } from '../render/irender-api.js'
import { logger } from '../util/logger.js'
import { Binary } from './binary.js'
import type { Table } from './table/table.js'

/**
 * VPinball texture — `Image*` storage entry.
 * @see https://github.com/vpinball/vpinball/blob/master/Texture.cpp
 */
export class Texture extends BiffParser {
	public localFileName?: string // either localPath or storageName is set
	public storageName?: string

	public szName!: string
	public szInternalName!: string
	public szPath?: string
	public width!: number
	public height!: number
	public alphaTestValue?: number
	public rgbTransparent?: number
	public binary?: Binary
	public pdsBuffer?: BaseTexture

	private constructor() {
		super()
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Texture> {
		const texture = new Texture()
		texture.storageName = itemName
		await storage.streamFiltered(itemName, 0, Texture.createStreamHandler(storage, itemName, texture))
		return texture
	}

	public static fromFilesystem(resFileName: string): Texture {
		const texture = new Texture()
		texture.localFileName = resFileName
		return texture
	}

	private static createStreamHandler(storage: Storage, itemName: string, texture: Texture) {
		texture.binary = new Binary()
		return BiffParser.stream(
			(buffer, tag, offset, len) => texture.fromTag(buffer, tag, offset, len, storage, itemName),
			{
				nestedTags: {
					JPEG: {
						onStart: () => new Binary(),
						onTag: binary => binary.fromTag.bind(binary),
						onEnd: binary => (texture.binary = binary),
					},
				},
			},
		)
	}

	public getName(): string {
		return this.localFileName
			? basename(this.localFileName)
			: (this.szInternalName || this.szName || '').toLowerCase()
	}

	/** Loads texture via renderer loader. */
	public async loadTexture<TEXTURE>(loader: ITextureLoader<TEXTURE>, table: Table): Promise<TEXTURE> {
		let texture: TEXTURE
		const fileName = (this.szPath || this.localFileName)!
		const ext = fileName.substr(fileName.lastIndexOf('.')).toLowerCase()
		if (this.isRaw()) {
			texture = await loader.loadRawTexture(this.getName(), this.pdsBuffer?.getData(), this.width, this.height)
			try {
				this.pdsBuffer = undefined
			} catch {}
		} else if (this.localFileName) {
			texture = await loader.loadDefaultTexture(this.getName(), ext, this.localFileName)
		} else {
			const data = await table.streamStorage<Uint8Array>('GameStg', storage =>
				this.streamImage(storage, this.storageName, this.binary),
			)
			if (!data?.length) {
				throw new Error(`Cannot load image data for texture ${this.getName()}`)
			}
			texture = await loader.loadTexture(this.getName(), ext, data)
		}
		return texture
	}

	public isRaw(): boolean {
		return this.pdsBuffer !== undefined
	}

	public isHdr() {
		return this.pdsBuffer && this.pdsBuffer.format === BaseTexture.RGB_FP
	}

	private async streamImage(storage: Storage, storageName?: string, binary?: Binary): Promise<Uint8Array> {
		const strm = storage.stream(storageName!, binary?.pos, binary?.len)
		return new Promise<Uint8Array>((resolve, reject) => {
			const bufs: Uint8Array[] = []
			/* istanbul ignore if */
			if (!strm) {
				return reject(new Error(`No such stream "${storageName}".`))
			}
			strm.on('error', reject)
			strm.on('data', (buf: Uint8Array) => bufs.push(buf))
			strm.on('end', () => resolve(concatUint8Arrays(...bufs)))
		})
	}

	private async fromTag(
		buffer: Uint8Array,
		tag: string,
		offset: number,
		len: number,
		storage: Storage,
		itemName: string,
	): Promise<number> {
		switch (tag) {
			case 'NAME':
				this.szName = this.getString(buffer, len)
				break
			case 'INME':
				this.szInternalName = this.getString(buffer, len)
				break
			case 'PATH':
				this.szPath = this.getString(buffer, len)
				break
			case 'WDTH':
				this.width = this.getInt(buffer)
				break
			case 'HGHT':
				this.height = this.getInt(buffer)
				break
			case 'ALTV':
				this.alphaTestValue = this.getFloat(buffer)
				break
			case 'BITS': {
				let compressedLen: number
				;[this.pdsBuffer, compressedLen] = await BaseTexture.get(
					storage,
					itemName,
					offset,
					this.width,
					this.height,
				)
				return compressedLen + 4
			}

			/* istanbul ignore next: duh. */
			case 'LINK':
				logger().warn(
					'[Texture.fromTag] Ignoring LINK tag for %s at %s, implement when understood what it is.',
					this.szName,
					this.storageName,
				)
				break

			/* istanbul ignore next: legacy vp9 */
			case 'TRNS':
				this.rgbTransparent = this.getInt(buffer)
				break
			case 'SIGN':
				this.getInt(buffer)
				break
			case 'OPAQ':
				this.getInt(buffer)
				break
			/* istanbul ignore next */
			default:
				logger().warn('[Texture.fromTag] Unknown tag "%s".', tag)
		}
		return 0
	}
}

class BaseTexture {
	public static readonly RGBA = 0
	public static readonly RGB_FP = 1

	private width: number
	private height: number
	public format: number = BaseTexture.RGBA
	private data!: Uint8Array

	constructor(width: number, height: number) {
		this.width = width
		this.height = height
	}

	public getData(): Uint8Array {
		return this.data
	}

	public static async get(
		storage: Storage,
		itemName: string,
		pos: number,
		width: number,
		height: number,
	): Promise<[BaseTexture, number]> {
		const pdsBuffer = new BaseTexture(width, height)
		const compressed = await storage.read(itemName, pos)

		const lzw = new LzwReader(compressed, width * 4, height, pdsBuffer.pitch())
		let compressedLen: number
		;[pdsBuffer.data, compressedLen] = lzw.decompress()

		const lpitch = pdsBuffer.pitch()

		// Assume our 32 bit color structure
		// Find out if all alpha values are zero
		const pch = pdsBuffer.data
		let allAlphaZero = true
		loop: for (let i = 0; i < height; i++) {
			for (let l = 0; l < width; l++) {
				if (pch[i * lpitch + 4 * l + 3] !== 0) {
					allAlphaZero = false
					break loop
				}
			}
		}

		// all alpha values are 0: set them all to 0xff
		if (allAlphaZero) {
			for (let i = 0; i < height; i++) {
				for (let l = 0; l < width; l++) {
					pch[i * lpitch + 4 * l + 3] = 0xff
				}
			}
		}
		pdsBuffer.data = pdsBuffer.rgbToBgr(width, height)
		return [pdsBuffer, compressedLen]
	}

	private rgbToBgr(width: number, height: number): Uint8Array {
		const pitch = this.pitch()
		const from = this.data
		const to = new Uint8Array(pitch * height)
		for (let i = 0; i < height; i++) {
			for (let l = 0; l < width; l++) {
				if (this.format === BaseTexture.RGBA) {
					to[i * pitch + 4 * l] = from[i * pitch + 4 * l + 2] // r
					to[i * pitch + 4 * l + 1] = from[i * pitch + 4 * l + 1] // g
					to[i * pitch + 4 * l + 2] = from[i * pitch + 4 * l] // b
					to[i * pitch + 4 * l + 3] = from[i * pitch + 4 * l + 3] // a
				} else {
					to[i * pitch + 4 * l] = from[i * pitch + 4 * l + 6] // r
					to[i * pitch + 4 * l + 1] = from[i * pitch + 4 * l + 7]
					to[i * pitch + 4 * l + 2] = from[i * pitch + 4 * l + 8]

					to[i * pitch + 4 * l + 3] = from[i * pitch + 4 * l + 3] // g
					to[i * pitch + 4 * l + 4] = from[i * pitch + 4 * l + 4]
					to[i * pitch + 4 * l + 5] = from[i * pitch + 4 * l + 5]

					to[i * pitch + 4 * l + 6] = from[i * pitch + 4 * l] // b
					to[i * pitch + 4 * l + 7] = from[i * pitch + 4 * l + 1]
					to[i * pitch + 4 * l + 8] = from[i * pitch + 4 * l + 2]

					to[i * pitch + 4 * l + 9] = from[i * pitch + 4 * l + 9] // a
				}
			}
		}
		return to
	}

	private pitch(): number {
		return (this.format === BaseTexture.RGBA ? 4 : 3 * 4) * this.width
	}
}
