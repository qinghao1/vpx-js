// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as THREE from 'three'

const RE_CAB = /vrcab|cabinet|lockbar|pincab/i
const RE_VR = /vr_/i

function framingBox(node: THREE.Object3D, exclude?: (n: string) => boolean): { box: THREE.Box3; center: THREE.Vector3; size: THREE.Vector3; maxDim: number } {
	node.updateMatrixWorld(true)
	const box = new THREE.Box3().makeEmpty()
	node.traverse((o: THREE.Object3D) => {
		const mesh = o as THREE.Mesh
		if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes?.position) return
		if (exclude?.((o.name || '').toLowerCase())) return
		box.expandByObject(o)
	})
	if (box.isEmpty() || !Number.isFinite(box.min.x)) box.setFromObject(node)
	const center = box.getCenter(new THREE.Vector3())
	const size = box.getSize(new THREE.Vector3())
	return { box, center, size, maxDim: Math.max(size.x, size.y, size.z) }
}

const excludeNonPlayfield = (n: string): boolean =>
	!n.includes('playfield') && !n.includes('button') && !n.includes('coin') && !n.includes('plunger') && !n.includes('apron')

const excludeVrNonCab = (n: string): boolean => (RE_VR.test(n) && !RE_CAB.test(n)) || n.includes('vr_mega') || n.includes('vr_mini')

const VIEWER = { dist: 1.2, elev: 0.85, azim: 0.65, near: 0.015, farScale: 8, farMin: 2000 }
const PLAY = { dist: 1.0, elev: 1.1, azim: 0.68, near: 0.012, farScale: 10, farMin: 4000, forwardBias: -0.07 }

function framingState(
	node: THREE.Object3D,
	targetExclude: (n: string) => boolean,
	sizeExclude: (n: string) => boolean,
	cfg: typeof VIEWER & { forwardBias?: number },
): { center: THREE.Vector3; size: THREE.Vector3; maxDim: number; target: THREE.Vector3; position: THREE.Vector3; near: number; far: number } {
	const target = framingBox(node, targetExclude).center.clone()
	const { size, maxDim } = framingBox(node, sizeExclude)
	if ((cfg as unknown as { forwardBias?: number }).forwardBias) target.z += size.z * (cfg as unknown as { forwardBias: number }).forwardBias
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

export const computeViewerFraming = (node: THREE.Object3D) => framingState(node, excludeNonPlayfield, excludeVrNonCab, VIEWER)

const excludeLegsForPlay = (n: string): boolean =>
	n.includes('leg') ||
	n.includes('support') ||
	n.includes('bottom') ||
	(RE_VR.test(n) && !RE_CAB.test(n)) ||
	n.includes('vr_mega') ||
	n.includes('vr_mini')

export const computePlayFraming = (node: THREE.Object3D) => framingState(node, excludeNonPlayfield, excludeLegsForPlay, PLAY)

export function applyCameraState(camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3; update: () => void }, state: { target: THREE.Vector3; position: THREE.Vector3; near: number; far: number }): void {
	controls.target.copy(state.target)
	camera.position.copy(state.position)
	camera.near = state.near
	camera.far = state.far
	camera.updateProjectionMatrix()
	camera.lookAt(state.target)
	controls.update()
}

export function frameCamera(node: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3; update: () => void }): { center: THREE.Vector3; size: THREE.Vector3; maxDim: number } {
	const state = computeViewerFraming(node)
	applyCameraState(camera, controls, state)
	return { center: state.center, size: state.size, maxDim: state.maxDim }
}
