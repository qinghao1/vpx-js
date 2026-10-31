// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Desktop backglass layer: fullscreen backdrop image plus EM score-reel
 * digit quads, positioned in upstream's 1000x750 backdrop space.
 *
 * Upstream draws the backdrop and every `DispReel` in-scene on desktop
 * (`Renderer::DrawBackground` + `DispReel::Render`, both in desktop-backdrop
 * coordinates, gated by decals/EM-reels flags); cabinet (BG_FULLSCREEN),
 * VR, and editor playfield views hide them in favor of ancillary windows.
 * This module
 * ports the layout math (`DispReel::RenderSetup` digit cells,
 * `BackdropToClip` NDC mapping, plus a contain-fit so authored proportions
 * stay true on any screen) and builds the three.js meshes; the viewer
 * billboards them far behind the table with plain depth testing, so the
 * table occludes the backdrop exactly where it covers the screen.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/dispreel.cpp
 * @see https://github.com/vpinball/vpinball/blob/master/src/renderer/Renderer.cpp
 */

import * as THREE from 'three'

/** Upstream `EDITOR_BG_WIDTH/HEIGHT`: backdrop-space units. */
export const BACKDROP_WIDTH = 1000
export const BACKDROP_HEIGHT = 750

/** Fallback screen shape when no live aspect is available. */
export const DEFAULT_ASPECT = 16 / 9

/**
 * Contain-fit of the backdrop space inside a `viewAspect` (width/height)
 * screen: NDC scale factors keeping authored proportions true. Native
 * stretches the space to fill (`DrawSprite(0, 0, 1, 1)`), skewing circles
 * on non-4:3 screens; art and reels share this transform so digits stay
 * registered with the art while the table's backdrop color fills the bars.
 */
export function backdropContainScale(viewAspect: number): { scaleX: number; scaleY: number } {
	const aspect = Number.isFinite(viewAspect) && viewAspect > 0 ? viewAspect : DEFAULT_ASPECT
	const spaceAspect = BACKDROP_WIDTH / BACKDROP_HEIGHT
	return aspect >= spaceAspect
		? { scaleX: spaceAspect / aspect, scaleY: 1 }
		: { scaleX: 1, scaleY: aspect / spaceAspect }
}

/** Native alpha-cutout threshold (`alphaTestValue 128/255`). */
export const BACKGLASS_ALPHA_TEST = 128 / 255

export interface DigitCellUV {
	u0: number
	v0: number
	u1: number
	v1: number
}

/**
 * Digit-cell UVs for one reel value, mirroring
 * `DispReel::RenderSetup`: a `useImageGrid` strip lays `digitRange + 1`
 * cells left-to-right, top-to-bottom over `imagesPerGridRow` columns,
 * otherwise the strip is a single horizontal row of `digitRange + 1`
 * cells. Returned in three.js UV space (v measured from the bottom —
 * decode-time imageOrientation flipY plus flipY=false upload nets v=1
 * at the image top, so the top grid row lands at high v).
 */
export function digitCellUV(
	index: number,
	digitRange: number,
	useImageGrid: boolean,
	imagesPerGridRow: number,
): DigitCellUV {
	let cols: number
	if (useImageGrid) {
		cols = Math.max(1, Math.floor(imagesPerGridRow))
	} else {
		cols = digitRange + 1
	}
	const rows = Math.max(1, Math.ceil((digitRange + 1) / cols))
	const clamped = Math.min(Math.max(0, Math.floor(index)), digitRange)
	const gc = clamped % cols
	const gr = Math.floor(clamped / cols)
	const ratioX = 1 / cols
	const ratioY = 1 / rows
	return {
		u0: gc * ratioX,
		v0: 1 - (gr + 1) * ratioY,
		u1: (gc + 1) * ratioX,
		v1: 1 - gr * ratioY,
	}
}

/** Backdrop-space rect (px, y down from the top) in NDC (y up). */
export interface NdcRect {
	centerX: number
	centerY: number
	sizeX: number
	sizeY: number
}

export function backdropRectToNdc(x: number, y: number, w: number, h: number): NdcRect {
	return {
		centerX: ((x + w / 2) / BACKDROP_WIDTH) * 2 - 1,
		centerY: 1 - ((y + h / 2) / BACKDROP_HEIGHT) * 2,
		sizeX: (w / BACKDROP_WIDTH) * 2,
		sizeY: (h / BACKDROP_HEIGHT) * 2,
	}
}

/** Points `geometry` at `cell` of the strip texture (PlaneGeometry UV order). */
export function applyDigitCellUV(geometry: THREE.BufferGeometry, cell: DigitCellUV): void {
	const uv = geometry.attributes.uv as THREE.BufferAttribute
	// PlaneGeometry vertex order: (-,+), (+,+), (-,-), (+,-).
	uv.setXY(0, cell.u0, cell.v1)
	uv.setXY(1, cell.u1, cell.v1)
	uv.setXY(2, cell.u0, cell.v0)
	uv.setXY(3, cell.u1, cell.v0)
	uv.needsUpdate = true
}

/**
 * One reel digit: a 1x1 plane scaled to `rect`, showing `cell` of the
 * strip texture with the native cutout. Depth testing stays at defaults —
 * the quad sits at z=2 in the far-behind group and depth-tests against it.
 */
export function buildReelDigitQuad(map: THREE.Texture, rect: NdcRect, cell: DigitCellUV): THREE.Mesh {
	const geometry = new THREE.PlaneGeometry(1, 1)
	applyDigitCellUV(geometry, cell)
	const material = new THREE.MeshBasicMaterial({
		map,
		alphaTest: BACKGLASS_ALPHA_TEST,
		toneMapped: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	// Two units ahead of the backdrop plane: enough depth separation at
	// backglass range to resolve, so the digit wins without z-fighting.
	mesh.position.set(rect.centerX, rect.centerY, 2)
	mesh.scale.set(rect.sizeX, rect.sizeY, 1)
	mesh.frustumCulled = false
	return mesh
}

/**
 * Backdrop plane; `map` may be undefined for a flat color. Depth `z`
 * separates stacked layers (background color quad behind, art above, reels top).
 */
export function buildBackdropPlane(map?: THREE.Texture, color = 0x000000, z = 0): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({
		map,
		color: map ? 0xffffff : color,
		toneMapped: false,
	})
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
	mesh.position.set(0, 0, z)
	mesh.frustumCulled = false
	return mesh
}
