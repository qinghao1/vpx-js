// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Backglass panel: backdrop image plus EM score-reel digit quads,
 * positioned in upstream's 1000x750 backdrop space.
 *
 * Upstream draws the backdrop and every `DispReel` in-scene on desktop
 * (`Renderer::DrawBackground` + `DispReel::Render`, both in desktop-backdrop
 * coordinates, gated by decals/EM-reels flags); cabinet (BG_FULLSCREEN),
 * VR, and editor playfield views hide them in favor of ancillary windows.
 * This module ports the layout math (`DispReel::RenderSetup` digit cells,
 * `BackdropToClip` NDC mapping) and builds the three.js meshes; the viewer
 * stands them up as a backglass above the head of the table, where tables
 * with an authored VR backbox show theirs.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/src/parts/dispreel.cpp
 * @see https://github.com/vpinball/vpinball/blob/master/src/renderer/Renderer.cpp
 */

import * as THREE from 'three'

/** Upstream `EDITOR_BG_WIDTH/HEIGHT`: backdrop-space units. */
export const BACKDROP_WIDTH = 1000
export const BACKDROP_HEIGHT = 750

/** Panel shape when the table has no backdrop image (a desktop window). */
export const DEFAULT_ASPECT = 16 / 9

/**
 * Backglass shape measured from an authored VR cabinet (The Walking Dead's
 * `VRCab_Backglass`, in playfield widths): at most 1.335 wide, leaning back
 * atan(57/907). It stands on the head line itself, never over the playfield.
 */
const PANEL = { maxWidth: 1.335, lean: Math.atan2(57, 907) }

/** Table-local playfield extent (VPX units, `TableData` fields): the panel stands on its head at glass height. */
export interface PlayfieldExtent {
	left: number
	right: number
	top: number
	glassHeight: number
}

const panelAspect = (artAspect: number): number =>
	Number.isFinite(artAspect) && artAspect > 0 ? artAspect : DEFAULT_ASPECT

/**
 * Table-local transform (VPX units, height along -z) of a backglass panel
 * `height` tall: maps the NDC panel (x, y in [-1, 1], +z facing the player)
 * onto an upright, slightly leaning panel whose bottom edge sits on the head
 * of the playfield at glass height. Native stretches backdrop space over the
 * desktop window (`DrawSprite(0, 0, 1, 1)`); here it spans the panel, shaped
 * like the art (`artAspect`) so neither distorts.
 */
export function backglassPanelMatrix(playfield: PlayfieldExtent, artAspect: number, height: number): THREE.Matrix4 {
	const width = height * panelAspect(artAspect)
	const centerHeight = playfield.glassHeight + (height / 2) * Math.cos(PANEL.lean)
	return new THREE.Matrix4().compose(
		new THREE.Vector3(
			(playfield.left + playfield.right) / 2,
			playfield.top - (height / 2) * Math.sin(PANEL.lean),
			-centerHeight,
		),
		new THREE.Quaternion().setFromEuler(new THREE.Euler(-(Math.PI / 2 + PANEL.lean), 0, 0)),
		new THREE.Vector3(width / 2, height / 2, 1),
	)
}

/**
 * The largest backglass panel (up to the authored backglass width) whose
 * corners all stay `margin` (NDC) inside the view of `camera` (world space,
 * matrices current), so it fills the room the play view leaves above the
 * table without covering the playfield. `tableToWorld` is the table group's
 * world matrix. Bisects the height: corners only rise and widen as it grows.
 */
export function fitBackglassPanel(
	playfield: PlayfieldExtent,
	artAspect: number,
	camera: THREE.Camera,
	tableToWorld: THREE.Matrix4,
	margin = 0.04,
): THREE.Matrix4 {
	const limit = 1 - margin
	const world = new THREE.Matrix4()
	const corner = new THREE.Vector3()
	const fits = (height: number): boolean => {
		world.multiplyMatrices(tableToWorld, backglassPanelMatrix(playfield, artAspect, height))
		for (const [x, y] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		]) {
			corner.set(x!, y!, 0).applyMatrix4(world).project(camera)
			if (Math.abs(corner.x) > limit || corner.y > limit || Math.abs(corner.z) > 1) return false
		}
		return true
	}
	let low = 0
	let high = (PANEL.maxWidth * (playfield.right - playfield.left)) / panelAspect(artAspect)
	if (fits(high)) low = high
	else
		for (let i = 0; i < 24; i++) {
			const mid = (low + high) / 2
			if (fits(mid)) low = mid
			else high = mid
		}
	return backglassPanelMatrix(playfield, artAspect, low)
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
 * strip texture with the native cutout, two units in front of the art.
 */
export function createReelDigitQuad(map: THREE.Texture, rect: NdcRect, cell: DigitCellUV): THREE.Mesh {
	const geometry = new THREE.PlaneGeometry(1, 1)
	applyDigitCellUV(geometry, cell)
	const material = new THREE.MeshBasicMaterial({
		map,
		alphaTest: BACKGLASS_ALPHA_TEST,
		toneMapped: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.position.set(rect.centerX, rect.centerY, 2)
	mesh.scale.set(rect.sizeX, rect.sizeY, 1)
	mesh.frustumCulled = false
	return mesh
}

/**
 * Backdrop plane; `map` may be undefined for a flat color. Depth `z`
 * separates stacked layers (background color quad behind, art above, reels top).
 */
export function createBackdropPlane(map?: THREE.Texture, color = 0x000000, z = 0): THREE.Mesh {
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
