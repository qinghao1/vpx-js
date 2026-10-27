import * as THREE from 'three'

// See the PMVM-deviation note on postProcessScene: upstream gates the room
// on VR mode, this viewer always builds one unless the table ships VR meshes.
export function ensureProceduralRoom(
	scene: THREE.Scene,
	center: THREE.Vector3,
	size: THREE.Vector3,
	opts: { hasVr?: boolean } = {},
): THREE.Group | null {
	const existing = scene.getObjectByName('vr_procedural_room')
	if (existing) scene.remove(existing)
	if (opts.hasVr) return null
	const maxDim = Math.max(size.x, size.y, size.z)
	const roomWidth = Math.max(1600, maxDim * 8)
	const roomDepth = Math.max(1600, maxDim * 8)
	const roomHeight = Math.max(900, maxDim * 6)
	const group = new THREE.Group()
	group.name = 'vr_procedural_room'
	const floorY = center.z - size.z * 0.6 - 200
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(roomWidth, roomDepth, roomHeight),
		new THREE.MeshStandardMaterial({ color: 0x1c222e, roughness: 0.95, side: THREE.BackSide }),
	)
	box.position.set(center.x, center.y, floorY + roomHeight * 0.5)
	group.add(box)
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth * 0.98, roomDepth * 0.98),
		new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.92, side: THREE.DoubleSide }),
	)
	floor.position.set(center.x, center.y, floorY + 0.6)
	group.add(floor)
	const grid = new THREE.GridHelper(Math.min(roomWidth, roomDepth) * 0.96, 16, 0x2f3a5a, 0x1e2535)
	grid.position.set(center.x, center.y, floorY + 1.2)
	grid.rotation.x = Math.PI / 2
	group.add(grid)
	const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1f2e, 0.45)
	hemi.name = 'proc_hemi'
	group.add(hemi)
	scene.add(group)
	return group
}
