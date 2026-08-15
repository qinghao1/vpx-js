import { Player } from '../../lib/game/player.ts'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.ts'
import { Matrix3D } from '../../lib/util/matrix.ts'
import { Vertex3D } from '../../lib/util/vector.ts'
import { loadMesh } from '../../lib/vpt/mesh-loader.ts'
import { Table } from '../../lib/vpt/table/table.ts'

function toWorldFromD3D(p) {
	return new Vertex3D(p.x, p.z, p.y)
}
function toWorldFromRH(p) {
	return new Vertex3D(p.x, -p.z, p.y)
}

async function harness() {
	console.log('TAP version 13')
	console.log('1..2')
	// Visual brute vs C++
	try {
		const table = await Table.load(new NodeBinaryReader('test/fixtures/table-spinner.vpx'))
		const spinner = table.spinners.Spinner
		const data = spinner.data
		const scaleZ = table.getScaleZ()
		const base = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y) * scaleZ
		const posZ = data.height + base
		const rot = data.rotation
		const len = data.length
		const mesh = loadMesh('spinner-plate-mesh')
		const bottom = mesh.vertices.filter(v => v.z < -0.2)[0]
		const raw = new Vertex3D(bottom.x, bottom.y, bottom.z)
		const angle = 0.5
		const cppAngle = -angle
		const full = new Matrix3D()
			.rotateXMatrix(cppAngle)
			.multiply(new Matrix3D().rotateZMatrix((rot * Math.PI) / 180))
		const vert = full
			.clone()
			.multiply(new Matrix3D().setScaling(len, len, len))
			.multiply(new Matrix3D().setTranslation(data.center.x, data.center.y, posZ))
		const cD3d = new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(vert)
		const cWorld = toWorldFromD3D(cD3d)
		const TestRenderApi = (await import('../../test/test-render-api.ts')).TestRenderApi
		const tr = new TestRenderApi()
		let cap = null
		tr.applyMatrixToNode = m => (cap = m.clone())
		tr.findInGroup = () => ({})
		spinner.getUpdater().applyState({}, { angle }, tr, table)
		const mRz = new Matrix3D().rotateZMatrix((rot * Math.PI) / 180)
		const Slen = new Matrix3D().setScaling(len, len, len * scaleZ)
		const Tw = new Matrix3D().setTranslation(data.center.x, data.center.y, posZ)
		const staticMat = mRz.clone().multiply(Slen).multiply(Tw)
		const RH = new Matrix3D().setScaling(1, 1, -1)
		const staticWithHand = staticMat.clone().multiply(RH)
		const total = staticWithHand.clone().multiply(cap)
		const jRh = new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(total)
		const jWorld = toWorldFromRH(jRh)
		const err = Math.hypot(cWorld.x - jWorld.x, cWorld.y - jWorld.y, cWorld.z - jWorld.z)
		if (err < 1e-4) {
			console.log(`ok 1 - spinner visual matches C++ brute err ${err.toFixed(5)}`)
		} else {
			console.log(`not ok 1 - spinner visual err ${err.toFixed(5)} expected <1e-4`)
			process.exitCode = 1
		}
	} catch (e) {
		console.log(`not ok 1 - exception ${e.message}`)
		console.error(e)
		process.exitCode = 1
	}

	// Physics vs visual direction (D3D Y)
	try {
		const table = await Table.load(new NodeBinaryReader('test/fixtures/table-spinner.vpx'))
		const spinner = table.spinners.Spinner
		const data = spinner.data
		const rot = data.rotation
		const rad = (rot * Math.PI) / 180
		const normal = { x: -Math.sin(rad), y: Math.cos(rad) }
		let ok = true
		for (const side of ['pos', 'neg']) {
			const dist = 80,
				speed = 10
			const sx = data.center.x + (side === 'pos' ? normal.x : -normal.x) * dist
			const sy = data.center.y + (side === 'pos' ? normal.y : -normal.y) * dist
			const vx = (side === 'pos' ? -normal.x : normal.x) * speed
			const vy = (side === 'pos' ? -normal.y : normal.y) * speed
			const table2 = await Table.load(new NodeBinaryReader('test/fixtures/table-spinner.vpx'))
			const player2 = new Player(table2).init()
			const spinner2 = table2.spinners.Spinner
			player2.createBall({
				getBallCreationPosition() {
					return new Vertex3D(sx, sy, 30)
				},
				getBallCreationVelocity() {
					return new Vertex3D(vx, vy, 0)
				},
				onBallCreated() {},
			})
			player2.updatePhysics(0)
			player2.updatePhysics(50)
			player2.updatePhysics(150)
			player2.updatePhysics(250)
			const angle = spinner2.getState().angle
			if (Math.abs(angle) < 0.01) {
				console.log(`not ok 2 - spinner side ${side} did not move angle ${angle}`)
				ok = false
				continue
			}
			// D3D delta for that angle
			const scaleZ = table2.getScaleZ()
			const base = table2.getSurfaceHeight(data.szSurface, data.center.x, data.center.y) * scaleZ
			const posZ = data.height + base
			const len = data.length
			const mesh = loadMesh('spinner-plate-mesh')
			const bottom = mesh.vertices.filter(v => v.z < -0.2)[0]
			const raw = new Vertex3D(bottom.x, bottom.y, bottom.z)
			const cppAngle = -angle
			const full = new Matrix3D()
				.rotateXMatrix(cppAngle)
				.multiply(new Matrix3D().rotateZMatrix((rot * Math.PI) / 180))
			const vert = full
				.clone()
				.multiply(new Matrix3D().setScaling(len, len, len))
				.multiply(new Matrix3D().setTranslation(data.center.x, data.center.y, posZ))
			const cD3d = new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(vert)
			const full0 = new Matrix3D().rotateXMatrix(0).multiply(new Matrix3D().rotateZMatrix((rot * Math.PI) / 180))
			const vert0 = full0
				.clone()
				.multiply(new Matrix3D().setScaling(len, len, len))
				.multiply(new Matrix3D().setTranslation(data.center.x, data.center.y, posZ))
			const cD3d0 = new Vertex3D(raw.x, raw.y, raw.z).multiplyMatrix(vert0)
			const deltaY = cD3d.y - cD3d0.y
			const dot = deltaY * vy + (cD3d.x - cD3d0.x) * vx
			if (dot <= 0) {
				console.log(
					`not ok 2 - spinner side ${side} deltaY ${deltaY.toFixed(2)} vy ${vy} dot ${dot.toFixed(2)} wrong`,
				)
				ok = false
			} else {
				console.log(
					`# side ${side} angle ${angle.toFixed(3)} deltaY ${deltaY.toFixed(2)} dot ${dot.toFixed(2)} OK`,
				)
			}
		}
		if (ok) {
			console.log('ok 2 - spinner physics visual direction D3D Y dot>0 for both sides')
		} else {
			console.log('not ok 2 - spinner physics direction failed')
			process.exitCode = 1
		}
	} catch (e) {
		console.log(`not ok 2 - exception ${e.message}`)
		console.error(e)
		process.exitCode = 1
	}
}
harness()
