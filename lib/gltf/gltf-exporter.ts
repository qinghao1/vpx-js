// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { createRequire } from 'node:module'
import {
	type AnimationClip,
	type Bone,
	BufferAttribute,
	type BufferGeometry,
	type Camera,
	type Color,
	DoubleSide,
	type InterleavedBufferAttribute,
	InterpolateDiscrete,
	InterpolateLinear,
	type KeyframeTrack,
	type Light,
	Math as M,
	type Material,
	type Matrix4,
	type Mesh,
	type Object3D,
	type PixelFormat,
	PropertyBinding,
	Scene,
	type Texture,
	TriangleFanDrawMode,
	TriangleStripDrawMode,
	Vector3,
} from '../refs.node.js'
import { logger } from '../util/logger.js'
import type { TableGenerateGltfOptions } from '../vpt/table/table.js'
import type {
	GltfAnimationSampler,
	GltfBufferView,
	GltfCamera,
	GltfFile,
	GltfId,
	GltfImage,
	GltfMaterial,
	GltfMesh,
	GltfMeshPrimitive,
	GltfNode,
	GltfScene,
} from './gltf.js'
import { Utils } from './gltf-animation-utils.js'
import type {
	AnimationClipInternal,
	BufferView,
	CameraInternal,
	ExtensionsUsed,
	GeometryInternal,
	KeyframeTrackInternal,
	LightDefinition,
	LightInternal,
	MapDefinition,
	MaterialInternal,
	MeshInternal,
	Object3DInternal,
	TransformDefinition,
} from './gltf-internal.js'
import type { NodeImage } from './image.node.js'

const require = createRequire(import.meta.url)

const gltfPipeline = require('gltf-pipeline')
const PromisePool = require('es6-promise-pool')

import { PATH_PROPERTIES, THREE_TO_WEBGL, WEBGL_CONSTANTS } from './gltf-constants.js'
import {
	equalArray,
	getPaddedArrayBuffer,
	getPaddedBufferSize,
	serializeUserData,
	stringToBuffer,
} from './gltf-utils.js'

/**
 * This is a modified version of Three's GLTF exporter that runs better
 * on Node.js.
 *
 * Changes:
 *
 *  - Port to Typescript (and make it a module)
 *  - Don't use Canvas but ~20x faster sharp.js for image manipulation
 *  - Don't resolve all pending promises at once but use a pool
 *  - Be intelligent about re-using images
 *  - Adds Draco compression support
 *
 * @see https://github.com/mrdoob/three.js/blob/master/examples/js/exporters/GLTFExporter.js
 * @author fernandojsg / http://fernandojsg.com
 * @author Don McCurdy / https://www.donmccurdy.com
 * @author Takahiro / https://github.com/takahirox
 */
/** GLTFExporter. */
export class GLTFExporter {
	private started = false
	private options: TableGenerateGltfOptions
	private byteOffset: number = 0
	private buffers: Buffer[] = []
	private pending: Array<() => Promise<void>> = []
	private nodeMap = new Map()
	private skins: Object3D[] = []
	private extensionsUsed: ExtensionsUsed = {}
	private readonly images: Map<string, GltfId> = new Map()
	private readonly cachedData = {
		meshes: new Map<string, number>(),
		attributes: new Map<BufferAttribute | InterleavedBufferAttribute, number>(),
		attributesNormalized: new Map<BufferAttribute | InterleavedBufferAttribute, BufferAttribute>(),
		materials: new Map<MaterialInternal, number>(),
		textures: new Map<Texture, number>(),
	}
	private readonly outputJSON: GltfFile = {
		asset: {
			version: '2.0',
		},
	}

	constructor(options?: TableGenerateGltfOptions) {
		const DEFAULT_OPTIONS: TableGenerateGltfOptions = {
			binary: false,
			optimizeImages: false,
			trs: false,
			onlyVisible: true,
			truncateDrawRange: true,
			embedImages: true,
			animations: [],
			forceIndices: false,
			forcePowerOfTwoTextures: true,
			compressVertices: false,
			versionString: 'vpdb/vpx-toolbox',
			dracoOptions: {
				compressionLevel: 7,
				quantizePosition: 14,
				quantizeNormal: 10,
				quantizeTexcoord: 12,
				quantizeColor: 8,
				quantizeSkin: 12,
				unifiedQuantization: false,
			},
		}
		this.options = Object.assign({}, DEFAULT_OPTIONS, options)
		this.outputJSON.asset.generator = this.options.versionString
	}

	/**
	 * Parse scenes and generate GLTF output
	 * @param input Scene or array of Scenes
	 */
	public async parse(input: Scene | Scene[]): Promise<any> {
		if (this.started) throw new Error('GLTFExporter: already started — create a new instance.')
		this.started = true
		if (this.options.animations?.length) this.options.trs = true
		this.processInput(input)
		const pool = new PromisePool(() => (this.pending.length ? this.pending.shift()!() : null), 1)
		logger().info('[GLTFExporter.parse] Processing images..')
		await pool.start()
		const blob = Buffer.concat(this.buffers)
		const used = Object.keys(this.extensionsUsed)
		if (used.length) this.outputJSON.extensionsUsed = used
		if (!this.outputJSON.buffers?.length) return this.outputJSON
		this.outputJSON.buffers[0].byteLength = blob.byteLength
		if (!this.options.binary) {
			this.outputJSON.buffers[0].uri = blob as any
			return this.options.compressVertices ? (await this.compressGltf(this.outputJSON)).gltf : this.outputJSON
		}
		const glb = this.buildGlb(this.outputJSON, blob)
		return this.options.compressVertices ? (await this.compressGlb(glb)).glb : glb
	}

