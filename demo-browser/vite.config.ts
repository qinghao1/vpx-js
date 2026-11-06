// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import fs from 'node:fs'
import os from 'node:os'
import path, { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname)
const repoRoot = resolve(__dirname, '..')
const home = os.homedir()

const define = {
	'process.env': '(globalThis.process?.env ?? {})',
	process: '(globalThis.process ?? {env:{},browser:true,platform:"browser"})',
	global: 'globalThis',
}

// SharedArrayBuffer (the pthread engine) needs a cross-origin-isolated page.
const crossOriginIsolated = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Resource-Policy': 'cross-origin',
}

export default defineConfig({
	define,
	optimizeDeps: {
		include: ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh'],
	},
	root,
	base: './',
	resolve: {
		dedupe: ['three', 'three/webgpu', 'three/tsl', 'three-mesh-bvh'],
		alias: [
			{ find: 'node:buffer', replacement: resolve(__dirname, 'node_modules/buffer/index.js') },
			{ find: 'buffer', replacement: resolve(__dirname, 'node_modules/buffer/index.js') },
			{ find: 'three-mesh-bvh', replacement: resolve(__dirname, 'node_modules/three-mesh-bvh/src/index.js') },
			{ find: /^.*refs\.node\.js(\?.*)?$/, replacement: resolve(repoRoot, 'dist-esm/lib/refs.browser.js') },
			{
				find: /^.*binary-reader\.node\.js(\?.*)?$/,
				replacement: resolve(repoRoot, 'dist-esm/lib/io/binary-reader.js'),
			},
			{
				find: /^.*three-texture-loader-node\.js(\?.*)?$/,
				replacement: resolve(repoRoot, 'dist-esm/lib/render/threejs/three-texture-loader-browser.js'),
			},
		],
	},
	assetsInclude: ['**/*.vpx', '**/*.wasm', '**/*.zip'],
	publicDir: resolve(__dirname, 'public'),
	server: {
		hmr: { overlay: false },
		port: 3000,
		host: true,
		watch: { ignored: ['**/dist/**', '**/dist-esm/**', '**/node_modules/**', '**/.git/**'] },
		fs: {
			allow: [repoRoot, resolve(home, 'Downloads'), resolve(home, '.pinmame/roms')],
			strict: false,
		},
		headers: crossOriginIsolated,
	},
	preview: { headers: crossOriginIsolated },
	plugins: [
		basicSsl(),
		{
			// Static hosts without COOP/COEP (GitHub Pages) opt in to the
			// header-adding service worker; other builds never ship it.
			name: 'coi-service-worker',
			apply: 'build',
			generateBundle() {
				if (process.env.VITE_COI_SW)
					this.emitFile({
						type: 'asset',
						fileName: 'coi-sw.js',
						source: fs.readFileSync(resolve(__dirname, 'coi-sw.js')),
					})
			},
		},
		{
			name: 'static-fs',
			configureServer(server) {
				const send = (res: any, req: any, file: string, type: string) => {
					res.setHeader('Content-Type', type)
					res.setHeader('Content-Length', String(fs.statSync(file).size))
					res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
					res.setHeader('Access-Control-Allow-Origin', '*')
					if (req.method === 'HEAD') {
						res.end()
						return true
					}
					fs.createReadStream(file).pipe(res)
					return true
				}
				server.middlewares.use((req: any, res: any, next: any) => {
					const url = req.url?.split('?')[0].split('#')[0] ?? ''
					// The engine glue is import()ed at runtime, which vite refuses for
					// /public files; serve the artifact raw (no transform, no cache).
					// COEP too: the glue is also each pthread worker's script, and a
					// worker of an isolated page will not start without it.
					if (url.startsWith('/wasm/')) {
						const file = resolve(__dirname, 'public', url.slice(1))
						if (fs.existsSync(file)) {
							const type = { '.wasm': 'application/wasm', '.js': 'text/javascript' }[path.extname(file)]
							for (const [name, value] of Object.entries(crossOriginIsolated)) res.setHeader(name, value)
							res.setHeader('Cache-Control', 'no-cache')
							if (send(res, req, file, type ?? 'application/octet-stream')) return
						}
					}
					if (url.startsWith('/test/fixtures/') && url.endsWith('.vpx')) {
						req.url = '/@fs' + resolve(repoRoot, url.slice(1))
						return next()
					}
					if (url.endsWith('.zip') && (url.includes('/roms/') || url.includes('/pinmame/'))) {
						const base = path.basename(url)
						const homeCandidates = [
							resolve(home, 'Downloads', base),
							resolve(home, '.pinmame/roms', base),
							resolve(home, 'pinmame/roms', base),
						]
						for (const c of [
							resolve(__dirname, 'public', url.slice(1)),
							resolve(__dirname, `public/pinmame/roms/${base}`),
							resolve(__dirname, `public/roms/${base}`),
							...homeCandidates,
						]) {
							if (fs.existsSync(c))
								try {
									if (send(res, req, c, 'application/zip')) return
								} catch {}
						}
						for (const c of homeCandidates) {
							const lower = c.toLowerCase()
							if (lower !== c && fs.existsSync(lower))
								try {
									if (send(res, req, lower, 'application/zip')) return
								} catch {}
						}
					}
					next()
				})
			},
		},
	],
	worker: { format: 'es' },
	build: { target: 'esnext', assetsInlineLimit: 0 },
})
