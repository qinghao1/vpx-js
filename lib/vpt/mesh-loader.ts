// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import ballMesh from '../../res/meshes/ball-mesh.json'
import bulbLightMesh from '../../res/meshes/bulb-light-mesh.json'
import bulbSocketMesh from '../../res/meshes/bulb-socket-mesh.json'
import bumperBaseMesh from '../../res/meshes/bumper-base-mesh.json'
import bumperCapMesh from '../../res/meshes/bumper-cap-mesh.json'
import bumperRingMesh from '../../res/meshes/bumper-ring-mesh.json'
import bumperSocketMesh from '../../res/meshes/bumper-socket-mesh.json'
import dropTargetT2Mesh from '../../res/meshes/drop-target-t2-mesh.json'
import dropTargetT3Mesh from '../../res/meshes/drop-target-t3-mesh.json'
import dropTargetT4Mesh from '../../res/meshes/drop-target-t4-mesh.json'
import flipperBaseMesh from '../../res/meshes/flipper-base-mesh.json'
import gateBracketMesh from '../../res/meshes/gate-bracket-mesh.json'
import gateLongPlateMesh from '../../res/meshes/gate-long-plate-mesh.json'
import gatePlateMesh from '../../res/meshes/gate-plate-mesh.json'
import gateWireMesh from '../../res/meshes/gate-wire-mesh.json'
import gateWireRectangleMesh from '../../res/meshes/gate-wire-rectangle-mesh.json'
import hitTargetFatRectangleMesh from '../../res/meshes/hit-target-fat-rectangle-mesh.json'
import hitTargetFatSquareMesh from '../../res/meshes/hit-target-fat-square-mesh.json'
import hitTargetRectangleMesh from '../../res/meshes/hit-target-rectangle-mesh.json'
import hitTargetRoundMesh from '../../res/meshes/hit-target-round-mesh.json'
import hitTargetT1SlimMesh from '../../res/meshes/hit-target-t1-slim-mesh.json'
import hitTargetT2SlimMesh from '../../res/meshes/hit-target-t2-slim-mesh.json'
import kickerCupMesh from '../../res/meshes/kicker-cup-mesh.json'
import kickerGottliebMesh from '../../res/meshes/kicker-gottlieb-mesh.json'
import kickerHoleMesh from '../../res/meshes/kicker-hole-mesh.json'
import kickerPlateMesh from '../../res/meshes/kicker-plate-mesh.json'
import kickerSimpleHoleMesh from '../../res/meshes/kicker-simple-hole-mesh.json'
import kickerT1Mesh from '../../res/meshes/kicker-t1-mesh.json'
import kickerWilliamsMesh from '../../res/meshes/kicker-williams-mesh.json'
import spinnerBracketMesh from '../../res/meshes/spinner-bracket-mesh.json'
import spinnerPlateMesh from '../../res/meshes/spinner-plate-mesh.json'
import triggerButtonMesh from '../../res/meshes/trigger-button-mesh.json'
import triggerInderMesh from '../../res/meshes/trigger-inder-mesh.json'
import triggerSimpleMesh from '../../res/meshes/trigger-simple-mesh.json'
import triggerStarMesh from '../../res/meshes/trigger-star-mesh.json'
import triggerWireDMesh from '../../res/meshes/trigger-wire-d-mesh.json'
import { Mesh } from './mesh.js'

const MESH_REGISTRY: Record<string, unknown> = {
	'ball-mesh': ballMesh,
	'bulb-light-mesh': bulbLightMesh,
	'bulb-socket-mesh': bulbSocketMesh,
	'bumper-base-mesh': bumperBaseMesh,
	'bumper-cap-mesh': bumperCapMesh,
	'bumper-ring-mesh': bumperRingMesh,
	'bumper-socket-mesh': bumperSocketMesh,
	'drop-target-t2-mesh': dropTargetT2Mesh,
	'drop-target-t3-mesh': dropTargetT3Mesh,
	'drop-target-t4-mesh': dropTargetT4Mesh,
	'flipper-base-mesh': flipperBaseMesh,
	'gate-bracket-mesh': gateBracketMesh,
	'gate-long-plate-mesh': gateLongPlateMesh,
	'gate-plate-mesh': gatePlateMesh,
	'gate-wire-mesh': gateWireMesh,
	'gate-wire-rectangle-mesh': gateWireRectangleMesh,
	'hit-target-fat-rectangle-mesh': hitTargetFatRectangleMesh,
	'hit-target-fat-square-mesh': hitTargetFatSquareMesh,
	'hit-target-rectangle-mesh': hitTargetRectangleMesh,
	'hit-target-round-mesh': hitTargetRoundMesh,
	'hit-target-t1-slim-mesh': hitTargetT1SlimMesh,
	'hit-target-t2-slim-mesh': hitTargetT2SlimMesh,
	'kicker-cup-mesh': kickerCupMesh,
	'kicker-gottlieb-mesh': kickerGottliebMesh,
	'kicker-hole-mesh': kickerHoleMesh,
	'kicker-plate-mesh': kickerPlateMesh,
	'kicker-simple-hole-mesh': kickerSimpleHoleMesh,
	'kicker-t1-mesh': kickerT1Mesh,
	'kicker-williams-mesh': kickerWilliamsMesh,
	'spinner-bracket-mesh': spinnerBracketMesh,
	'spinner-plate-mesh': spinnerPlateMesh,
	'trigger-button-mesh': triggerButtonMesh,
	'trigger-inder-mesh': triggerInderMesh,
	'trigger-simple-mesh': triggerSimpleMesh,
	'trigger-star-mesh': triggerStarMesh,
	'trigger-wire-d-mesh': triggerWireDMesh,
}

const cache = new Map<string, Mesh>()

/** Loads a static mesh from built-in mesh registry, cached. */
export function loadMesh(name: string): Mesh {
	let mesh = cache.get(name)
	if (!mesh) {
		const json = MESH_REGISTRY[name]
		if (!json) {
			throw new Error(`Mesh '${name}' not found in mesh registry`)
		}
		mesh = Mesh.fromJson(json as any)
		cache.set(name, mesh)
	}
	return mesh
}
