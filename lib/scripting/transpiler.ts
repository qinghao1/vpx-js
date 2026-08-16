import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { vbsCacheKey } from '../util/idb-cache.js'
import { Enums, type EnumsApi } from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
import type { Table } from '../vpt/table/table.js'
import { Grammar } from './grammar/grammar.js'
import { Stdlib } from './stdlib/index.js'
import { AmbiguityTransformer } from './transformer/ambiguity-transformer.js'
import { ClassTransformer } from './transformer/class-transformer.js'
import { ErrorTransformer } from './transformer/error-transformer.js'
import { EventTransformer } from './transformer/event-transformer.js'
import { FunctionHoistTransformer } from './transformer/function-hoist-transformer.js'
import { ReferenceTransformer } from './transformer/reference-transformer.js'
import { ScopeTransformer } from './transformer/scope-transformer.js'
import { WrapTransformer } from './transformer/wrap-transformer.js'
import { VBSHelper } from './vbs-helper.js'
import { VbsProxyHandler } from './vbs-proxy-handler.js'

const syncMemCache = new Map<string, string>()

function hashStr(s: string): string {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
	return (h >>> 0).toString(36)
}
function tableHashForTranspiler(table: Table): string {
	try {
		const els = Object.keys(table.getElements?.() ?? {})
			.sort()
			.join(',')
		return hashStr(els)
	} catch {
		return 'notable'
	}
}

declare function play(
	scope: unknown,
	table: Record<string, unknown>,
	enums: EnumsApi,
	globalApi: GlobalApi,
	stdlib: Stdlib,
	vbsHelper: VBSHelper,
	player: Player,
): void

function normalizeNewCall(vbs: string): string {
	let out = vbs.replace(/Set\s+(\w+)\s*=\s*\(\s*New\s+(\w+)\s*\)\s*\(([^)]*)\)/gi, (_, v, c, a) => {
		const args = (a as string).trim()
		return args ? `Set ${v} = New ${c}\n${v}.init ${args}` : `Set ${v} = New ${c}`
	})
	out = out.replace(/\(\s*New\s+(\w+)\s*\)\s*\(/gi, '(New $1).init(')
	out = out.replace(/\.Option\b/gi, '._Option')
	out = out.replace(/(?<!\.)\bswitch\b/gi, 'aSwitch')
	return out
}

function tryLoadPrecompiledSync(key: string): string | null {
	try {
		if (typeof process === 'undefined' || !(process as any).versions?.node) return null
		let fs: any = null
		let path: any = null
		try {
			const gbm: any = (process as any).getBuiltinModule
			if (typeof gbm === 'function') {
				fs = gbm('node:fs')
				path = gbm('node:path')
			}
		} catch {}
		if (!fs || !path) {
			try {
				const req: any = (Function('try{return require}catch(e){return null}') as any)()
				if (req) {
					fs = req('node:fs')
					path = req('node:path')
				}
			} catch {}
		}
		if (!fs || !path) return null
		for (const base of ['dist/precompiled', 'dist-esm/precompiled']) {
			try {
				const file = path.join(process.cwd(), base, `${key}.js`)
				if (fs.existsSync(file)) {
					const js = fs.readFileSync(file, 'utf-8')
					if (js && js.length > 500) return js
				}
			} catch {}
		}
		try {
			let fileURLToPath: any = null
			try {
				const gbm: any = (process as any).getBuiltinModule
				if (typeof gbm === 'function') fileURLToPath = gbm('node:url')?.fileURLToPath
			} catch {}
			if (!fileURLToPath) {
				try {
					const req: any = (Function('try{return require}catch(e){return null}') as any)()
					if (req) fileURLToPath = req('node:url')?.fileURLToPath
				} catch {}
			}
			if (fileURLToPath) {
				const thisDir = path.dirname(fileURLToPath(import.meta.url))
				for (const base of ['../../dist/precompiled', '../../dist-esm/precompiled', './precompiled']) {
					try {
						const file = path.join(thisDir, base, `${key}.js`)
						if (fs.existsSync(file)) {
							const js = fs.readFileSync(file, 'utf-8')
							if (js && js.length > 500) return js
						}
					} catch {}
				}
			}
		} catch {}
	} catch {}
	return null
}

