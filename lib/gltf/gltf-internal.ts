// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type {
	AnimationClip,
	Bone,
	BufferGeometry,
	Camera,
	Color,
	Light,
	Material,
	Matrix4,
	Mesh,
	Object3D,
	Texture,
	Vector3,
} from '../refs.node.js'

export interface MapDefinition {
	index: number
	scale?: number
	texCoord?: number
	strength?: number
	extensions?: {
		[key: string]: TransformDefinition
	}
}

export interface TransformDefinition {
	rotation?: number
	offset?: number[]
	scale?: number[]
}

export interface LightDefinition {
	name?: string
	color?: number[]
	intensity?: number
	type?: 'directional' | 'point' | 'spot'
	range?: number
	spot?: {
		innerConeAngle?: number
		outerConeAngle?: number
	}
}

export interface ExtensionsUsed {
	KHR_materials_unlit?: boolean
	KHR_texture_transform?: boolean
	KHR_lights_punctual?: boolean
}

export interface BufferView {
	id?: number
	byteLength: number
	buffer?: number
	byteOffset?: number
	byteStride?: number
	target?: number
}

export interface MaterialInternal extends Material {
	isMeshBasicMaterial: boolean
	isLineBasicMaterial: boolean
	isPointsMaterial: boolean
	isMeshStandardMaterial: boolean
	isShaderMaterial: boolean
	color: Color
	map: Texture
	normalMap: Texture
	metalness: number
	metalnessMap: Texture
	roughness: number
	roughnessMap: Texture
	emissive: Vector3
	emissiveMap: Texture
	emissiveIntensity: number
	normalScale: Vector3
	aoMap: Texture
	aoMapIntensity: number
	wireframe: number
}

export interface MeshInternal extends Mesh {
	isLineSegments: boolean
	isLineLoop: boolean
	isLine: boolean
	isPoints: boolean
}

export interface GeometryInternal extends BufferGeometry {
	isBufferGeometry: true
}

export interface CameraInternal extends Camera {
	isOrthographicCamera: boolean
	right: number
	top: number
	far: number
	near: number
	aspect?: number
	fov: number
}

// @ts-expect-error
export interface AnimationClipInternal extends AnimationClip {
	clone(): AnimationClipInternal
	tracks: any
}

// @ts-expect-error
export interface KeyframeTrackInternal extends KeyframeTrack {
	times: any
	values: any
	ValueBufferType: any
	InterpolantFactoryMethodDiscrete: any
	InterpolantFactoryMethodLinear: any
	createInterpolant: {
		isInterpolantFactoryMethodGLTFCubicSpline: boolean
	}
	getValueSize(): number
}

export interface LightInternal extends Light {
	isDirectionalLight: boolean
	isPointLight: boolean
	isSpotLight: boolean
	distance: number
	range: number
	penumbra: number
	angle: number
	decay: number
	target: {
		parent: LightInternal
		position: {
			x: number
			y: number
			z: number
		}
	}
}

export interface Object3DInternal extends Object3D {
	skeleton: {
		bones: Bone[]
		boneInverses: Matrix4[]
	}
	isMesh: boolean
	isSkinnedMesh: boolean
	isLine: boolean
	isPoints: boolean
	isCamera: boolean

	isLight: boolean
	isDirectionalLight: boolean
	isPointLight: boolean
	isSpotLight: boolean
}