	private buildGlb(json: GltfFile, bin: Buffer): Buffer {
		const GLB_MAGIC = 0x46546c67,
			GLB_VERSION = 2
		const binPrefix = Buffer.alloc(8)
		binPrefix.writeUInt32LE(bin.byteLength, 0)
		binPrefix.writeUInt32LE(0x004e4942, 4)
		const jsonChunk = getPaddedArrayBuffer(stringToBuffer(JSON.stringify(json)), 0x20)
		const jsonPrefix = Buffer.alloc(8)
		jsonPrefix.writeUInt32LE(jsonChunk.byteLength, 0)
		jsonPrefix.writeUInt32LE(0x4e4f534a, 4)
		const header = Buffer.alloc(12)
		header.writeUInt32LE(GLB_MAGIC, 0)
		header.writeUInt32LE(GLB_VERSION, 4)
		header.writeUInt32LE(12 + jsonPrefix.byteLength + jsonChunk.byteLength + binPrefix.byteLength + bin.byteLength, 8)
		return Buffer.concat([header, jsonPrefix, jsonChunk, binPrefix, bin])
	}

	private get dracoOpts() {
		const o = this.options.dracoOptions!
		return {
			compressionLevel: o.compressionLevel,
			quantizePositionBits: o.quantizePosition,
			quantizeNormalBits: o.quantizeNormal,
			quantizeTexcoordBits: o.quantizeTexcoord,
			quantizeColorBits: o.quantizeColor,
			unifiedQuantization: o.unifiedQuantization,
		}
	}
	private compressGlb(glb: Buffer) {
		logger().info('[GLTFExporter] Compressing vertices..')
		return gltfPipeline.processGlb(glb, { dracoOptions: this.dracoOpts })
	}
	private compressGltf(json: GltfFile) {
		logger().info('[GLTFExporter] Compressing vertices..')
		return gltfPipeline.processGltf(json, { dracoOptions: this.dracoOpts })
	}

	/**
	 * Get the min and max vectors from the given attribute
	 * @param  {BufferAttribute} attribute Attribute to find the min/max in range from start to start + count
	 * @param  {Integer} start
	 * @param  {Integer} count
	 * @return {Object} Object containing the `min` and `max` values (As an array of attribute.itemSize components)
	 */
	private getMinMax(attribute: BufferAttribute | InterleavedBufferAttribute, start: number, count: number) {
		const output = {
			min: new Array(attribute.itemSize).fill(Number.POSITIVE_INFINITY),
			max: new Array(attribute.itemSize).fill(Number.NEGATIVE_INFINITY),
		}

		for (let i = start; i < start + count; i++) {
			for (let a = 0; a < attribute.itemSize; a++) {
				const value = attribute.array[i * attribute.itemSize + a]
				output.min[a] = Math.min(output.min[a], value)
				output.max[a] = Math.max(output.max[a], value)
			}
		}
		return output
	}

	/** Whether image dimensions are power-of-two. */
	private isPowerOfTwo(image: NodeImage) {
		return M.isPowerOfTwo(image.width) && M.isPowerOfTwo(image.height)
	}

	/** Whether normals are normalized. */
	private isNormalizedNormalAttribute(normal: BufferAttribute | InterleavedBufferAttribute) {
		if (this.cachedData.attributesNormalized.has(normal)) {
			return false
		}

		const v = new Vector3()
		let i = 0
		const il = normal.count
		for (; i < il; i++) {
			// 0.0005 is from glTF-validator
			if (Math.abs(v.fromArray(normal.array as unknown as number[], i * 3).length() - 1.0) > 0.0005) {
				return false
			}
		}
		return true
	}

	/** Creates normalized copy of normals. */
	private createNormalizedNormalAttribute(normal: BufferAttribute): BufferAttribute {
		if (this.cachedData.attributesNormalized.has(normal)) {
			return this.cachedData.attributesNormalized.get(normal)!
		}

		const attribute = normal.clone()
		const v = new Vector3()

		let i = 0
		const il = attribute.count
		for (; i < il; i++) {
			v.fromArray(attribute.array as unknown as number[], i * 3)

			if (v.x === 0 && v.y === 0 && v.z === 0) {
				// if values can't be normalized set (1, 0, 0)
				v.setX(1.0)
			} else {
				v.normalize()
			}
			v.toArray(attribute.array as unknown as number[], i * 3)
		}
		this.cachedData.attributesNormalized.set(normal, attribute)
		return attribute
	}

	/** Applies KHR_texture_transform if needed. */
	private applyTextureTransform(mapDef: MapDefinition, texture: Texture) {
		let didTransform = false
		const transformDef: TransformDefinition = {}

		if (texture.offset.x !== 0 || texture.offset.y !== 0) {
			transformDef.offset = texture.offset.toArray()
			didTransform = true
		}

		if (texture.rotation !== 0) {
			transformDef.rotation = texture.rotation
			didTransform = true
		}

		if (texture.repeat.x !== 1 || texture.repeat.y !== 1) {
			transformDef.scale = texture.repeat.toArray()
			didTransform = true
		}

		if (didTransform) {
			mapDef.extensions = mapDef.extensions || {}
			mapDef.extensions.KHR_texture_transform = transformDef
			this.extensionsUsed.KHR_texture_transform = true
		}
	}

	/** Appends buffer to default. */
	private processBuffer(buffer: Buffer): number {
		if (!this.outputJSON.buffers) {
			this.outputJSON.buffers = [{ byteLength: 0 }]
		}

		// All buffers are merged before export.
		this.buffers.push(buffer)

		return 0
	}

