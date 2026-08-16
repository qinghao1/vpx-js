// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as THREE from 'three'

const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_VR = /vr_/i

type FramingBox = {
	box: THREE.Box3
	center: THREE.Vector3
	size: THREE.Vector3
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
	center: THREE.Vector3
	size: THREE.Vector3
	maxDim: number
	target: THREE.Vector3
	position: THREE.Vector3
	near: number
	far: number
}

// vpinball: ViewSetup.cpp FitCameraToVertices() frames table via bounding vertices + FOV.
// Demo heuristic mimics that without ViewSetup table data: use THREE.Box3 of visible meshes.
// Center on playfield/apron/button cluster (excludeNonPlayfield), size from cabinet-excluded box.
function framingBox(node: THREE.Object3D, exclude?: (name: string) => boolean): FramingBox {
	node.updateMatrixWorld(true)
	const box = new THREE.Box3().makeEmpty()
	node.traverse((obj: THREE.Object3D) => {
		const mesh = obj as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return
		if (exclude?.((obj.name ?? '').toLowerCase())) return
		box.expandByObject(obj)
	})
	if (box.isEmpty() || !Number.isFinite(box.min.x)) box.setFromObject(node)
	const center = box.getCenter(new THREE.Vector3())
	const size = box.getSize(new THREE.Vector3())
	return { box, center, size, maxDim: Math.max(size.x, size.y, size.z) }
}

const excludeNonPlayfield = (name: string): boolean =>
	!name.includes('playfield') &&
	!name.includes('button') &&
	!name.includes('coin') &&
	!name.includes('plunger') &&
	!name.includes('apron')

const excludeVrNonCab = (name: string): boolean =>
	(RE_VR.test(name) && !RE_CAB.test(name)) || name.includes('vr_mega') || name.includes('vr_mini')

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
	node: THREE.Object3D,
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
		position: new THREE.Vector3(target.x, target.y + dist * cfg.elev, target.z + dist * cfg.azim),
		near: Math.max(1, maxDim * cfg.near),
		far: Math.max(cfg.farMin, maxDim * cfg.farScale),
	}
}

export const computeViewerFraming = (node: THREE.Object3D): FramingState =>
	framingState(node, excludeNonPlayfield, excludeVrNonCab, VIEWER)

const excludeLegsForPlay = (name: string): boolean =>
	name.includes('leg') ||
	name.includes('support') ||
	name.includes('bottom') ||
	(RE_VR.test(name) && !RE_CAB.test(name)) ||
	name.includes('vr_mega') ||
	name.includes('vr_mini')

export const computePlayFraming = (node: THREE.Object3D): FramingState =>
	framingState(node, excludeNonPlayfield, excludeLegsForPlay, PLAY)

export function applyCameraState(
	camera: THREE.PerspectiveCamera,
	controls: { target: THREE.Vector3; update: () => void },
	state: FramingState,
): void {
	controls.target.copy(state.target)
	camera.position.copy(state.position)
	camera.near = state.near
	camera.far = state.far
	camera.updateProjectionMatrix()
	camera.lookAt(state.target)
	controls.update()
}

export function frameCamera(
	node: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
	controls: { target: THREE.Vector3; update: () => void },
): Pick<FramingState, 'center' | 'size' | 'maxDim'> {
	const state = computeViewerFraming(node)
	applyCameraState(camera, controls, state)
	return { center: state.center, size: state.size, maxDim: state.maxDim }
}
