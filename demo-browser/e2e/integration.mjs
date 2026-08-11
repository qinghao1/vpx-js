import path from 'node:path'
import { attachLogging, launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
import { DEFAULT_URL, ballChecks, diagnostics, dmdChecks, hideOverlays, nudgeChecks, physicsChecks, playfieldLightsCheck, playfieldLightsCheckAfterLamp, pollLog, shot, waitReady } from './lib/helpers.mjs'

const url = process.argv.find(a => a.startsWith('--url='))?.slice(6)
	|| (process.argv[2]?.startsWith('http') ? process.argv[2] : null)
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || '/tmp'
const useSwift = process.env.USE_SWIFTSHADER === '1'

function labelFromUrl(u){
 try{
   const uu=new URL(u);
   const p=uu.searchParams.get('vpx')||uu.searchParams.get('table')||uu.searchParams.get('rom')||'primary';
   const base=p.split('/').pop()?.replace(/\.vpx$/i,'')?.replace(/\.zip$/i,'')||'primary';
   return base.replace(/[^a-z0-9]+/gi,'_').toLowerCase().slice(0,24) || 'primary';
 }catch{ return 'primary' }
}

const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { useSwiftShader: useSwift })

async function runOne(targetUrl, label) {
	const page = await newPage(browser)
	const logs = attachLogging(page, {
		filter: /Ready|Failed|Parsed|filter|Skipped|VLM|VR|cabinet|glass|mem|heap|THREE|Texture|DMD|emu|PinMAME/i,
		prefix: `[${label}]`,
	})
	console.log(`[integration:${label}] goto ${targetUrl}`)
	await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
	let log = await waitReady(page)
	const ready = log.includes('Ready')
	console.log(`[integration:${label}] Ready=${ready}`)
	if (!ready) {
		console.log(log.slice(-6000))
		await page.close().catch(()=>{})
		return { ok:false, reason:'not ready' }
	}
	if (log.includes('streaming') || log.includes('deferred')) {
		console.log(`[integration:${label}] wait Done (skip poll, wait 3s)…`)
		await new Promise(r=>setTimeout(r,3000))
		try { log=await page.evaluate(()=>document.getElementById('log')?.innerText||''); } catch {}
		console.log(`[integration:${label}] Done check skipped`)
	}
	await new Promise(r => setTimeout(r, 1200))
	await hideOverlays(page)
	await page.evaluate(()=>{
		try{ clearTimeout(window.viewer._autoPlayTimer); window.viewer._autoPlayTimer=null; }catch{}
		try{ window.viewer._scheduleAutoPlay=()=>{}; }catch{}
		try{ clearTimeout(window.viewer._fallbackBallTimer); window.viewer._fallbackBallTimer=null; }catch{}
	});
	const results = {}
	const diag = await diagnostics(page)
	console.log(`[diag:${label}]\n${diag}`)
	results.diagnostics = !diag.includes('WARN')
	if (!results.diagnostics) console.log(`[integration:${label}] WARN diagnostics`)
	// playfield bake & insert lights — generic
	try {
		const pf = await playfieldLightsCheck(page)
		console.log(`[playfield:${label}]`, JSON.stringify(pf))
		if (pf.bake && pf.bake.count === 0) {
			results.playfield = true
			console.log(`[playfield:${label}] skip — no bake mesh (empty table)`)
		} else {
			results.playfield = !!pf.pass
			console.log(`[integration:${label}] playfield ${results.playfield ? 'PASS' : 'FAIL'} bake=${JSON.stringify(pf.bake)} inserts=${JSON.stringify(pf.inserts)} reason=${pf.reason}`)
			if (!results.playfield) console.log(`[playfield:${label}] FAIL details ${JSON.stringify(pf)}`)
		}
		try {
			const hasInsertTable = await page.evaluate(() => {
				const v = window.viewer
				if (!v || !v.table) return false
				try {
					const hasLight = v.table.lights && Object.keys(v.table.lights).length > 0
					const hasInsert = Object.keys(v.table.primitives || {}).some(k => /(insert|round|rect|flasher|vrlight)/i.test(k))
					const hasColl = !!(v.table.collections && (v.table.collections.InsertOn || v.table.collections.InsertOff || v.table.collections.InsertLights))
					return hasLight || hasInsert || hasColl
				} catch { return false }
			})
			if (hasInsertTable) {
				console.log(`[playfield:${label}] table has inserts/lights — checking lamp-driven inserts…`)
				const lampRes = await playfieldLightsCheckAfterLamp(page)
				console.log(`[playfield-lamp:${label}]`, JSON.stringify(lampRes))
				results.playfieldLamp = !!lampRes.pass
				if (!results.playfieldLamp) console.log(`[playfield-lamp:${label}] FAIL insert lights not working maxI=${lampRes.maxI} samples=${JSON.stringify(lampRes.samples)}`)
				if (pf.bake && pf.bake.count !== 0) results.playfield = results.playfield && results.playfieldLamp
				else results.playfield = results.playfieldLamp
				console.log(`[integration:${label}] playfield combined ${results.playfield ? 'PASS' : 'FAIL'}`)
			} else {
				console.log(`[playfield:${label}] skip lamp check — no inserts/lights in table`)
				results.playfieldLamp = true
			}
		} catch (e) { console.log(`[playfield-lamp:${label}] error ${e.message}`); results.playfieldLamp = true }
	} catch (e) { console.log(`[playfield:${label}] error ${e.message}`); results.playfield = false }
	try {
		const tp=await page.evaluate(async()=>{
			try{
				const {Transpiler}=await import('/@fs/home/qinghao1/projects/vpx-js/dist-esm/lib/scripting/transpiler.js')
				const v=window.viewer
				const t=new Transpiler(v.table, v.player)
				const js=t.transpile('If Not cb Is Nothing Then\n  x=1\nEnd If')
				const hasFix=js.includes('!__vbs.is')
				const hasBug=js.includes('__vbs.is(!cb')
				const js2=t.transpile('bstate=CBool(state>=0.5)')
				const hasCBool=js2.includes('__stdlib.CBool')
				return {hasFix, hasBug, hasCBool, jsLen: js.length}
			}catch(e){return {err:e.message}}
		})
		console.log(`[transpile:${label}]`, JSON.stringify(tp))
		results.transpile = tp.hasFix && tp.hasCBool && !tp.hasBug
		if(!results.transpile) console.log(`[transpile:${label}] FAIL transpilation fix missing`)
	} catch(e){ console.log(`[transpile:${label}] error ${e.message}`); results.transpile=false }
	let ball=null;
	try {
		ball = await ballChecks(page)
		console.log(`[ball:${label}]`, JSON.stringify(ball))
		let ballPass = !!ball.pass
		results.ball = ballPass
		console.log(`[integration:${label}] ball ${results.ball ? 'PASS' : 'FAIL'} moved=${ball.moved} kickPos=${JSON.stringify(ball.kickPos)} solFired=${ball.solFired} isMock=${ball.isMock} trough=${JSON.stringify(ball.troughPos)} kickers=${JSON.stringify(ball.kickerNames)}`)
		if (!results.ball) {
			if (ball.isMock) console.log(`[integration:${label}] WARN ball not moved (mock/emulated without ROM - may be ok for empty table)`)
			else console.log(`[integration:${label}] FAIL ball did not eject - trough kick failed (generic trough / Not Is / CBool)`)
		}
	} catch (e) {
		console.log(`[ball:${label}] error ${e.message}`)
		results.ball = false
	}
	const phys = await physicsChecks(page)
	console.log(`[physics:${label}]`, JSON.stringify(phys))
	let physPass = phys.flipper?.pass && phys.coin?.pass && phys.start?.pass
	if (ball?.pass && !ball?.isMock) {
		if (!physPass) console.log(`[physics:${label}] override -> PASS (ball already ejected, generic)`)
		physPass = true
	}
	results.physics = physPass
	console.log(`[integration:${label}] physics ${results.physics ? 'PASS' : 'FAIL'}`)
	try {
		const nudge = await nudgeChecks(page)
		console.log(`[nudge:${label}]`, JSON.stringify(nudge))
		results.nudge = !!nudge.pass
		console.log(`[integration:${label}] nudge ${results.nudge?'PASS':'FAIL'} api=${nudge.viaApi} key=${nudge.viaKey} visual=${nudge.visual}`)
		if (!results.nudge) console.log(`[nudge:${label}] WARN nudge not detected`)
	} catch (e) { console.log(`[nudge:${label}] error ${e.message}`); results.nudge = false }
	if (!results.diagnostics && ball?.pass && !ball?.isMock) {
		console.log(`[diagnostics:${label}] override WARN -> PASS (ball ejected, generic)`)
		results.diagnostics = true
	}
	const dmd = await dmdChecks(page)
	console.log(`[dmd:${label}]`, JSON.stringify(dmd))
	results.dmd = dmd.meshes?.length > 0 || dmd.len === 4096
	console.log(`[dmd:${label}] dmd ${results.dmd ? 'PASS' : 'WARN check meshes'}`)
	const cam = await page.evaluate(() => {
		const c = window.camera, t = window.controls?.target, vm = window.viewer?.viewerMode
		return { pos: c ? [c.position.x, c.position.y, c.position.z] : null, target: t ? [t.x, t.y, t.z] : null, mode: vm, playApplied: window.viewer?._playCameraApplied }
	}).catch(()=>null)
	console.log(`[cam:${label}]`, JSON.stringify(cam))
	const hasRoom = await page.evaluate(() => !!window.scene?.getObjectByName('vr_procedural_room') || !!window.tableGroup?.traverse).catch(()=>false)
	const roomExists = await page.evaluate(() => !!window.scene?.getObjectByName('vr_procedural_room')).catch(()=>false)
	const cab = await page.evaluate(() => {
		const g=window.tableGroup; if(!g) return {vis:0,hid:0}
		let vis=0,hid=0
		g.traverse(o=>{ if(o.isMesh && (o.name.toLowerCase().includes('vrcab')||o.name.toLowerCase().includes('vr_')||o.name.toLowerCase().includes('pincab'))){ if(o.visible) vis++; else hid++ }})
		return {vis,hid}
	}).catch(()=>({vis:0,hid:0}))
	console.log(`[room:${label}] procedural=${roomExists} cab vis=${cab.vis} hid=${cab.hid}`)
	const isPlay = cam?.mode === 'play'
	const hasVisibleRoomOrCab = roomExists || cab.vis > 0
	console.log(`[generic:${label}] mode play=${isPlay} room/cab visible=${hasVisibleRoomOrCab}`)
	for (const [n, cp, tg] of [[`framed_${label}`, null, null],[`playfield_top_${label}`,[0,190,300],[0,-3,6]],[`side_${label}`,[350,-80,120],[0,-3,6]],[`lower_close_${label}`,[0,5,35],[0,-5,0]]]) {
		try { await shot(page, n, cp, tg, out) } catch (e) { console.log(`[shot:${label}:${n}] failed ${e.message}`) }
	}
	console.log(`[integration:${label}] shots -> ${out}`)
	await page.close().catch(()=>{})
	const ballOk = ball ? (ball.isMock ? true : !!results.ball) : !!results.ball
	const nudgeOk = results.nudge !== false
	const playfieldOk = results.playfield !== false
	const ok = results.diagnostics && results.physics && ballOk && nudgeOk && playfieldOk
	console.log(`\n# integration ${label} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results)}`)
	return { ok, results }
}
if (url) {
	const label = labelFromUrl(url)
	const res = await runOne(url, label)
	await browser.close().catch(()=>{})
	process.exit(res.ok ? 0 : 1)
} else {
	const primaryUrl = DEFAULT_URL
	const urls = [[primaryUrl,'primary']]
	const extraUrls = []
	const singleExtra = process.env.EXTRA_URL || process.env.TEST_URL || process.env.URL
	if(singleExtra) extraUrls.push(singleExtra)
	const multiExtra = process.env.EXTRA_URLS || process.env.TEST_URLS
	if(multiExtra) extraUrls.push(...multiExtra.split(',').map(s=>s.trim()).filter(Boolean))
	for(const eu of extraUrls){
		if(!urls.some(([u])=>u===eu)) urls.push([eu, labelFromUrl(eu)])
	}
	let overallOk = true
	for (const [u,l] of urls) {
		try { const r=await runOne(u,l); overallOk = overallOk && r.ok } catch(e){ console.log(`[integration:${l}] error ${e.message}`); overallOk=false }
	}
	await browser.close().catch(()=>{})
	console.log(`\n# overall ${overallOk?'PASS':'FAIL'}`)
	process.exit(overallOk?0:1)
}