	/** Creates/returns a bufferView for an attribute. */
	private processBufferView(
		attribute: BufferAttribute | InterleavedBufferAttribute,
		componentType: number,
		start: number,
		count: number,
		target?: number,
	): BufferView {
		if (!this.outputJSON.bufferViews) {
			this.outputJSON.bufferViews = []
		}

		// Create a new dataview and dump the attribute's array into it

		let componentSize
		if (componentType === WEBGL_CONSTANTS.UNSIGNED_BYTE) {
			componentSize = 1
		} else if (componentType === WEBGL_CONSTANTS.UNSIGNED_SHORT) {
			componentSize = 2
		} else {
			componentSize = 4
		}

		const byteLength = getPaddedBufferSize(count * attribute.itemSize * componentSize)
		const dataView = Buffer.alloc(byteLength)
		let offset = 0

		try {
			for (let i = start; i < start + count; i++) {
				for (let a = 0; a < attribute.itemSize; a++) {
					// @TODO Fails on InterleavedBufferAttribute, and could probably be
					// optimized for normal BufferAttribute.
					const value = attribute.array[i * attribute.itemSize + a]

					if (componentType === WEBGL_CONSTANTS.FLOAT) {
						dataView.writeFloatLE(value, offset)
					} else if (componentType === WEBGL_CONSTANTS.UNSIGNED_INT) {
						dataView.writeUInt32LE(value, offset)
					} else if (componentType === WEBGL_CONSTANTS.UNSIGNED_SHORT) {
						dataView.writeUInt16LE(value, offset)
					} else if (componentType === WEBGL_CONSTANTS.UNSIGNED_BYTE) {
						dataView.writeUInt8(value, offset)
					}
					offset += componentSize
				}
			}
		} catch (err) {
			logger().error('[GLTFExporter.processBufferView]: %s', err.message, err)
			throw err
		}

		const gltfBufferView: GltfBufferView = {
			buffer: this.processBuffer(dataView),
			byteOffset: this.byteOffset,
			byteLength,
		}

		if (target !== undefined) {
			gltfBufferView.target = target
		}

		if (target === WEBGL_CONSTANTS.ARRAY_BUFFER) {
			// Only define byteStride for vertex attributes.
			gltfBufferView.byteStride = attribute.itemSize * componentSize
		}

		this.byteOffset += byteLength
		this.outputJSON.bufferViews.push(gltfBufferView)

		// @TODO Merge bufferViews where possible.
		const output: BufferView = {
			id: this.outputJSON.bufferViews.length - 1,
			byteLength: 0,
		}

		return output
	}

	/**
	 * Process and generate a BufferView from an image Blob.
	 * @param blob Image data
	 * @param uri Identifier
	 * @returns buffer view index
	 */
	private processBufferViewImage(blob: Buffer, uri: string): number {
		if (!this.outputJSON.bufferViews) {
			this.outputJSON.bufferViews = []
		}
		if (this.images.has(uri)) {
			// maybe a parallel process resolved this now, so check again
			return this.images.get(uri)!
		}
		const buffer = getPaddedArrayBuffer(blob)
		const bufferView = {
			buffer: this.processBuffer(buffer),
			byteOffset: this.byteOffset,
			byteLength: buffer.byteLength,
		}

		this.byteOffset += buffer.byteLength
		this.outputJSON.bufferViews.push(bufferView)
		const index = this.outputJSON.bufferViews.length - 1
		this.images.set(uri, index)

		return index
	}

	/**
	 * Process attribute to generate an accessor
	 * @param attribute Attribute to process
	 * @param geometry (Optional) Geometry used for truncated draw range
	 * @param start (Optional)
	 * @param count (Optional)
	 * @return Index of the processed accessor on the "accessors" array
	 */
	private processAccessor(
		attribute: BufferAttribute | InterleavedBufferAttribute,
		geometry?: BufferGeometry,
		start?: number,
		count?: number,
	): number | null {
		const types: { [key: number]: string } = {
			1: 'SCALAR',
			2: 'VEC2',
			3: 'VEC3',
			4: 'VEC4',
			16: 'MAT4',
		}

		let componentType

		// Detect the component type of the attribute array (float, uint or ushort)
		if (attribute.array.constructor === Float32Array) {
			componentType = WEBGL_CONSTANTS.FLOAT
		} else if (attribute.array.constructor === Uint32Array) {
			componentType = WEBGL_CONSTANTS.UNSIGNED_INT
		} else if (attribute.array.constructor === Uint16Array) {
			componentType = WEBGL_CONSTANTS.UNSIGNED_SHORT
		} else if (attribute.array.constructor === Uint8Array) {
			componentType = WEBGL_CONSTANTS.UNSIGNED_BYTE
		} else {
			throw new Error('GLTFExporter: Unsupported bufferAttribute component type.')
		}

		if (start === undefined) {
			start = 0
		}
		if (count === undefined) {
			count = attribute.count
		}

		// @TODO Indexed buffer geometry with drawRange not supported yet
		if (this.options.truncateDrawRange && geometry !== undefined && geometry.index === null) {
			const end = start + count
			const end2 =
				geometry.drawRange.count === Infinity ? attribute.count : geometry.drawRange.start + geometry.drawRange.count

			start = Math.max(start, geometry.drawRange.start)
			count = Math.min(end, end2) - start

			if (count < 0) {
				count = 0
			}
		}

		// Skip creating an accessor if the attribute doesn't have data to export
		if (count === 0) {
			return null
		}

		const minMax = this.getMinMax(attribute, start, count)

		let bufferViewTarget

		// If geometry isn't provided, don't infer the target usage of the bufferView. For
		// animation samplers, target must not be set.
		if (geometry !== undefined) {
			bufferViewTarget =
				attribute === geometry.index ? WEBGL_CONSTANTS.ELEMENT_ARRAY_BUFFER : WEBGL_CONSTANTS.ARRAY_BUFFER
		}

		const bufferView = this.processBufferView(attribute, componentType, start, count, bufferViewTarget)

		const gltfAccessor = {
			bufferView: bufferView.id,
			byteOffset: bufferView.byteOffset,
			componentType,
			count,
			max: minMax.max,
			min: minMax.min,
			type: types[attribute.itemSize],
		}

		if (!this.outputJSON.accessors) {
			this.outputJSON.accessors = []
		}

		this.outputJSON.accessors.push(gltfAccessor)
		return this.outputJSON.accessors.length - 1
	}

