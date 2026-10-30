// Worker texture upload caps — e2e guard for the WebGPU maxBufferSize crash.
//
// An uncapped 8K half-float frame is 512MB in a single writeTexture, over the
// 256MB WebGPU maxBufferSize on many adapters (Dawn_DynamicUploaderStaging
// validation error, black canvas). The worker loader must downsample every
// path (bitmap, float/HDR, raw) to the effective caps before upload.
// Run: node test/harness/verify-worker-texture-caps.mjs
// Exit: 0 pass (TAP ok lines), 1 fail.

import { waitReady } from '../../demo-browser/e2e/helpers.mjs'
import { ensureVite, launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

/** Minimal flat-color Radiance HDR with RLE scanlines (three HDRLoader parses RLE). */
function makeRleHdr(width, height, rgbe = [128, 128, 128, 128]) {
	const head = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y ${height} +X ${width}\n`
	const enc = new TextEncoder().encode(head)
	const out = []
	const pushRun = (value, count) => {
		let left = count
		while (left > 0) {
			const n = Math.min(left, 127)
			out.push(128 + n, value)
			left -= n
		}
	}
	for (let y = 0; y < height; y++) {
		out.push(0x02, 0x02, (width >> 8) & 0xff, width & 0xff)
		for (let c = 0; c < 4; c++) pushRun(rgbe[c], width)
	}
	const blob = new Uint8Array(enc.length + out.length)
	blob.set(enc, 0)
	blob.set(out, enc.length)
	return blob
}

const results = []
const check = (name, cond, detail = '') => {
	results.push({ name, ok: !!cond, detail })
	console.log(`${cond ? 'ok' : 'not ok'} - ${name}${detail ? ` (${detail})` : ''}`)
}

await ensureVite('https://localhost:3000/', { label: 'verify-worker-texture-caps' })
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { autoKillMs: 180_000 })
const pageerrors = []
try {
	const page = await newPage(browser)
	page.on('pageerror', e => pageerrors.push(String(e?.message ?? e).slice(0, 200)))
	// Low quality tiers force small caps (other=512, playfield=2048) so modest
	// fixtures exercise the downsample path.
	await page.goto(
		'https://localhost:3000/?vpx=/test/fixtures/table-flipper.vpx&mode=play&worker=render&quality=low',
		{
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		},
	)
	await waitReady(page, 240_000)
	await page.waitForFunction(() => !!window.viewer?._workerBridge, { timeout: 240_000 })
	check('worker bridge attached', true)
	const out = await page.evaluate(
		async hdrBytes => {
			const m = await import('/@fs/home/qinghao1/projects/vpx-js/lib/render/worker/worker-textures.ts')
			const loader = new m.ThreeTextureLoaderWorker()
			// three r185 type ids: FloatType 1015 = 16B/px, HalfFloatType 1016 = 8B/px, else 4.
			const bpp = t => (t?.type === 1015 ? 16 : t?.type === 1016 ? 8 : 4)
			const r = {}
			// 1. Oversized raw RGBA must downsample to the name cap.
			const raw = new Uint8Array(1024 * 1024 * 4).fill(200)
			const t1 = await loader.loadRawTexture('test_other', raw, 1024, 1024)
			r.raw = [t1.image.width, t1.image.height]
			// 2. Oversized float decode must downsample (the 512MB WriteTexture case).
			const t2 = await loader.loadTexture('test_other.hdr', '.hdr', new Uint8Array(hdrBytes))
			r.float = [t2.image.width, t2.image.height, bpp(t2)]
			// 3. Playfield-named raw uses the playfield cap.
			const big = new Uint8Array(2600 * 2600 * 4).fill(200)
			const t3 = await loader.loadRawTexture('test_playfield', big, 2600, 2600)
			r.playfield = [t3.image.width, t3.image.height]
			return r
		},
		[...makeRleHdr(1024, 16)],
	)
	check('raw capped to other cap', out.raw[0] === 512 && out.raw[1] === 512, `${out.raw}`)
	check(
		'float capped, upload under 256MiB',
		out.float[0] === 512 && out.float[1] <= 16 && out.float[0] * out.float[1] * out.float[2] <= 256 * 1024 * 1024,
		`${out.float}`,
	)
	check(
		'playfield raw capped to playfield cap',
		out.playfield[0] === 2048 && out.playfield[1] < 2600,
		`${out.playfield}`,
	)
	check('no pageerrors', pageerrors.length === 0, pageerrors.slice(0, 2).join(' | '))
} catch (e) {
	check('harness completed', false, String(e).slice(0, 200))
} finally {
	try {
		await browser.close()
	} catch {}
}
const failed = results.filter(r => !r.ok).length
console.log(failed === 0 ? 'TEXTURE CAPS PASS' : `TEXTURE CAPS FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
