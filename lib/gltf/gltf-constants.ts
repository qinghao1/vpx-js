// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import {
	ClampToEdgeWrapping,
	LinearFilter,
	LinearMipMapLinearFilter,
	LinearMipMapNearestFilter,
	MirroredRepeatWrapping,
	NearestFilter,
	NearestMipMapLinearFilter,
	NearestMipMapNearestFilter,
	RepeatWrapping,
} from '../refs.node.js'

/** WebGL enum values used in glTF. */
export const WEBGL_CONSTANTS: Record<string, number> = {
	POINTS: 0x0000,
	LINES: 0x0001,
	LINE_LOOP: 0x0002,
	LINE_STRIP: 0x0003,
	TRIANGLES: 0x0004,
	TRIANGLE_STRIP: 0x0005,
	TRIANGLE_FAN: 0x0006,

	UNSIGNED_BYTE: 0x1401,
	UNSIGNED_SHORT: 0x1403,
	FLOAT: 0x1406,
	UNSIGNED_INT: 0x1405,
	ARRAY_BUFFER: 0x8892,
	ELEMENT_ARRAY_BUFFER: 0x8893,

	NEAREST: 0x2600,
	LINEAR: 0x2601,
	NEAREST_MIPMAP_NEAREST: 0x2700,
	LINEAR_MIPMAP_NEAREST: 0x2701,
	NEAREST_MIPMAP_LINEAR: 0x2702,
	LINEAR_MIPMAP_LINEAR: 0x2703,

	CLAMP_TO_EDGE: 33071,
	MIRRORED_REPEAT: 33648,
	REPEAT: 10497,
}

/** Mapping from Three.js constants to WebGL constants. */
export const THREE_TO_WEBGL: Record<string | number, number> = {
	[NearestFilter]: WEBGL_CONSTANTS.NEAREST,
	[NearestMipMapNearestFilter]: WEBGL_CONSTANTS.NEAREST_MIPMAP_NEAREST,
	[NearestMipMapLinearFilter]: WEBGL_CONSTANTS.NEAREST_MIPMAP_LINEAR,
	[LinearFilter]: WEBGL_CONSTANTS.LINEAR,
	[LinearMipMapNearestFilter]: WEBGL_CONSTANTS.LINEAR_MIPMAP_NEAREST,
	[LinearMipMapLinearFilter]: WEBGL_CONSTANTS.LINEAR_MIPMAP_LINEAR,
	[ClampToEdgeWrapping]: WEBGL_CONSTANTS.CLAMP_TO_EDGE,
	[RepeatWrapping]: WEBGL_CONSTANTS.REPEAT,
	[MirroredRepeatWrapping]: WEBGL_CONSTANTS.MIRRORED_REPEAT,
}

/** glTF animation path property mapping. */
export const PATH_PROPERTIES: Record<string, string> = {
	scale: 'scale',
	position: 'translation',
	quaternion: 'rotation',
	morphTargetInfluences: 'weights',
}