	/**
	 * Process image
	 * @param  image image to process
	 * @param  format of the image (e.g. RGBFormat, RGBAFormat etc)
	 * @param  flipY before writing out the image
	 * @return Index of the processed texture in the "images" array
	 */
	private processImage(image: NodeImage, format: PixelFormat, flipY: boolean) {
		const mimeType = image.getMimeType()
		if (!this.outputJSON.images) {
			this.outputJSON.images = []
		}
		const gltfImage: GltfImage = { mimeType }

		if (this.options.embedImages) {
			if (this.options.forcePowerOfTwoTextures && !this.isPowerOfTwo(image)) {
				const po2Width = M.floorPowerOfTwo(image.width)
				const po2Height = M.floorPowerOfTwo(image.height)
				logger().warn(
					'[GLTFExporter.processImage]: Resized non-power-of-two image %s from %sx%s to %sx%s',
					image.src,
					image.width,
					image.height,
					po2Width,
					po2Height,
				)
				image.resize(po2Width, po2Height)
			}
			if (flipY) {
				image.flipY()
			}
			if (this.options.binary) {
				this.pending.push(
					() =>
						new Promise((resolve) => {
							if (this.images.has(image.src)) {
								gltfImage.bufferView = this.images.get(image.src)
								resolve()
							} else {
								image.getImage(this.options.optimizeImages!).then((buffer) => {
									gltfImage.bufferView = this.processBufferViewImage(buffer, image.src)
									resolve()
								})
							}
						}),
				)
			} else {
				this.pending.push(
					() =>
						new Promise((resolve) => {
							image.getImage(this.options.optimizeImages!).then((buffer) => {
								gltfImage.uri = `data:image/${image.getFormat()};base64,${buffer.toString('base64')}`
								resolve()
							})
						}),
				)
			}
		} else {
			gltfImage.uri = image.src //image.src;
		}
		this.outputJSON.images.push(gltfImage)
		return this.outputJSON.images.length - 1
	}

	/**
	 * Process sampler
	 * @param  {Texture} map Texture to process
	 * @return {Integer}     Index of the processed texture in the "samplers" array
	 */
	private processSampler(map: Texture) {
		if (!this.outputJSON.samplers) {
			this.outputJSON.samplers = []
		}

		const gltfSampler = {
			magFilter: THREE_TO_WEBGL[map.magFilter],
			minFilter: THREE_TO_WEBGL[map.minFilter],
			wrapS: THREE_TO_WEBGL[map.wrapS],
			wrapT: THREE_TO_WEBGL[map.wrapT],
		}
		this.outputJSON.samplers.push(gltfSampler)
		return this.outputJSON.samplers.length - 1
	}

	/**
	 * Process texture
	 * @param  {Texture} map Map to process
	 * @return {Integer}     Index of the processed texture in the "textures" array
	 */
	private processTexture(map: Texture): number {
		if (this.cachedData.textures.has(map)) {
			return this.cachedData.textures.get(map)!
		}

		if (!this.outputJSON.textures) {
			this.outputJSON.textures = []
		}

		const gltfTexture = {
			sampler: this.processSampler(map),
			source: this.processImage(map.image, map.format as any, map.flipY),
		}
		this.outputJSON.textures.push(gltfTexture)
		const index = this.outputJSON.textures.length - 1
		this.cachedData.textures.set(map, index)
		return index
	}

