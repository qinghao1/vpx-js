import { injectDmdPattern, launchBrowser, loadPuppeteer, openTablePage, sleep } from './utils.mjs'
import { getArg } from './vpinball-resolver.ts'

async function tapKey(page, code, key, holdMs) {
	await page.evaluate(
		async (keyCode, keyName, hold) => {
			const p = window.viewer?.player
			if (!p) return
			p.onKeyDown({ code: keyCode, key: keyName })
			await new Promise(resolve => setTimeout(resolve, hold))
			p.onKeyUp({ code: keyCode, key: keyName })
		},
		code,
		key,
		holdMs,
	)
}

const args = process.argv.slice(2)
const url = getArg(args, 'url', 'http://127.0.0.1:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play')
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const { page, viewerReady } = await openTablePage(browser, url, {
	readyTimeoutMs: 45000,
	playTimeoutMs: 0,
	label: 'harness-pinmame',
	onPage: async target => {
		target.on('console', message => {
			const text = message.text()
			if (/PinMAME|DMD|Ready|emu/i.test(text)) console.log(`[browser] ${text.slice(0, 600)}`)
		})
		target.on('pageerror', err => console.log('[pageerror]', err.message))
	},
})
if (!viewerReady) console.log('not ready after 45s — continuing')

let pinOk = false,
	realDmdOk = false,
	pipelineOk = false,
	pipelineAttempted = false,
	finalMax = 0,
	finalPipelineMax = 0

for (let i = 0; i < 30; i++) {
	await sleep(1000)
	const state = await page.evaluate(() => {
		const emu = window.viewer?.player?.getPhysics?.()?.emu
		const d = window.viewer?.player?.getDmdFrame?.()
		const dims = window.viewer?.player?.getDmdDimensions?.()
		let max = 0,
			sum = 0
		if (d?.length)
			for (const v of d) {
				if (v > max) max = v
				sum += v
			}
		return {
			emu: emu?.constructor.name || 'none',
			init: emu?.isInitialized?.() ?? false,
			mock: emu?.isMock ?? true,
			w: dims?.x || 0,
			h: dims?.y || 0,
			len: d?.length || 0,
			max,
			sum,
		}
	})
	console.log(
		`[poll ${i}] emu=${state.emu} init=${state.init} mock=${state.mock} DMD ${state.w}x${state.h} len=${state.len} max=${state.max} sum=${state.sum}`,
	)
	// Any self-consistent DMD geometry counts — never hardcode one table's 128x32.
	const dimsValid = state.w > 0 && state.h > 0 && state.len === state.w * state.h
	if (state.emu === 'PinMameEmulator' && state.init && !state.mock && dimsValid) pinOk = true
	if (pinOk && state.max > 0) {
		realDmdOk = true
		finalMax = state.max
		console.log(`DMD ACTIVE max=${state.max} at poll ${i}`)
		break
	}

	if (i === 6) {
		console.log('>>> coin Digit5')
		await tapKey(page, 'Digit5', '5', 250)
	}
	if (i === 10) {
		console.log('>>> start Digit1')
		await tapKey(page, 'Digit1', '1', 350)
	}
	if (i === 13) {
		console.log('>>> switch 16 pulse')
		await page.evaluate(async () => {
			const e = window.viewer?.player?.getPhysics?.()?.emu
			if (e) {
				e.setSwitchInput(16, true)
				await new Promise(r => setTimeout(r, 300))
				e.setSwitchInput(16, false)
			}
		})
	}
}

if (pinOk && !realDmdOk) {
	console.log('ROM DMD idle (max 0) — verifying display pipeline via injected pattern...')
	pipelineAttempted = true
	const injected = await injectDmdPattern(page)
	console.log('injected', JSON.stringify(injected, null, 2))
	const pipeline = await page.evaluate(() => {
		const viewer = window.viewer
		const canvas = document.getElementById('dmd')
		let canvasSum = 0
		if (canvas) {
			try {
				const ctx = canvas.getContext('2d')
				const data = ctx.getImageData(0, 0, Math.min(32, canvas.width), Math.min(32, canvas.height)).data
				for (let index = 0; index < data.length; index++) canvasSum += data[index]
			} catch {}
		}
		const meshes = (viewer?.dmdMeshes || []).map(mesh => ({ name: mesh.name, hasMap: !!mesh.material?.map }))
		return { canvasSum, meshes }
	})
	if (injected.ok && pipeline.canvasSum > 0 && pipeline.meshes.length > 0) {
		pipelineOk = true
		finalPipelineMax = injected.max
	}
	try {
		await page.screenshot({ path: '/tmp/harness-pinmame.png' })
		console.log('screenshot /tmp/harness-pinmame.png')
	} catch {}
}

// Split verdict: the synthetic pipeline must never masquerade as a live ROM DMD.
const dmdOk = realDmdOk || pipelineOk
console.log('\n=== RESULT ===')
console.log(`PinMAME running: ${pinOk ? 'PASS' : 'FAIL'}`)
console.log(
	`DMD display (real ROM): ${realDmdOk ? 'PASS' : 'FAIL'}${realDmdOk ? ` (max ${finalMax})` : ' (max 0 — idle or blank)'}`,
)
console.log(
	`DMD pipeline (synthetic pattern): ${pipelineOk ? 'PASS' : pipelineAttempted ? 'FAIL' : 'SKIP (not attempted)'}${pipelineOk ? ` (max ${finalPipelineMax})` : ''}`,
)

await browser.close()
if (!pinOk) {
	console.error('FAIL PinMAME')
	process.exit(1)
}
if (!dmdOk) {
	console.error('FAIL DMD')
	process.exit(1)
}
console.log(`PASS PinMAME and DMD (${realDmdOk ? 'real ROM' : 'synthetic pipeline only'})`)
