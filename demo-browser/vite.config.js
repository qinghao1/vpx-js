import fs from 'node:fs'
import path, { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname)
const parentRoot = resolve(__dirname, '..')
const home = process.env.HOME || '/home/qinghao1'

function rawLoader() {
	return {
		name: 'raw-loader',
		enforce: 'pre',
		resolveId(source, importer) {
			const clean = source.split('?')[0].split('#')[0]
			if (!(clean.endsWith('.vbs') || clean.endsWith('.bnf'))) return null
			const tryPaths = []
			if (clean.startsWith('.') && importer) {
				try {
					let base = importer.split('?')[0].split('#')[0]
					if (base.startsWith('/@fs')) base = base.slice(4)
					tryPaths.push(resolve(dirname(base), clean))
				} catch {}
			}
			try {
				const p = clean.startsWith('/@fs') ? clean.slice(4) : clean
				if (path.isAbsolute(p)) tryPaths.push(p)
			} catch {}
			if (clean.includes('res/scripts') || clean.includes('grammar')) {
				const baseName = path.basename(clean)
				if (clean.endsWith('.vbs')) tryPaths.push(resolve(parentRoot, 'res/scripts', baseName))
				if (clean.endsWith('.bnf')) tryPaths.push(resolve(parentRoot, 'lib/scripting/grammar', baseName))
				tryPaths.push(resolve(parentRoot, clean.replace(/^(\.\.\/)+/, '')))
			}
			for (const p of tryPaths) {
				try {
					if (fs.existsSync(p)) return p
				} catch {}
			}
			return null
		},
		load(id) {
			const clean = id.split('?')[0].split('#')[0]
			if (clean.endsWith('.vbs') || clean.endsWith('.bnf')) {
				try {
					let p = clean
					if (p.startsWith('/@fs')) p = p.slice(4)
					return `export default ${JSON.stringify(fs.readFileSync(p, 'utf-8'))};`
				} catch {}
			}
		},
	}
}

export default defineConfig({
	base: process.env.NODE_ENV === 'production' ? './' : '/',
	resolve: {
		dedupe: ['three', 'three-mesh-bvh'],
		alias: [
			{ find: 'buffer', replacement: resolve(__dirname, 'node_modules/buffer/index.js') },
			{ find: 'three-mesh-bvh', replacement: resolve(__dirname, 'node_modules/three-mesh-bvh/src/index.js') },
			{ find: 'node:buffer', replacement: resolve(__dirname, 'node_modules/buffer/index.js') },
			...['util', 'path', 'url', 'zlib', 'events', 'module', 'assert'].flatMap(id => [
				{ find: id, replacement: resolve(__dirname, `shims/${id}.js`) },
				{ find: `node:${id}`, replacement: resolve(__dirname, `shims/${id}.js`) },
			]),
			// fs/promises must precede fs — vite #4037 alias would otherwise match 'fs/promises' as 'fs.js/promises'
			{ find: 'fs/promises', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'node:fs/promises', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: /^fs\/promises$/, replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: /^node:fs\/promises$/, replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'fs', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'node:fs', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'stream', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'node:stream', replacement: resolve(__dirname, 'shims/fs.js') },
			{ find: 'process', replacement: resolve(__dirname, 'shims/process.js') },
			{ find: 'node:process', replacement: resolve(__dirname, 'shims/process.js') },
			{ find: 'wpc-emu', replacement: resolve(__dirname, 'shims/wpc-emu.js') },
			{ find: 'microtime', replacement: resolve(__dirname, 'shims/microtime.js') },
			{ find: 'sharp', replacement: resolve(__dirname, 'shims/sharp.js') },
			{ find: 'gltf-pipeline', replacement: resolve(__dirname, 'shims/gltf-pipeline.js') },
			{ find: 'pngquant', replacement: resolve(__dirname, 'shims/pngquant.js') },
			{ find: 'refs.node.js', replacement: resolve(parentRoot, 'dist-esm/lib/refs.browser.js') },
			{ find: '../../refs.node.js', replacement: resolve(parentRoot, 'dist-esm/lib/refs.browser.js') },
			{ find: '../refs.node.js', replacement: resolve(parentRoot, 'dist-esm/lib/refs.browser.js') },
			{ find: '../../../refs.node.js', replacement: resolve(parentRoot, 'dist-esm/lib/refs.browser.js') },
			{ find: /^.*refs\.node\.js(\?.*)?$/, replacement: resolve(parentRoot, 'dist-esm/lib/refs.browser.js') },
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
			allow: [
				root,
				parentRoot,
				resolve(parentRoot, 'dist'),
				resolve(parentRoot, 'dist-esm'),
				resolve(parentRoot, 'wasm/dist'),
				resolve(parentRoot, 'wasm/kernels/dist'),
				resolve(parentRoot, 'test/fixtures'),
				resolve(home, 'Downloads'),
				resolve(home, '.pinmame/roms'),
			],
			strict: false,
		},
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Resource-Policy': 'cross-origin',
		},
	},
	plugins: [
		rawLoader(),
		{
			name: 'static-fs',
			configureServer(server) {
				const send = (res, req, file, type) => {
					res.setHeader('Content-Type', type)
					res.setHeader('Content-Length', String(fs.statSync(file).size))
					res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
					res.setHeader('Access-Control-Allow-Origin', '*')
					if (req.method === 'HEAD') { res.end(); return true }
					fs.createReadStream(file).pipe(res)
					return true
				}
				server.middlewares.use((req, res, next) => {
					const url = req.url?.split('?')[0].split('#')[0] ?? ''
					if (url.startsWith('/wasm/')) {
						const rel = url.slice('/wasm/'.length)
						const tries = [
							resolve(parentRoot, `wasm/${rel}`),
							resolve(parentRoot, `wasm/kernels/dist/${rel}`),
							resolve(parentRoot, `wasm/dist/${rel}`),
							resolve(parentRoot, `wasm/mock/${rel}`),
						]
						if (rel === 'kernels.js' || rel === 'kernels.wasm') tries.unshift(resolve(parentRoot, `wasm/kernels/dist/${rel}`))
						for (const f of tries) if (fs.existsSync(f)) {
							try {
								const ext = path.extname(f).toLowerCase()
								const ct = ext === '.wasm' ? 'application/wasm' : ext === '.js' ? 'application/javascript' : 'application/octet-stream'
								res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
								res.setHeader('Cache-Control', 'no-cache')
								if (send(res, req, f, ct)) return
							} catch {}
						}
					}
					if (url.startsWith('/test/fixtures/') && url.endsWith('.vpx')) {
						req.url = '/@fs' + resolve(parentRoot, url.slice(1))
						return next()
					}
					if (url.endsWith('.zip') && (url.includes('/roms/') || url.includes('/pinmame/'))) {
						const base = path.basename(url)
						for (const c of [resolve(__dirname, 'public', url.slice(1)), resolve(__dirname, `public/pinmame/roms/${base}`), resolve(__dirname, `public/roms/${base}`)]) {
							if (fs.existsSync(c)) { try { if (send(res, req, c, 'application/zip')) return } catch {} }
						}
					}
					next()
				})
			},
		},
	],
	optimizeDeps: {
		include: ['three', 'three-mesh-bvh'],
		exclude: ['wpc-emu', 'microtime', 'sharp', 'gltf-pipeline', 'pngquant', 'gm'],
	},
	worker: { format: 'es' },
	build: {
		target: 'esnext',
		rollupOptions: {
			input: { main: 'index.html' },
		},
		assetsInlineLimit: 0,
	},
})