	/**
	 * Process material
	 * @param  {Material} material Material to process
	 * @return {Integer}      Index of the processed material in the "materials" array
	 */
	private processMaterial(material: MaterialInternal): number | null {
		if (this.cachedData.materials.has(material)) {
			return this.cachedData.materials.get(material)!
		}

		if (!this.outputJSON.materials) {
			this.outputJSON.materials = []
		}

		if (material.isShaderMaterial) {
			logger().warn('[GLTFExporter.processMaterial] ShaderMaterial not supported.')
			return null
		}

		// @QUESTION Should we avoid including any attribute that has the default value?
		const gltfMaterial: GltfMaterial = {
			pbrMetallicRoughness: {},
		}

		if (material.isMeshBasicMaterial) {
			gltfMaterial.extensions = { KHR_materials_unlit: {} }
			this.extensionsUsed.KHR_materials_unlit = true
		} else if (!material.isMeshStandardMaterial) {
			logger().warn('[GLTFExporter.processMaterial] Use MeshStandardMaterial or MeshBasicMaterial for best results.')
		}

		// pbrMetallicRoughness.baseColorFactor
		const color = material.color.toArray().concat([material.opacity])

		if (!equalArray(color, [1, 1, 1, 1])) {
			gltfMaterial.pbrMetallicRoughness!.baseColorFactor = color
		}

		if (material.isMeshStandardMaterial) {
			gltfMaterial.pbrMetallicRoughness!.metallicFactor = material.metalness
			gltfMaterial.pbrMetallicRoughness!.roughnessFactor = material.roughness
		} else if (material.isMeshBasicMaterial) {
			gltfMaterial.pbrMetallicRoughness!.metallicFactor = 0.0
			gltfMaterial.pbrMetallicRoughness!.roughnessFactor = 0.9
		} else {
			gltfMaterial.pbrMetallicRoughness!.metallicFactor = 0.5
			gltfMaterial.pbrMetallicRoughness!.roughnessFactor = 0.5
		}

		// pbrMetallicRoughness.metallicRoughnessTexture
		if (material.metalnessMap || material.roughnessMap) {
			if (material.metalnessMap === material.roughnessMap) {
				const metalRoughMapDef: MapDefinition = { index: this.processTexture(material.metalnessMap) }
				this.applyTextureTransform(metalRoughMapDef, material.metalnessMap)
				gltfMaterial.pbrMetallicRoughness!.metallicRoughnessTexture = metalRoughMapDef
			} else {
				logger().warn(
					'[GLTFExporter.processMaterial] Ignoring metalnessMap and roughnessMap because they are not the same Texture.',
				)
			}
		}

		// pbrMetallicRoughness.baseColorTexture
		if (material.map) {
			const baseColorMapDef: MapDefinition = { index: this.processTexture(material.map) }
			this.applyTextureTransform(baseColorMapDef, material.map)
			gltfMaterial.pbrMetallicRoughness!.baseColorTexture = baseColorMapDef
		}

		if (!material.isMeshBasicMaterial && !material.isLineBasicMaterial && !material.isPointsMaterial) {
			// emissiveFactor
			const emissive = material.emissive.clone().multiplyScalar(material.emissiveIntensity).toArray()

			if (!equalArray(emissive, [0, 0, 0])) {
				gltfMaterial.emissiveFactor = emissive
			}

			// emissiveTexture
			if (material.emissiveMap) {
				const emissiveMapDef: MapDefinition = { index: this.processTexture(material.emissiveMap) }
				this.applyTextureTransform(emissiveMapDef, material.emissiveMap)
				gltfMaterial.emissiveTexture = emissiveMapDef
			}
		}

		// normalTexture
		if (material.normalMap) {
			const normalMapDef: MapDefinition = { index: this.processTexture(material.normalMap) }
			if (material.normalScale.x !== -1) {
				if (material.normalScale.x !== material.normalScale.y) {
					logger().warn(
						'[GLTFExporter.processMaterial] Normal scale components are different, ignoring Y and exporting X.',
					)
				}
				normalMapDef.scale = material.normalScale.x
			}

			this.applyTextureTransform(normalMapDef, material.normalMap)
			gltfMaterial.normalTexture = normalMapDef
		}

		// occlusionTexture
		if (material.aoMap) {
			const occlusionMapDef: MapDefinition = {
				index: this.processTexture(material.aoMap),
				texCoord: 1,
			}

			if (material.aoMapIntensity !== 1.0) {
				occlusionMapDef.strength = material.aoMapIntensity
			}

			this.applyTextureTransform(occlusionMapDef, material.aoMap)
			gltfMaterial.occlusionTexture = occlusionMapDef
		}

		// alphaMode
		if (material.transparent || material.alphaTest > 0.0) {
			gltfMaterial.alphaMode = material.opacity < 1.0 ? 'BLEND' : 'MASK'

			// Write alphaCutoff if it's non-zero and different from the default (0.5).
			if (material.alphaTest > 0.0 && material.alphaTest !== 0.5) {
				gltfMaterial.alphaCutoff = material.alphaTest
			}
		}

		// doubleSided
		if (material.side === DoubleSide) {
			gltfMaterial.doubleSided = true
		}

		if (material.name !== '') {
			gltfMaterial.name = material.name
		}

		if (Object.keys(material.userData).length > 0) {
			gltfMaterial.extras = serializeUserData(material)
		}

		this.outputJSON.materials.push(gltfMaterial)

		const index = this.outputJSON.materials.length - 1
		this.cachedData.materials.set(material, index)

		return index
	}

