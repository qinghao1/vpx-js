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
export { exportGltf } from './gltf/export-gltf.browser.js'
export { BrowserBinaryReader as BinaryReader } from './io/binary-reader.browser.js'
export { storage } from './io/storage.browser.js'
export { now } from './util/time.browser.js'
export const RGBFormat = 1022
export const RGBEFormat = 1023
export const RGBEEncoding = 3000
export const LinearEncoding = 3000
export const sRGBEncoding = 3001
export const GammaEncoding = 3007
export type { PixelFormat, TextureDataType } from 'three'
export { ThreeTextureLoaderBrowser as ThreeTextureLoader } from './render/threejs/three-texture-loader-browser'
export { getTextFile } from './scripting/vbs-scripts.browser.js'

/* Buffer polyfill removed – use Uint8Array in browser */
