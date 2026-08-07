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
import { FileLoader } from 'three'

export {
	AdditiveBlending,
	AnimationClip,
	Bone,
	Box3,
	BufferAttribute,
	BufferGeometry,
	Camera,
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	DataTextureLoader,
	DefaultLoadingManager,
	DoubleSide,
	ExtrudeGeometry,
	ExtrudeGeometry as ExtrudeBufferGeometry,
	Float32BufferAttribute,
	FloatType,
	Group,
	HalfFloatType,
	InterleavedBufferAttribute,
	InterpolateDiscrete,
	InterpolateLinear,
	KeyframeTrack,
	Light,
	Line,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearMipMapNearestFilter,
	LinearSRGBColorSpace,
	LoadingManager,
	Material,
	MathUtils as Math,
	Matrix3,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	MirroredRepeatWrapping,
	NearestFilter,
	NearestMipMapLinearFilter,
	NearestMipMapNearestFilter,
	NoColorSpace,
	Object3D,
	Path,
	PointLight,
	PointLightHelper,
	PropertyBinding,
	RepeatWrapping,
	RGBAFormat,
	Scene,
	Shape,
	SpotLight,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	TriangleFanDrawMode,
	TriangleStripDrawMode,
	UnsignedByteType,
	Vector2,
	Vector3,
} from 'three'
export { exportGltf } from './gltf/export-gltf.node.js'
export { NodeBinaryReader as BinaryReader } from './io/binary-reader.node.js'
export { storage } from './io/storage.node.js'
export { getTextFile } from './scripting/vbs-scripts.node.js'
export { now } from './util/time.node.js'
export const RGBFormat = 1022
export const RGBEFormat = 1023
export const RGBEEncoding = 3000
export const LinearEncoding = 3000
export const sRGBEncoding = 3001
export const GammaEncoding = 3007
export type { PixelFormat, TextureDataType } from 'three'

export { ThreeTextureLoaderNode as ThreeTextureLoader } from './render/threejs/three-texture-loader-node'

/*
 * Here we patch three.js' file loader to accept buffers directly.
 */
const originalFileLoaderLoad = FileLoader.prototype.load
// tslint:disable-next-line:only-arrow-functions
FileLoader.prototype.load = (
	urlOrBuffer: any,
	onLoad?: (response: string | ArrayBuffer) => void,
	onProgress?: (request: ProgressEvent) => void,
	onError?: (event: ErrorEvent) => void,
) => {
	/* istanbul ignore if: we don't it by url, but this should still work. */
	if (typeof urlOrBuffer === 'string') {
		return originalFileLoaderLoad(urlOrBuffer, onLoad, onProgress, onError)
	}
	if (onLoad) {
		onLoad(urlOrBuffer)
	}
}

/* TextDecoder is natively available in Node >=22 */