	/**
	 * Process mesh
	 * @param  {Mesh} mesh Mesh to process
	 * @return {Integer}      Index of the processed mesh in the "meshes" array
	 */
	private processMesh(mesh: MeshInternal): number | null {
		const cacheKey = mesh.geometry.uuid + ':' + (mesh.material as Material).uuid
		if (this.cachedData.meshes.has(cacheKey)) {
			return this.cachedData.meshes.get(cacheKey)!
		}

		const geometry = mesh.geometry

		let mode

		// Use the correct mode
		if (mesh.isLineSegments) {
			mode = WEBGL_CONSTANTS.LINES
		} else if (mesh.isLineLoop) {
			mode = WEBGL_CONSTANTS.LINE_LOOP
		} else if (mesh.isLine) {
			mode = WEBGL_CONSTANTS.LINE_STRIP
		} else if (mesh.isPoints) {
			mode = WEBGL_CONSTANTS.POINTS
		} else {
			// Geometry removed in three r125 – only BufferGeometry supported
			mode = (mesh.material as MaterialInternal).wireframe ? WEBGL_CONSTANTS.LINES : WEBGL_CONSTANTS.TRIANGLES
		}

		const gltfMesh: GltfMesh = { primitives: [] }

		const attributes: { [key: string]: GltfId } = {}
		const primitives: GltfMeshPrimitive[] = []
		const targets: Array<{ [key: string]: GltfId }> = []

		// Conversion between attributes names in threejs and gltf spec
		const nameConversion: { [key: string]: string } = {
			uv: 'TEXCOORD_0',
			uv2: 'TEXCOORD_1',
			color: 'COLOR_0',
			skinWeight: 'WEIGHTS_0',
			skinIndex: 'JOINTS_0',
		}

		const originalNormal = (geometry as BufferGeometry).getAttribute('normal')

		if (originalNormal !== undefined && !this.isNormalizedNormalAttribute(originalNormal)) {
			logger().warn(
				'[GLTFExporter.processMesh] Creating normalized normal attribute from the non-normalized one (%s).',
				mesh.name,
			)
			;(geometry as BufferGeometry).setAttribute(
				'normal',
				this.createNormalizedNormalAttribute(originalNormal as BufferAttribute),
			)
		}

		// @QUESTION Detect if .vertexColors = VertexColors?
		// For every attribute create an accessor
		for (let attributeName of Object.keys((geometry as BufferGeometry).attributes)) {
			const attribute = (geometry as BufferGeometry).attributes[attributeName] as BufferAttribute
			attributeName = nameConversion[attributeName] || attributeName.toUpperCase()

			if (this.cachedData.attributes.has(attribute)) {
				attributes[attributeName] = this.cachedData.attributes.get(attribute)!
				continue
			}

			// JOINTS_0 must be UNSIGNED_BYTE or UNSIGNED_SHORT.
			let modifiedAttribute: BufferAttribute | null = null
			const array = attribute.array
			if (attributeName === 'JOINTS_0' && !(array instanceof Uint16Array) && !(array instanceof Uint8Array)) {
				logger().warn('[GLTFExporter.processMesh] Attribute "skinIndex" converted to type UNSIGNED_SHORT.')
				modifiedAttribute = new BufferAttribute(new Uint16Array(array), attribute.itemSize, attribute.normalized)
			}

			if (attributeName.substr(0, 5) !== 'MORPH') {
				const accessor = this.processAccessor(modifiedAttribute || attribute, geometry as BufferGeometry)
				if (accessor !== null) {
					attributes[attributeName] = accessor
					this.cachedData.attributes.set(attribute, accessor)
				}
			}
		}

		if (originalNormal !== undefined) {
			;(geometry as BufferGeometry).setAttribute('normal', originalNormal)
		}

		// Skip if no exportable attributes found
		if (Object.keys(attributes).length === 0) {
			return null
		}

		// Morph targets
		if (mesh.morphTargetInfluences !== undefined && mesh.morphTargetInfluences.length > 0) {
			const weights: number[] = []
			const targetNames: string[] = []
			const reverseDictionary: { [key: number]: string } = {}

			if (mesh.morphTargetDictionary !== undefined) {
				for (const key of Object.keys(mesh.morphTargetDictionary)) {
					reverseDictionary[mesh.morphTargetDictionary[key]] = key
				}
			}

			for (let i = 0; i < mesh.morphTargetInfluences.length; ++i) {
				const target: { [key: string]: GltfId } = {}
				let warned = false
				for (const attributeName of Object.keys((geometry as BufferGeometry).morphAttributes)) {
					// glTF 2.0 morph supports only POSITION/NORMAL/TANGENT.
					// js doesn't support TANGENT yet.

					if (attributeName !== 'position' && attributeName !== 'normal') {
						if (!warned) {
							logger().warn('[GLTFExporter.processMesh] Only POSITION and NORMAL morph are supported.')
							warned = true
						}
						continue
					}

					const attribute = (geometry as BufferGeometry).morphAttributes[attributeName][i] as BufferAttribute
					const gltfAttributeName = attributeName.toUpperCase()

					// js morph attribute has absolute values while the one of glTF has relative values.
					//
					// glTF 2.0 Specification:
					// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#morph-targets

					const baseAttribute = (geometry as BufferGeometry).attributes[attributeName]

					if (this.cachedData.attributes.has(attribute)) {
						target[gltfAttributeName] = this.cachedData.attributes.get(attribute)!
						continue
					}

					// Clones attribute not to override
					const relativeAttribute = attribute.clone()

					let j = 0
					const jl = attribute.count
					for (; j < jl; j++) {
						relativeAttribute.setXYZ(
							j,
							attribute.getX(j) - baseAttribute.getX(j),
							attribute.getY(j) - baseAttribute.getY(j),
							attribute.getZ(j) - baseAttribute.getZ(j),
						)
					}
					target[gltfAttributeName] = this.processAccessor(relativeAttribute, geometry as BufferGeometry)!
					this.cachedData.attributes.set(baseAttribute, target[gltfAttributeName])
				}

				targets.push(target)
				weights.push(mesh.morphTargetInfluences[i])
				if (mesh.morphTargetDictionary !== undefined) {
					targetNames.push(reverseDictionary[i])
				}
			}

			gltfMesh.weights = weights
			if (targetNames.length > 0) {
				gltfMesh.extras = {}
				gltfMesh.extras.targetNames = targetNames
			}
		}

		const extras =
			Object.keys((geometry as BufferGeometry).userData).length > 0
				? serializeUserData(geometry as BufferGeometry)
				: undefined

		let forceIndices = this.options.forceIndices
		const isMultiMaterial = Array.isArray(mesh.material)

		if (isMultiMaterial && (geometry as BufferGeometry).groups.length === 0) {
			return null
		}

		if (!forceIndices && (geometry as BufferGeometry).index === null && isMultiMaterial) {
			// temporal workaround.
			logger().warn('[GLTFExporter.processMesh] Creating index for non-indexed multi-material mesh.')
			forceIndices = true
		}

		let didForceIndices = false

		if ((geometry as BufferGeometry).index === null && forceIndices) {
			const indices = []
			for (let i = 0, il = (geometry as BufferGeometry).attributes.position.count; i < il; i++) {
				indices[i] = i
			}
			;(geometry as BufferGeometry).setIndex(indices)
			didForceIndices = true
		}

		const materials: MaterialInternal[] = isMultiMaterial
			? (mesh.material as MaterialInternal[])
			: [mesh.material as MaterialInternal]

		const groups = isMultiMaterial
			? (geometry as BufferGeometry).groups
			: [
					{
						materialIndex: 0,
						start: undefined,
						count: undefined,
					},
				]

		for (let i = 0, il = groups.length; i < il; i++) {
			const primitive: GltfMeshPrimitive = {
				mode,
				attributes,
			}

			if (extras) {
				primitive.extras = extras
			}
			if (targets.length > 0) {
				primitive.targets = targets
			}
			if ((geometry as BufferGeometry).index !== null) {
				if (this.cachedData.attributes.has((geometry as BufferGeometry).index as BufferAttribute)) {
					primitive.indices = this.cachedData.attributes.get((geometry as BufferGeometry).index as BufferAttribute)
				} else {
					primitive.indices = this.processAccessor(
						(geometry as BufferGeometry).index as BufferAttribute,
						geometry as BufferGeometry,
						groups[i].start,
						groups[i].count,
					)!
					this.cachedData.attributes.set((geometry as BufferGeometry).index as BufferAttribute, primitive.indices)
				}
			}

			const material = this.processMaterial(materials[groups[i].materialIndex!])

			if (material !== null) {
				primitive.material = material
			}
			primitives.push(primitive)
		}

		if (didForceIndices) {
			;(geometry as BufferGeometry).setIndex(null as any)
		}

		gltfMesh.primitives = primitives

		if (!this.outputJSON.meshes) {
			this.outputJSON.meshes = []
		}

		this.outputJSON.meshes.push(gltfMesh)

		const index = this.outputJSON.meshes.length - 1
		this.cachedData.meshes.set(cacheKey, index)

		return index
	}

