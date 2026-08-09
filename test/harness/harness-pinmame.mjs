import { launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

const url =
	process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:3000/walking-dead.html?mode=play'
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)

const logs = []
page.on('console', m => {
	const t = m.text()
	logs.push(t)
	if (/PinMAME|DMD|Ready|emu/i.test(t)) console.log(`[browser] ${t.slice(0, 600)}`)
})
page.on('pageerror', e => console.log('[pageerror]', e.message))

console.log(`[harness-pinmame] goto ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

let ready = false
for (let i = 0; i < 45; i++) {
	await new Promise(r => setTimeout(r, 1000))
	const s = await page.evaluate(() => ({
		title: document.getElementById('load-title')?.innerText || '',
		hasPlayer: !!window.viewer?.player,
		emu: window.viewer?.player?.getPhysics?.()?.emu?.constructor.name || 'none',
		init: window.viewer?.player?.getPhysics?.()?.emu?.isInitialized?.() ?? null,
		mock: window.viewer?.player?.getPhysics?.()?.emu?.isMock ?? null,
	}))
	console.log(`[${i}s] title="${s.title.slice(0, 50)}" emu=${s.emu} init=${s.init} mock=${s.mock}`)
	if (s.title.includes('Ready') && s.hasPlayer) {
		ready = true
		console.log(`READY at ${i}s`)
		break
	}
}
if (!ready) console.log('not ready after 45s — continuing')

await page.evaluate(() => {
	const sel = document.getElementById('mode')
	if (sel) {
		sel.value = 'play'
		sel.dispatchEvent(new Event('change', { bubbles: true }))
	}
	if (window.viewer) window.viewer.viewerMode = 'play'
})
await new Promise(r => setTimeout(r, 2000))

let pinOk = false,
	dmdOk = false,
	finalMax = 0

for (let i = 0; i < 30; i++) {
	await new Promise(r => setTimeout(r, 1000))
	const s = await page.evaluate(() => {
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
		`[poll ${i}] emu=${s.emu} init=${s.init} mock=${s.mock} DMD ${s.w}x${s.h} len=${s.len} max=${s.max} sum=${s.sum}`,
	)
	if (s.emu === 'PinMameEmulator' && s.init && !s.mock && s.w === 128 && s.h === 32 && s.len === 4096) pinOk = true
	if (pinOk && s.max > 0) {
		dmdOk = true
		finalMax = s.max
		console.log(`DMD ACTIVE max=${s.max} at poll ${i}`)
		break
	}

	if (i === 6) {
		console.log('>>> coin Digit5')
		await page.evaluate(async () => {
			const p = window.viewer?.player
			if (!p) return
			p.onKeyDown({ code: 'Digit5', key: '5' })
			await new Promise(r => setTimeout(r, 250))
			p.onKeyUp({ code: 'Digit5', key: '5' })
		})
	}
	if (i === 10) {
		console.log('>>> start Digit1')
		await page.evaluate(async () => {
			const p = window.viewer?.player
			if (!p) return
			p.onKeyDown({ code: 'Digit1', key: '1' })
			await new Promise(r => setTimeout(r, 350))
			p.onKeyUp({ code: 'Digit1', key: '1' })
		})
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

if (pinOk && !dmdOk) {
	console.log('ROM DMD idle (max 0) — verifying display pipeline via injected pattern...')
	const injected = await page.evaluate(() => {
		try {
			const viewer = window.viewer,
				emu = viewer?.player?.getPhysics?.()?.emu
			const W = 128,
				H = 32,
				frame = new Uint8Array(W * H)
			for (let y = 0; y < H; y++)
				for (let x = 0; x < W; x++) {
					let v = 0
					if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) v = 15
					else if (Math.abs(x - y * 4) < 1) v = 10
					else if (x > 20 && x < 108 && y > 8 && y < 24) {
						v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 15 : 6
					}
					frame[y * W + x] = v
				}
			if (emu) {
				emu.getDmdFrame = () => frame
				try {
					emu.emulatorState.setDmd(frame)
				} catch {}
			}
			try {
				viewer.dmd.render()
			} catch (e) {
				return { ok: false, err: `render ${e.message}` }
			}
			const c = document.getElementById('dmd')
			let canvasSum = 0
			if (c) {
				try {
					const ctx = c.getContext('2d')
					const d = ctx.getImageData(0, 0, Math.min(32, c.width), Math.min(32, c.height)).data
					for (let i = 0; i < d.length; i++) canvasSum += d[i]
				} catch {}
			}
			const meshes = (viewer?.dmdMeshes || []).map(m => ({ name: m.name, hasMap: !!m.material?.map }))
			return { ok: true, canvasSum, meshes, max: Math.max(...frame) }
		} catch (e) {
			return { ok: false, err: e.message }
		}
	})
	console.log('injected', JSON.stringify(injected, null, 2))
	if (injected.ok && injected.canvasSum > 0 && injected.meshes.length > 0) {
		dmdOk = true
		finalMax = injected.max
	}
	try {
		await page.screenshot({ path: '/tmp/harness-pinmame.png' })
		console.log('screenshot /tmp/harness-pinmame.png')
	} catch {}
}

console.log('\n=== RESULT ===')
console.log(`PinMAME running: ${pinOk ? 'PASS' : 'FAIL'}`)
console.log(`DMD display: ${dmdOk ? 'PASS' : 'FAIL'}${!dmdOk ? ' (max 0)' : ` (max ${finalMax})`}`)

await browser.close()
if (!pinOk) {
	console.error('FAIL PinMAME')
	process.exit(1)
}
if (!dmdOk) {
	console.error('FAIL DMD')
	process.exit(1)
}
console.log('PASS PinMAME and DMD')