export class Transpiler {
	private readonly itemApis: Record<string, unknown>
	private readonly enumApis: EnumsApi = Enums
	private readonly globalApi: GlobalApi
	private readonly stdlib = new Stdlib()
	private readonly grammar = new Grammar()

	constructor(
		private readonly table: Table,
		private readonly player: Player,
		private readonly gate: AnimationGate = player.gate ?? animationGate,
	) {
		this.itemApis = table.getElementApis()
		this.globalApi = new GlobalApi(table, player)
	}

	private pipeline(gf?: string, go?: string): Array<(ast: Program) => Program> {
		return [
			a => new FunctionHoistTransformer(a).transform(),
			a => new EventTransformer(a, this.table.getElements()).transform(),
			a => new ErrorTransformer(a).transform(),
			a =>
				new ReferenceTransformer(
					a,
					this.table,
					this.itemApis,
					this.enumApis,
					this.globalApi,
					this.stdlib,
				).transform(),
			a => new ScopeTransformer(a).transform(),
			a => new ClassTransformer(a).transformThisIdentifiers(),
			a => new AmbiguityTransformer(a, this.itemApis, this.enumApis, this.globalApi, this.stdlib).transform(),
			a => new ClassTransformer(a).transform(),
			a => new WrapTransformer(a).transform(gf, go),
		]
	}

	private parseAndTransform(vbs: string, gf?: string, go?: string): { ast: Program; t0: number } {
		const src = normalizeNewCall(vbs)
		const t0 = Date.now()
		let ast = this.grammar.transpile(src)
		ast = this.pipeline(gf, go).reduce((a, fn) => fn(a), ast)
		return { ast, t0 }
	}

	private gen(ast: Program, t0: number): string {
		return generate(ast)
	}

	private evalAndPlay(js: string, scope: Record<string, unknown>): void {
		eval(`//@ sourceURL=game:///tablescript.vbs.js\n${js}`)
		const playFn = (globalThis as any).play ?? (typeof play === 'function' ? play : undefined)
		if (typeof playFn === 'function') {
			playFn(
				new Proxy(scope, new VbsProxyHandler()),
				this.itemApis,
				this.enumApis,
				this.globalApi,
				this.stdlib,
				new VBSHelper(this),
				this.player,
			)
		}
	}

	public transpile(vbs: string, gf?: string, go?: string): string {
		try {
			const key = `${vbsCacheKey(vbs)}:${tableHashForTranspiler(this.table)}:${gf ?? ''}:${go ?? ''}`
			const hit = syncMemCache.get(key)
			if (hit) return hit
			const pre = tryLoadPrecompiledSync(key)
			if (pre) {
				syncMemCache.set(key, pre)
				return pre
			}
			const { ast, t0 } = this.parseAndTransform(vbs, gf, go)
			const js = this.gen(ast, t0)
			syncMemCache.set(key, js)
			return js
		} catch {
			const { ast, t0 } = this.parseAndTransform(vbs, gf, go)
			return this.gen(ast, t0)
		}
	}

	public async transpileAsync(vbs: string, gf?: string, go?: string): Promise<string> {
		const { transpileWithWorker, getTableDataForWorker } = await import('./transpiler-worker-pool.js')
		const td = getTableDataForWorker(this.table, this.player)
		return transpileWithWorker(vbs, gf, go, td)
	}

	public execute(vbs: string, scope: Record<string, unknown>, go?: string): void {
		go ||= 'globalThis'
		this.evalAndPlay(this.transpile(vbs, 'play', go), scope)
	}

	public async executeAsync(vbs: string, scope: Record<string, unknown>, go?: string): Promise<void> {
		go ||= 'globalThis'
		this.evalAndPlay(await this.transpileAsync(vbs, 'play', go), scope)
	}
}