	/**
	 * Process camera
	 * @param  {Camera} camera Camera to process
	 * @return {Integer}      Index of the processed mesh in the "camera" array
	 */
	private processCamera(camera: CameraInternal): number {
		if (!this.outputJSON.cameras) {
			this.outputJSON.cameras = []
		}

		const isOrtho = camera.isOrthographicCamera

		const gltfCamera: GltfCamera = {
			type: isOrtho ? 'orthographic' : 'perspective',
		}

		if (isOrtho) {
			gltfCamera.orthographic = {
				xmag: camera.right * 2,
				ymag: camera.top * 2,
				zfar: camera.far <= 0 ? 0.001 : camera.far,
				znear: camera.near < 0 ? 0 : camera.near,
			}
		} else {
			gltfCamera.perspective = {
				aspectRatio: camera.aspect,
				yfov: M.degToRad(camera.fov),
				zfar: camera.far <= 0 ? 0.001 : camera.far,
				znear: camera.near < 0 ? 0 : camera.near,
			}
		}

		if (camera.name !== '') {
			gltfCamera.name = camera.type
		}

		this.outputJSON.cameras.push(gltfCamera)
		return this.outputJSON.cameras.length - 1
	}

	/**
	 * Creates glTF animation entry from AnimationClip object.
	 *
	 * Status:
	 * - Only properties listed in PATH_PROPERTIES may be animated.
	 *
	 * @param {AnimationClip} clip
	 * @param {Object3D} root
	 * @return {number}
	 */
	private processAnimation(clip: AnimationClipInternal, root: Object3D) {
		if (!this.outputJSON.animations) {
			this.outputJSON.animations = []
		}

		clip = Utils.mergeMorphTargetTracks(clip.clone(), root)

		const tracks = clip.tracks
		const channels = []
		const samplers: GltfAnimationSampler[] = []

		for (const track of tracks) {
			const trackBinding = PropertyBinding.parseTrackName(track.name)
			let trackNode = PropertyBinding.findNode(root, trackBinding.nodeName)
			const trackProperty = PATH_PROPERTIES[trackBinding.propertyName]

			if (trackBinding.objectName === 'bones') {
				if (trackNode.isSkinnedMesh === true) {
					trackNode = trackNode.skeleton.getBoneByName(trackBinding.objectIndex)
				} else {
					trackNode = undefined
				}
			}

			if (!trackNode || !trackProperty) {
				logger().warn('[GLTFExporter.processAnimation] Could not export animation track "%s".', track.name)
				return null
			}

			const inputItemSize = 1
			let outputItemSize = track.values.length / track.times.length

			if (trackProperty === PATH_PROPERTIES.morphTargetInfluences) {
				outputItemSize /= trackNode.morphTargetInfluences.length
			}

			let interpolation

			// @TODO export CubicInterpolant(InterpolateSmooth) as CUBICSPLINE

			// Detecting glTF cubic spline interpolant by checking factory method's special property
			// GLTFCubicSplineInterpolant is a custom interpolant and track doesn't return
			// valid value from .getInterpolation().
			if ((track as KeyframeTrackInternal).createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline === true) {
				interpolation = 'CUBICSPLINE'

				// itemSize of CUBICSPLINE keyframe is 9
				// (VEC3 * 3: inTangent, splineVertex, and outTangent)
				// but needs to be stored as VEC3 so dividing by 3 here.
				outputItemSize /= 3
			} else if (track.getInterpolation() === InterpolateDiscrete) {
				interpolation = 'STEP'
			} else {
				interpolation = 'LINEAR'
			}

			samplers.push({
				input: this.processAccessor(new BufferAttribute(track.times, inputItemSize))!,
				output: this.processAccessor(new BufferAttribute(track.values, outputItemSize))!,
				interpolation,
			})

			channels.push({
				sampler: samplers.length - 1,
				target: {
					node: this.nodeMap.get(trackNode),
					path: trackProperty,
				},
			})
		}

		this.outputJSON.animations.push({
			name: clip.name || 'clip_' + this.outputJSON.animations.length,
			samplers,
			channels,
		})

		return this.outputJSON.animations.length - 1
	}

	private processSkin(object: Object3DInternal) {
		const node = this.outputJSON.nodes![this.nodeMap.get(object)]
		const skeleton = object.skeleton
		const rootJoint = object.skeleton.bones[0]

		if (rootJoint === undefined) {
			return null
		}

		const joints = []
		const inverseBindMatrices = new Float32Array(skeleton.bones.length * 16)

		for (let i = 0; i < skeleton.bones.length; ++i) {
			joints.push(this.nodeMap.get(skeleton.bones[i]))
			;(skeleton.boneInverses[i] as any).toArray(inverseBindMatrices, i * 16) // bug in matrix4.dt.ts
		}

		if (this.outputJSON.skins === undefined) {
			this.outputJSON.skins = []
		}

		this.outputJSON.skins.push({
			inverseBindMatrices: this.processAccessor(new BufferAttribute(inverseBindMatrices, 16))!,
			joints,
			skeleton: this.nodeMap.get(rootJoint),
		})

		return (node.skin = this.outputJSON.skins.length - 1)
	}

