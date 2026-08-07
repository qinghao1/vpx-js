// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

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
	CanvasTexture,
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
export { ThreeTextureLoaderBrowser as ThreeTextureLoader } from './render/threejs/three-texture-loader-browser.js'
export { getTextFile } from './scripting/vbs-scripts.browser.js'

/* Buffer polyfill removed – use Uint8Array in browser */
