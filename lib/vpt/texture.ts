// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BIFF_TAG_HEADER_SIZE, BiffParser } from '../io/biff-parser.js'
import { LzwReader } from '../io/lzw-reader.js'
import type { Storage } from '../io/ole-doc.js'
import type { ITextureLoader } from '../render/irender-api.js'
import { logger } from '../util/logger.js'
import { Binary } from './binary.js'
import type { Table } from './table/table.js'

/**
 * VPinball texture — `Image*` storage entry.
 * @see https://github.com/vpinball/vpinball/blob/master/src/renderer/Texture.cpp
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
	public isOpaque?: boolean
	public rgbTransparent?: number
	public binary?: Binary
	public pdsBuffer?: BaseTexture

	private constructor() {
		super()
	}

	public static async fromStorage(storage: Storage, itemName: string): Promise<Texture> {
		const texture = new Texture()
		texture.storageName = itemName
		await storage.streamFiltered(itemName, 0, Texture.createStreamHandler(texture))
		return texture
	}

	public static fromFilesystem(resFileName: string): Texture {
		const texture = new Texture()
		texture.localFileName = resFileName
		return texture
	}

	private static createStreamHandler(texture: Texture) {
		texture.binary = new Binary()
		return BiffParser.stream((buffer, tag, offset, len) => texture.fromTag(buffer, tag, offset, len), {
			nestedTags: {
				JPEG: {
					onStart: () => new Binary(),
					onTag: binary => binary.fromTag.bind(binary),
					onEnd: binary => (texture.binary = binary),
				},
			},
			// BITS declares len 4 (header only); the LZW payload is self-terminated,
			// so it decompresses straight from the fetched range with no second read.
			rawTags: {
				BITS: async range => {
					const [pdsBuffer, compressedLen] = BaseTexture.fromBytes(
						range.subarray(BIFF_TAG_HEADER_SIZE),
						texture.width,
						texture.height,
					)
					texture.pdsBuffer = pdsBuffer
					return compressedLen + 4
				},
			},
		})
	}

	public getName(): string {
		return this.localFileName
			? this.localFileName.split(/[\\/]/).pop() || ''
			: (this.szName || this.szInternalName || '').toLowerCase()
	}

	/**
	 * Loads texture via renderer loader.
	 *
	 * Call-site note: `ext` is advisory (derived from szPath, empty when
	 * unset). The Node loader (`ThreeTextureLoaderNode`) only decodes
	 * PNG/HDR/EXR payloads — JPEG/WebP/GIF/BMP data resolves to a white 1x1
	 * placeholder there (documented at the loader), while the browser loader
	 * decodes them for real. Non-PNG exports therefore differ by platform.
	 */
	public async loadTexture<TEXTURE>(loader: ITextureLoader<TEXTURE>, table: Table): Promise<TEXTURE> {
		if (this.isRaw()) {
			return loader.loadRawTexture(this.getName(), this.pdsBuffer?.getData(), this.width, this.height)
		}
		// Upstream extension_from_path returns "" for dotless names; ext includes the dot per ITextureLoader.
		const fileName = this.szPath || this.localFileName || ''
		const dot = fileName.lastIndexOf('.')
		const ext = (dot >= 0 ? fileName.substring(dot) : '').toLowerCase()
		if (this.localFileName) {
			return loader.loadDefaultTexture(this.getName(), ext, this.localFileName)
		}
		// A table texture without a source range was already consumed (the map
		// generator clears binary/pdsBuffer after a successful load) or never
		// parsed one. Reading without pos/len would fetch the whole OLE stream
		// — BIFF headers plus payload — which no image decoder accepts (it
		// surfaces as a message-less DOM error event). Fail fast instead.
		if (this.storageName && (this.binary?.pos === undefined || this.binary?.len === undefined)) {
			throw new Error(`Cannot load image data for texture ${this.getName()} (source cleared or missing)`)
		}
		const data = await table.streamStorage<Uint8Array>('GameStg', storage =>
			storage.read(this.storageName!, this.binary?.pos, this.binary?.len),
		)
		if (!data?.length) {
			throw new Error(`Cannot load image data for texture ${this.getName()}`)
		}
		return loader.loadTexture(this.getName(), ext, data)
	}

	public isRaw(): boolean {
		return this.pdsBuffer !== undefined
	}

	/** Upstream `Texture::IsHDR` checks the decoded buffer format, else the file extension. */
	public isHdr(): boolean {
		if (this.pdsBuffer?.format === BaseTexture.RGB_FP) return true
		const fileName = (this.szPath || this.localFileName || '').toLowerCase()
		return fileName.endsWith('.exr') || fileName.endsWith('.hdr')
	}

	private async fromTag(buffer: Uint8Array, tag: string, _offset: number, len: number): Promise<number> {
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
				// Native stores 0..255 on disk and normalizes on load (Texture.cpp: AsFloat() * (1/255)).
				this.alphaTestValue = this.getFloat(buffer) / 255
				break
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
				this.isOpaque = this.getBool(buffer)
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
	public format: number = BaseTexture.RGBA
	private data!: Uint8Array

	constructor(width: number) {
		this.width = width
	}

	public getData(): Uint8Array {
		return this.data
	}

	public static fromBytes(payload: Uint8Array, width: number, height: number): [BaseTexture, number] {
		const pdsBuffer = new BaseTexture(width)
		const lzw = new LzwReader(payload, width * 4, height, pdsBuffer.pitch())
		let compressedLen: number
		;[pdsBuffer.data, compressedLen] = lzw.decompress()
		pdsBuffer.swapRedBlue(width, height)
		return [pdsBuffer, compressedLen]
	}

	/**
	 * Swaps R/B in place (no second alloc), folding in the all-zero-alpha
	 * scan — alpha is untouched by the swap, so one pass detects as well.
	 */
	private swapRedBlue(width: number, height: number): void {
		// format is initialized RGBA and never reassigned; anything else is
		// corrupt input, so throw instead of mis-decoding.
		if (this.format !== BaseTexture.RGBA) throw new Error(`unsupported texture format ${this.format}`)
		const data = this.data
		const pitch = this.pitch()
		// Assume our 32 bit color structure
		let allAlphaZero = true
		for (let y = 0; y < height; y++) {
			const row = y * pitch
			for (let x = 0; x < width; x++) {
				const off = row + 4 * x
				const r = data[off]
				data[off] = data[off + 2] // r
				data[off + 2] = r // b
				if (data[off + 3] !== 0) allAlphaZero = false // a
			}
		}
		// all alpha values are 0: set them all to 0xff
		if (allAlphaZero) {
			for (let y = 0; y < height; y++) {
				const row = y * pitch
				for (let x = 0; x < width; x++) {
					data[row + 4 * x + 3] = 0xff
				}
			}
		}
	}

	private pitch(): number {
		return (this.format === BaseTexture.RGBA ? 4 : 3 * 4) * this.width
	}
}