	private processLight(light: LightInternal): number {
		const lightDef: LightDefinition = {}

		if (light.name) {
			lightDef.name = light.name
		}

		lightDef.color = light.color.toArray()
		lightDef.intensity = light.intensity

		if (light.isDirectionalLight) {
			lightDef.type = 'directional'
		} else if (light.isPointLight) {
			lightDef.type = 'point'
			if (light.distance > 0) {
				lightDef.range = light.distance
			}
		} else if (light.isSpotLight) {
			lightDef.type = 'spot'
			if (light.distance > 0) {
				lightDef.range = light.distance
			}
			lightDef.spot = {}
			lightDef.spot.innerConeAngle = (light.penumbra - 1.0) * light.angle * -1.0
			lightDef.spot.outerConeAngle = light.angle
		}

		if (light.decay !== undefined && light.decay !== 2) {
			logger().warn(
				'[GLTFExporter.processLight] Light decay may be lost. glTF is physically-based, ' +
					'and expects light.decay=2.',
			)
		}

		if (
			light.target &&
			(light.target.parent !== light ||
				light.target.position.x !== 0 ||
				light.target.position.y !== 0 ||
				light.target.position.z !== -1)
		) {
			logger().warn(
				'[GLTFExporter.processLight] Light direction may be lost. For best results, ' +
					'make light.target a child of the light with position 0,0,-1.',
			)
		}

		const lights = this.outputJSON.extensions.KHR_lights_punctual.lights
		lights.push(lightDef)
		return lights.length - 1
	}

	/**
	 * Process Object3D node
	 * @param  {Object3D} object Object3D to processNode
	 * @return {Integer}      Index of the node in the nodes list
	 */
	private processNode(object: Object3DInternal): number | null {
		if (!this.outputJSON.nodes) {
			this.outputJSON.nodes = []
		}

		const gltfNode: GltfNode = {}

		if (this.options.trs) {
			const rotation = object.quaternion.toArray()
			const position = object.position.toArray()
			const scale = object.scale.toArray()

			if (!equalArray(rotation, [0, 0, 0, 1])) {
				gltfNode.rotation = rotation
			}

			if (!equalArray(position, [0, 0, 0])) {
				gltfNode.translation = position
			}

			if (!equalArray(scale, [1, 1, 1])) {
				gltfNode.scale = scale
			}
		} else {
			object.updateMatrix()
			if (!equalArray(object.matrix.elements as any, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])) {
				gltfNode.matrix = object.matrix.elements
			}
		}

		// We don't export empty strings name because it represents no-name in js.
		if (object.name !== '') {
			gltfNode.name = String(object.name)
		}

		if (object.userData && Object.keys(object.userData).length > 0) {
			gltfNode.extras = serializeUserData(object)
		}

		if (object.isMesh || object.isLine || object.isPoints) {
			const mesh = this.processMesh(object as any)

			if (mesh !== null) {
				gltfNode.mesh = mesh
			}
		} else if (object.isCamera) {
			gltfNode.camera = this.processCamera(object as any)
		} else if (object.isDirectionalLight || object.isPointLight || object.isSpotLight) {
			if (!this.extensionsUsed.KHR_lights_punctual) {
				this.outputJSON.extensions = this.outputJSON.extensions || {}
				this.outputJSON.extensions.KHR_lights_punctual = { lights: [] }
				this.extensionsUsed.KHR_lights_punctual = true
			}
			gltfNode.extensions = gltfNode.extensions || {}
			gltfNode.extensions.KHR_lights_punctual = { light: this.processLight(object as any) }
		} else if (object.isLight) {
			logger().warn('[GLTFExporter.processNode] Only directional, point, and spot lights are supported.')
			return null
		}

		if (object.isSkinnedMesh) {
			this.skins.push(object)
		}

		let skipNode = false
		if (object.children.length > 0) {
			const children: number[] = []
			let i = 0
			const l = object.children.length
			for (; i < l; i++) {
				const child = object.children[i]
				if (child.visible || !this.options.onlyVisible) {
					const node = this.processNode(child as any)
					if (node !== null) {
						children.push(node)
					}
				}
			}

			if (children.length > 0) {
				gltfNode.children = children
			} else {
				// if empty, don't push if there were invisible children.
				if (object.children.length > 0) {
					skipNode = true
				}
			}
		}

		if (!skipNode) {
			this.outputJSON.nodes.push(gltfNode)
		}

		const nodeIndex = this.outputJSON.nodes.length - 1
		this.nodeMap.set(object, nodeIndex)

		return nodeIndex
	}

	/**
	 * Process Scene
	 * @param  {Scene} scene Scene to process
	 */
	private processScene(scene: Scene) {
		if (!this.outputJSON.scenes) {
			this.outputJSON.scenes = []
			this.outputJSON.scene = 0
		}

		const gltfScene: GltfScene = {
			nodes: [],
		}

		if (scene.name !== '') {
			gltfScene.name = scene.name
		}

		if (scene.userData && Object.keys(scene.userData).length > 0) {
			gltfScene.extras = serializeUserData(scene)
		}

		this.outputJSON.scenes.push(gltfScene)
		const nodes = []
		let i = 0
		const l = scene.children.length
		for (; i < l; i++) {
			const child = scene.children[i]
			if (child.visible || this.options.onlyVisible === false) {
				const node = this.processNode(child as any)
				if (node !== null) {
					nodes.push(node)
				}
			}
		}

		if (nodes.length > 0) {
			gltfScene.nodes = nodes
		}
	}

	/**
	 * Creates a Scene to hold a list of objects and parse it
	 * @param  {Array} objects List of objects to process
	 */
	private processObjects(objects: Object3D[]) {
		const scene = new Scene()
		scene.name = 'AuxScene'
		for (const obj of objects) {
			// We push directly to children instead of calling `add` to prevent
			// modify the .parent and break its original scene and hierarchy
			scene.children.push(obj)
		}
		this.processScene(scene)
	}

	private processInput(pInput: any) {
		pInput = pInput instanceof Array ? pInput : [pInput]
		const objectsWithoutScene = []

		for (const p of pInput) {
			if (p instanceof Scene) {
				this.processScene(p)
			} else {
				objectsWithoutScene.push(p)
			}
		}

		if (objectsWithoutScene.length > 0) {
			this.processObjects(objectsWithoutScene)
		}

		for (const skin of this.skins) {
			this.processSkin(skin as any)
		}

		for (const animation of this.options.animations!) {
			this.processAnimation(animation, pInput[0])
		}
	}
}
