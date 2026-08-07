// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex3D } from '../../util/math.js'
import { Vertex3DNoTex2 } from '../../util/vertex.js'
import { FrameData } from '../animation.js'
import { handleBiffTag } from '../biff-helper.js'
import { type IPhysicalData, ItemData } from '../item-data.js'
import { Mesh } from '../mesh.js'

const RTV_TAGS = ['RTV0', 'RTV1', 'RTV2', 'RTV3', 'RTV4', 'RTV5', 'RTV6', 'RTV7', 'RTV8']
const FLOAT_MAP: Record<string, string> = {
	PIDB: 'depthBias',
	THRS: 'threshold',
	ELAS: 'elasticity',
	ELFO: 'elasticityFalloff',
	RFCT: 'friction',
	RSCT: 'scatter',
	EFUI: 'edgeFactorUI',
	CORF: 'collisionReductionFactor',
	DILI: 'disableLightingTop',
	DILB: 'disableLightingBelow',
	FALP: 'alpha',
}
const INT_MAP: Record<string, string> = { COLR: 'color' }
const BOOL_MAP: Record<string, string> = {
	DTXI: 'drawTexturesInside',
	HTEV: 'hitEvent',
	CLDR: 'isCollidable',
	ISTO: 'isToy',
	OVPH: 'overwritePhysics',
	STRE: 'staticRendering',
	U3DM: 'use3DMesh',
	EBFC: 'backfacesEnabled',
	DIPT: 'displayTexture',
	OSNM: 'objectSpaceNormalMap',
	ADDB: 'addBlend',
	ZMSK: 'useDepthMask',
}
const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	NRMA: 'szNormalMap',
	MATR: 'szMaterial',
	MAPH: 'szPhysicsMaterial',
	LMAP: 'szLightmap',
}

/** Primitive data.
 * @see https://github.com/vpinball/vpinball/blob/master/primitive.cpp */
export class PrimitiveData extends ItemData implements IPhysicalData {
	public numVertices!: number
	public compressedAnimationVertices?: number
	public compressedVertices?: number
	public compressedIndices?: number
	private readonly skipMeshes: boolean
	public mesh: Mesh = new Mesh()
	public position!: Vertex3D
	public size: Vertex3D = new Vertex3D(100, 100, 100)
	public rotAndTra: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	public szImage?: string
	public szNormalMap?: string
	public szMaterial?: string
	public szPhysicsMaterial?: string
	public szLightmap?: string
	public sides = 4
	public isVisible = true
	public drawTexturesInside = false
	public hitEvent = false
	public threshold = 2
	public elasticity = 0.3
	public elasticityFalloff = 0.5
	public friction = 0.3
	public scatter = 0
	public collisionReductionFactor = 0
	public isCollidable = true
	public isToy = false
	public overwritePhysics = false
	public use3DMesh = false
	public useAsPlayfield = false
	public sideColor = 0x969696
	private numIndices!: number
	public isReflectionEnabled = true
	public edgeFactorUI = 0.25
	public staticRendering = true
	public disableLightingTop = 0
	public disableLightingBelow = 1
	public backfacesEnabled = false
	public displayTexture = false
	public meshFileName?: string
	public depthBias = 0
	public objectSpaceNormalMap = false
	public addBlend = false
	public useDepthMask = true
	public alpha = 1
	public color = 0xffffff

	public static async fromStorage(storage: Storage, itemName: string, skipMeshes: boolean): Promise<PrimitiveData> {
		const d = new PrimitiveData(itemName, skipMeshes)
		await storage.streamFiltered(
			itemName,
			4,
			BiffParser.stream((b, t, o, l) => d.fromTag(b, t, o, l, storage, itemName)),
		)
		return d
	}

	public constructor(itemName: string, skipMeshes: boolean) {
		super(itemName)
		this.skipMeshes = skipMeshes
	}

	private async fromTag(
		buffer: Uint8Array,
		tag: string,
		offset: number,
		len: number,
		storage: Storage,
		itemName: string,
	): Promise<number> {
		if (RTV_TAGS.includes(tag)) {
			const idx = RTV_TAGS.indexOf(tag)
			this.rotAndTra[idx] = this.getFloat(buffer)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		switch (tag) {
			case 'VPOS':
				this.position = Vertex3D.get(buffer)
				break
			case 'VSIZ':
				this.size = Vertex3D.get(buffer)
				break
			case 'SIDS':
				this.sides = this.getInt(buffer)
				break
			case 'SCOL':
				this.sideColor = this.getInt(buffer)
				break
			case 'TVIS':
				this.isVisible = this.getBool(buffer)
				break
			case 'REEN':
				this.isReflectionEnabled = this.getBool(buffer)
				break
			case 'M3DN':
				this.meshFileName = this.getWideString(buffer, len)
				break
			case 'M3VN':
				this.numVertices = this.getInt(buffer)
				this.mesh.animationFrames = []
				break
			case 'M3DX':
				this.mesh.vertices = this.getVertices(buffer, this.numVertices)
				break
			case 'M3AY':
				this.compressedAnimationVertices = this.getInt(buffer)
				break
			case 'M3AX':
				if (!this.skipMeshes)
					this.mesh.animationFrames.push(
						await this.getAnimatedVertices(
							await BiffParser.decompress(await this.getData(storage, itemName, offset, len)),
							this.numVertices,
						),
					)
				break
			case 'M3CY':
				this.compressedVertices = this.getInt(buffer)
				break
			case 'M3CX':
				if (!this.skipMeshes)
					this.mesh.vertices = this.getVertices(
						await BiffParser.decompress(await this.getData(storage, itemName, offset, len)),
						this.numVertices,
					)
				break
			case 'M3FN':
				this.numIndices = this.getInt(buffer)
				break
			case 'M3DI':
				if (!this.skipMeshes)
					this.mesh.indices =
						this.numVertices > 65535
							? this.getUnsignedInt4s(buffer, this.numIndices)
							: this.getUnsignedInt2s(buffer, this.numIndices)
				break
			case 'M3CJ':
				this.compressedIndices = this.getInt(buffer)
				break
			case 'M3CI':
				if (!this.skipMeshes) {
					const decomp = await BiffParser.decompress(await this.getData(storage, itemName, offset, len))
					this.mesh.indices =
						this.numVertices > 65535
							? this.getUnsignedInt4s(decomp, this.numIndices)
							: this.getUnsignedInt2s(decomp, this.numIndices)
				}
				break
			default:
				this.getCommonBlock(buffer, tag, len)
				break
		}
		return 0
	}

	private getVertices(buf: Uint8Array, num: number): Vertex3DNoTex2[] {
		if (buf.length < num * Vertex3DNoTex2.size)
			throw new Error(
				`Tried to read ${num} vertices for primitive "${this.getName()}" (${this.itemName}), but only ${buf.length} bytes available.`,
			)
		return Array.from({ length: num }, (_, i) => Vertex3DNoTex2.get(buf, i))
	}

	private async getAnimatedVertices(buf: Uint8Array, num: number): Promise<FrameData> {
		return FrameData.get(buf, num)
	}
}
