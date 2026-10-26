import fs from 'node:fs'
import path from 'node:path'
import { attachLogging, injectDmdPattern, launchBrowser, loadPuppeteer, openTablePage, sleep } from './utils.mjs'
import { getArg } from './vpinball-resolver.ts'

const puppeteer = await loadPuppeteer()
const args = process.argv.slice(2)
const url = getArg(args, 'url', 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx')
const out = getArg(args, 'out', '/tmp')
console.log(`[harness-dmd] url=${url} out=${out}`)
const browser = await launchBrowser(puppeteer)
const { page } = await openTablePage(browser, url, {
	label: 'harness-dmd',
	onPage: async target => {
		attachLogging(target, {
			filter: /PinMAME|GameName|DMD|Ready|Parsed|Framed|created|emu|Player/,
			prefix: '[browser]',
		})
	},
})
console.log('[harness-dmd] injecting DMD test pattern')
const inject = await injectDmdPattern(page)
console.log('[harness-dmd] inject result', JSON.stringify(inject))
await sleep(800)
const afterRender = await page.evaluate(() => {
	const v = window.viewer
	const wrap = document.getElementById('dmd-wrap')
	const canvas = document.getElementById('dmd')
	return {
		dmdDisplay: wrap ? getComputedStyle(wrap).display : 'no-wrap',
		dmdCanvasDisplay: canvas ? getComputedStyle(canvas).display : 'no-canvas',
		dmdStatus: document.getElementById('dmd-status')?.innerText || '',
		stats: document.getElementById('stats')?.innerText || '',
		dmdMeshes: v?.dmdMeshes?.map(m => ({
			name: m.name,
			pos: `${m.position.x.toFixed(1)},${m.position.y.toFixed(1)},${m.position.z.toFixed(1)}`,
			rot: `${((m.rotation.x * 180) / Math.PI).toFixed(1)},${((m.rotation.y * 180) / Math.PI).toFixed(1)},${((m.rotation.z * 180) / Math.PI).toFixed(1)}`,
			visible: m.visible,
			hasMap: !!m.material?.map,
			hasEmissive: !!m.material?.emissiveMap,
		})),
		worldPos: (() => {
			try {
				const m = v?.dmdMeshes?.[0]
				if (!m) return null
				const p = new THREE.Vector3()
				m.getWorldPosition(p)
				return `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`
			} catch (e) {
				return `err ${e.message}`
			}
		})(),
		cam: (() => {
			try {
				const c = window.camera
				return `${c.position.x.toFixed(1)},${c.position.y.toFixed(1)},${c.position.z.toFixed(1)}`
			} catch {
				return ''
			}
		})(),
	}
})
console.log('[harness-dmd] afterRender', JSON.stringify(afterRender, null, 2))
// Now position camera to look at DMD on table
console.log('[harness-dmd] positioning camera to DMD')
const camInfo = await page.evaluate(() => {
	try {
		const viewer = window.viewer
		const mesh = viewer?.dmdMeshes?.[0]
		if (!mesh) return 'no mesh'
		const THREE = window.THREE
		const worldPos = new THREE.Vector3()
		mesh.getWorldPosition(worldPos)
		// Also need to consider mesh rotation: DMD plane is vertical facing south (+Z world). Camera should be south of DMD looking north, slightly up.
		// Compute offset based on world axes: we assume Y up, Z north-south, X east-west
		// Try offsets Empirically: try multiple offsets and pick one that shows DMD
		// Current play cam is at 0,47,135 target 0,-3,6 -> looking from south towards north, slightly down
		// DMD at height 635 local -> world Y approx? Let's get worldPos Y
		// Choose camera offset 35 units south (+Z) and 20 up (+Y)
		const cam = window.camera
		const controls = window.controls
		// Save original
		const origPos = cam.position.clone()
		// Offset south (+Z) and up (+Y)
		const offset = new THREE.Vector3(0, 18, 45)
		// For DMD at north end, south is positive Z, so add to worldPos
		cam.position.copy(worldPos).add(offset)
		// Slight X centered
		controls.target.copy(worldPos)
		cam.updateMatrixWorld()
		controls.update()
		if (window.renderer && window.scene) window.renderer.render(window.scene, cam)
		return `worldPos ${worldPos.x.toFixed(2)},${worldPos.y.toFixed(2)},${worldPos.z.toFixed(2)} cam ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)} target ${controls.target.x.toFixed(1)},${controls.target.y.toFixed(1)},${controls.target.z.toFixed(1)} origPos ${origPos.x.toFixed(1)},${origPos.y.toFixed(1)},${origPos.z.toFixed(1)}`
	} catch (e) {
		return `cam err ${e.stack?.slice(0, 2000)}`
	}
})
console.log('[harness-dmd] camInfo', camInfo)
await sleep(600)
const shotPath = path.join(out, 'dmd_on_table.png')
await page.screenshot({ path: shotPath })
console.log(`[harness-dmd] screenshot 1 -> ${shotPath} ${fs.statSync(shotPath).size} bytes`)
await sleep(400)
// Also take a second shot from slightly different angle: overview
const camInfo2 = await page.evaluate(() => {
	try {
		const viewer = window.viewer
		const mesh = viewer?.dmdMeshes?.[0]
		const worldPos = new THREE.Vector3()
		mesh.getWorldPosition(worldPos)
		const cam = window.camera
		const controls = window.controls
		// overview: higher up, further south
		cam.position.copy(worldPos).add(new THREE.Vector3(0, 35, 80))
		controls.target.copy(worldPos).add(new THREE.Vector3(0, -5, -10))
		cam.updateMatrixWorld()
		controls.update()
		if (window.renderer && window.scene) window.renderer.render(window.scene, cam)
		return `overview cam ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}`
	} catch (e) {
		return `err ${e.message}`
	}
})
console.log('[harness-dmd] camInfo2', camInfo2)
await sleep(600)
const shotPath2 = path.join(out, 'dmd_overview.png')
await page.screenshot({ path: shotPath2 })
console.log(`[harness-dmd] screenshot 2 -> ${shotPath2} ${fs.statSync(shotPath2).size} bytes`)
// Also take play camera shot for comparison
await page.evaluate(() => {
	try {
		const viewer = window.viewer
		// restore play camera
		try {
			viewer.setupPlayCamera()
		} catch {}
		if (window.renderer && window.scene && window.camera) window.renderer.render(window.scene, window.camera)
	} catch {}
})
await sleep(600)
const shotPath3 = path.join(out, 'dmd_play_cam.png')
await page.screenshot({ path: shotPath3 })
console.log(`[harness-dmd] screenshot 3 (play cam) -> ${shotPath3} ${fs.statSync(shotPath3).size} bytes`)
// Pixel-count assert: the injected pattern must actually reach the 2D DMD
// canvas (lit pixels) and the 3D DMD meshes (bound maps). This is a gate, not
// a screenshot script — it exits nonzero when the DMD pipeline is dark.
const verdict = await page.evaluate(() => {
	try {
		const canvas = document.getElementById('dmd')
		let lit = 0,
			total = 0
		if (canvas && canvas.width > 0 && canvas.height > 0) {
			const ctx = canvas.getContext('2d')
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
			total = canvas.width * canvas.height
			for (let index = 0; index < data.length; index += 4) {
				if (data[index] + data[index + 1] + data[index + 2] > 0) lit++
			}
		}
		const meshes = window.viewer?.dmdMeshes || []
		const mapped = meshes.filter(mesh => !!mesh.material?.map).length
		return { lit, total, meshes: meshes.length, mapped }
	} catch (err) {
		return { lit: 0, total: 0, meshes: 0, mapped: 0, error: err.message }
	}
})
console.log('[harness-dmd] verdict', JSON.stringify(verdict))
const dmdPass = verdict.lit > 100 && verdict.mapped > 0
await browser.close()
if (!dmdPass) {
	console.error(
		`[harness-dmd] FAIL: expected >100 lit DMD pixels + mapped meshes (lit=${verdict.lit}/${verdict.total} meshes=${verdict.meshes} mapped=${verdict.mapped})`,
	)
	process.exit(1)
}
console.log(`[harness-dmd] PASS: DMD pipeline live (lit=${verdict.lit}/${verdict.total} mapped=${verdict.mapped})`)
