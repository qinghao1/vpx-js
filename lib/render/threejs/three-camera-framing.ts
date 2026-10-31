// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Box3, type Mesh, type Object3D, type PerspectiveCamera, Vector3 } from 'three'
import { RE_CAB } from './scene-classify.js'

type FramingBox = {
	box: Box3
	center: Vector3
	size: Vector3
	maxDim: number
}

type FramingConfig = {
	dist: number
	elev: number
	azim: number
	near: number
	farScale: number
	farMin: number
	forwardBias?: number
}

type FramingState = {
	center: Vector3
	size: Vector3
	maxDim: number
	target: Vector3
	position: Vector3
	near: number
	far: number
}

type FramingControls = {
	target: Vector3
	update: () => void
	maxDistance?: number
	minDistance?: number
}

const MAX_ORBIT_SCALE = 3
const MIN_ORBIT_SCALE = 0.05

// vpinball: ViewSetup.cpp FitCameraToVertices() frames tables via bounding vertices + FOV.
// Demo heuristic mimics that without ViewSetup table data: the play view fits
// the playfield cluster's Box3 corners through the live projection (closed
// form, one pass), so every table fills the frame identically at the shared
// FOV; size still spans the cabinet for room sync. The orbit overview keeps
// the legacy maxDim-distance framing of the whole machine.
function framingBox(node: Object3D, exclude?: (name: string) => boolean): FramingBox {
	node.updateMatrixWorld(true)
	const box = new Box3().makeEmpty()
	node.traverse((obj: Object3D) => {
		const mesh = obj as Mesh
		if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return
		if (exclude?.((obj.name ?? '').toLowerCase())) return
		box.expandByObject(obj)
	})
	if (box.isEmpty() || !Number.isFinite(box.min.x)) box.setFromObject(node)
	const center = box.getCenter(new Vector3())
	const size = box.getSize(new Vector3())
	return { box, center, size, maxDim: Math.max(size.x, size.y, size.z) }
}

const excludeNonPlayfield = (name: string): boolean =>
	!name.includes('playfield') &&
	!name.includes('button') &&
	!name.includes('coin') &&
	!name.includes('plunger') &&
	!name.includes('apron')

const VIEWER: FramingConfig = { dist: 1.2, elev: 0.85, azim: 0.65, near: 0.015, farScale: 8, farMin: 2000 }
const PLAY: FramingConfig = {
	dist: 1.0,
	elev: 1.1,
	azim: 0.68,
	near: 0.012,
	farScale: 10,
	farMin: 4000,
	forwardBias: -0.07,
}

// Playfield cluster fills the frame (NDC half-extent 1): every table renders
// the same regardless of backbox/cabinet proportions. Slightly under 1 keeps
// a hairline of the rails visible instead of clipping the playfield edge.
const PLAY_FILL = 0.98

// Closed-form pinhole solve: each box corner requires
// dist >= perp / (PLAY_FILL * tan) + depth; the max over corners fits them all.
function fitDistance(box: Box3, target: Vector3, dir: Vector3, tanHalfFov: number, aspect: number): number {
	const forward = dir.clone().negate()
	const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0))
	if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
	right.normalize()
	const up = new Vector3().crossVectors(right, forward)
	const scale = PLAY_FILL * tanHalfFov
	const rel = new Vector3()
	let dist = 0
	for (const x of [box.min.x, box.max.x])
		for (const y of [box.min.y, box.max.y])
			for (const z of [box.min.z, box.max.z]) {
				rel.set(x, y, z).sub(target)
				const need = Math.max(Math.abs(rel.dot(right)) / aspect, Math.abs(rel.dot(up))) / scale + rel.dot(dir)
				if (need > dist) dist = need
			}
	return dist
}

function framingState(
	node: Object3D,
	targetExclude: (name: string) => boolean,
	sizeExclude: (name: string) => boolean,
	cfg: FramingConfig,
	fit?: { fov: number; aspect: number },
): FramingState {
	const cluster = framingBox(node, targetExclude)
	const target = cluster.center.clone()
	const { size, maxDim } = framingBox(node, sizeExclude)
	if (cfg.forwardBias) target.z += cluster.size.z * cfg.forwardBias
	const offset = new Vector3(0, cfg.elev, cfg.azim).normalize()
	let dist = maxDim * cfg.dist
	if (fit) {
		const solved = fitDistance(cluster.box, target, offset, Math.tan((fit.fov * Math.PI) / 360), fit.aspect)
		if (Number.isFinite(solved) && solved > 0) dist = solved
	}
	return {
		center: target.clone(),
		size,
		maxDim,
		target: target.clone(),
		position: fit
			? target.clone().addScaledVector(offset, dist)
			: new Vector3(target.x, target.y + dist * cfg.elev, target.z + dist * cfg.azim),
		near: Math.max(1, maxDim * cfg.near),
		far: Math.max(cfg.farMin, maxDim * cfg.farScale),
	}
}

// Size from the table only, so room scenery cannot inflate the frame.
const excludeNonTable = (name: string): boolean => excludeNonPlayfield(name) && !RE_CAB.test(name)

export const computeViewerFraming = (node: Object3D): FramingState =>
	framingState(node, excludeNonPlayfield, excludeNonTable, VIEWER)

// Play distance fits the playfield cluster to the frame (fov/aspect aware),
// so every table fills the screen the same way; size still covers the cabinet
// for room sync. Callers pass the live camera's fov/aspect.
export const computePlayFraming = (node: Object3D, view: { fov: number; aspect: number }): FramingState =>
	framingState(node, excludeNonPlayfield, excludeNonTable, PLAY, view)

export function applyCameraState(camera: PerspectiveCamera, controls: FramingControls, state: FramingState): void {
	controls.target.copy(state.target)
	camera.position.copy(state.position)
	camera.near = state.near
	camera.far = state.far
	camera.updateProjectionMatrix()
	camera.lookAt(state.target)
	// Unbounded dolly-out leaves the authored world, showing its dark exterior.
	const dist = state.position.distanceTo(state.target)
	controls.maxDistance = dist * MAX_ORBIT_SCALE
	controls.minDistance = Math.max(state.near, dist * MIN_ORBIT_SCALE)
	controls.update()
}

export function frameCamera(
	node: Object3D,
	camera: PerspectiveCamera,
	controls: FramingControls,
): Pick<FramingState, 'center' | 'size' | 'maxDim'> {
	const state = computeViewerFraming(node)
	applyCameraState(camera, controls, state)
	return { center: state.center, size: state.size, maxDim: state.maxDim }
}
