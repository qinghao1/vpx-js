import { Player } from '../../lib/game/player.ts'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.ts'
import { Matrix3D } from '../../lib/math/matrix.ts'
import { Vertex3D } from '../../lib/math/vector.ts'
import { loadMesh } from '../../lib/vpt/mesh-loader.ts'
import { Table } from '../../lib/vpt/table/table.ts'

// Physics-to-visual direction coupling only (no spec covers it); visual-brute
// coverage lives in lib/vpt/spinner/spinner-visual-regression.spec.ts.

async function harness() {
	console.log('TAP version 13')
	console.log('1..1')

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
			const dist = 80
			const speed = 10
			const sign = side === 'pos' ? 1 : -1
			const sx = data.center.x + sign * normal.x * dist
			const sy = data.center.y + sign * normal.y * dist
			const vx = -sign * normal.x * speed
			const vy = -sign * normal.y * speed
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
				console.log(`not ok 1 - spinner side ${side} did not move angle ${angle}`)
				ok = false
				continue
			}
			// D3D delta for that angle
			const scaleZ = table2.getScaleZ()
			const base = table2.getSurfaceHeight(data.szSurface, data.center.x, data.center.y) * scaleZ
			const posZ = data.height + base
			const len = data.length
			const mesh = loadMesh('spinner-plate-mesh')
			const bottom = mesh.vertices.find(v => v.z < -0.2)
			const raw = new Vertex3D(bottom.x, bottom.y, bottom.z)
			const cppAngle = -angle
			const transformAt = xAngle =>
				new Matrix3D()
					.rotateXMatrix(xAngle)
					.multiply(new Matrix3D().rotateZMatrix(rad))
					.clone()
					.multiply(new Matrix3D().setScaling(len, len, len))
					.multiply(new Matrix3D().setTranslation(data.center.x, data.center.y, posZ))
			const cD3d = raw.clone().multiplyMatrix(transformAt(cppAngle))
			const cD3d0 = raw.clone().multiplyMatrix(transformAt(0))
			const deltaY = cD3d.y - cD3d0.y
			const dot = deltaY * vy + (cD3d.x - cD3d0.x) * vx
			if (dot <= 0) {
				console.log(
					`not ok 1 - spinner side ${side} deltaY ${deltaY.toFixed(2)} vy ${vy} dot ${dot.toFixed(2)} wrong`,
				)
				ok = false
			} else {
				console.log(
					`# side ${side} angle ${angle.toFixed(3)} deltaY ${deltaY.toFixed(2)} dot ${dot.toFixed(2)} OK`,
				)
			}
		}
		if (ok) {
			console.log('ok 1 - spinner physics visual direction D3D Y dot>0 for both sides')
		} else {
			console.log('not ok 1 - spinner physics direction failed')
			process.exitCode = 1
		}
	} catch (error) {
		console.log(`not ok 1 - exception ${error.message}`)
		console.error(error)
		process.exitCode = 1
	}
}
harness()
