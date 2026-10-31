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

// vpinball: ViewSetup.cpp FitCameraToVertices() frames table via bounding vertices + FOV.
// Demo heuristic mimics that without ViewSetup table data: use THREE.Box3 of visible meshes.
// Center on playfield/apron/button cluster (excludeNonPlayfield), size from cabinet-excluded box.
// Threading the live table data (inclination/rotation/FOV via ComputeMVP) through is a follow-up.
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

function framingState(
	node: Object3D,
	targetExclude: (name: string) => boolean,
	sizeExclude: (name: string) => boolean,
	cfg: FramingConfig,
): FramingState {
	const target = framingBox(node, targetExclude).center.clone()
	const { size, maxDim } = framingBox(node, sizeExclude)
	if (cfg.forwardBias) target.z += size.z * cfg.forwardBias
	const dist = maxDim * cfg.dist
	return {
		center: target.clone(),
		size,
		maxDim,
		target: target.clone(),
		position: new Vector3(target.x, target.y + dist * cfg.elev, target.z + dist * cfg.azim),
		near: Math.max(1, maxDim * cfg.near),
		far: Math.max(cfg.farMin, maxDim * cfg.farScale),
	}
}

// Camera sizing sees the table only: the playfield cluster plus the cabinet
// that encloses it. Legs, supports, VR-room and diorama scenery are sized
// out by construction, whatever individual pieces happen to be named.
const excludeNonTable = (name: string): boolean => excludeNonPlayfield(name) && !RE_CAB.test(name)

export const computeViewerFraming = (node: Object3D): FramingState =>
	framingState(node, excludeNonPlayfield, excludeNonTable, VIEWER)

export const computePlayFraming = (node: Object3D): FramingState =>
	framingState(node, excludeNonPlayfield, excludeNonTable, PLAY)

export function applyCameraState(
	camera: PerspectiveCamera,
	controls: { target: Vector3; update: () => void; maxDistance?: number; minDistance?: number },
	state: FramingState,
): void {
	controls.target.copy(state.target)
	camera.position.copy(state.position)
	camera.near = state.near
	camera.far = state.far
	camera.updateProjectionMatrix()
	camera.lookAt(state.target)
	// Keep the orbit inside the authored world: unbounded dolly-out parks the
	// camera outside room/skybox shells, where a dark exterior fills the view.
	const dist = state.position.distanceTo(state.target)
	controls.maxDistance = dist * 3
	controls.minDistance = Math.max(state.near, dist * 0.05)
	controls.update()
}

export function frameCamera(
	node: Object3D,
	camera: PerspectiveCamera,
	controls: { target: Vector3; update: () => void; maxDistance?: number; minDistance?: number },
): Pick<FramingState, 'center' | 'size' | 'maxDim'> {
	const state = computeViewerFraming(node)
	applyCameraState(camera, controls, state)
	return { center: state.center, size: state.size, maxDim: state.maxDim }
}
