import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { idbSet } from '../util/idb-cache.js'
import { Enums, type EnumsApi } from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
import type { Table } from '../vpt/table/table.js'
import { Grammar } from './grammar/grammar.js'
import { Stdlib } from './stdlib/index.js'
import { buildPipeline, normalizeNewCall } from './transpiler-pipeline.js'
import {
	boundedSet,
	cacheKey,
	getTableDataForWorker,
	getVbsMemCache,
	setVbsMemCache,
} from './transpiler-worker-pool.js'
import { VBSHelper } from './vbs-helper.js'
import { VbsProxyHandler } from './vbs-proxy-handler.js'

export { normalizeNewCall }

type PlayFn = (
	scope: unknown,
	table: Record<string, unknown>,
	enums: EnumsApi,
	globalApi: GlobalApi,
	stdlib: Stdlib,
	vbsHelper: VBSHelper,
	player: Player,
) => void

/** Bound on cached V8-compiled table scripts (each holds one function). */
const MAX_COMPILED_CACHE_ENTRIES = 20
const compiledCache = new Map<string, PlayFn>()

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

	private parseAndTransform(vbs: string, gf?: string, go?: string): Program {
		const src = normalizeNewCall(vbs)
		const ast = this.grammar.transpile(src)
		const pipeline = buildPipeline({
			table: this.table,
			elements: this.table.getElements(),
			itemApis: this.itemApis,
			enumApis: this.enumApis,
			globalApi: this.globalApi,
			stdlib: this.stdlib,
			globalFunction: gf,
			globalObject: go,
		})
		return pipeline.reduce((a, fn) => fn(a), ast)
	}

	private evalAndPlay(js: string, scope: Record<string, unknown>, cacheKeyFor?: string): void {
		// eval() returns the completion value, which for the wrapped
		// `...play = (...) => {...}` assignment is the play function itself.
		// Reading it back instead of the global namespace avoids running a
		// stale globalThis.play, and throwing here turns a codegen regression
		// into a loud failure instead of an execute() that runs nothing.
		// Repeat executes reuse the compiled function (JS cache skips the transpile, this skips the recompile).
		let playFn: PlayFn | undefined
		if (cacheKeyFor !== undefined) playFn = compiledCache.get(cacheKeyFor)
		if (playFn === undefined) {
			const compiled = eval(`//@ sourceURL=game:///tablescript.vbs.js\n${js}`) as PlayFn
			if (typeof compiled !== 'function') {
				throw new Error('Transpiled table script did not evaluate to a play function.')
			}
			playFn = compiled
			if (cacheKeyFor !== undefined) boundedSet(compiledCache, cacheKeyFor, compiled, MAX_COMPILED_CACHE_ENTRIES)
		}
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

	public transpile(vbs: string, gf?: string, go?: string): string {
		// Share the worker path's mem key (parity in transpiler-worker.spec); write through to IDB, reads stay async-only.
		const key = cacheKey(vbs, gf, go, getTableDataForWorker(this.table, this.player))
		const cached = getVbsMemCache(key)
		if (cached !== undefined) {
			return cached
		}
		const js = generate(this.parseAndTransform(vbs, gf, go))
		setVbsMemCache(key, js)
		void idbSet(key, js)
		return js
	}

	public async transpileAsync(vbs: string, gf?: string, go?: string): Promise<string> {
		const { transpileWithWorker, getTableDataForWorker } = await import('./transpiler-worker-pool.js')
		const td = getTableDataForWorker(this.table, this.player)
		return transpileWithWorker(vbs, gf, go, td)
	}

	public execute(vbs: string, scope: Record<string, unknown>, go?: string): void {
		go ||= 'globalThis'
		this.evalAndPlay(
			this.transpile(vbs, 'play', go),
			scope,
			cacheKey(vbs, 'play', go, getTableDataForWorker(this.table, this.player)),
		)
	}

	public async executeAsync(vbs: string, scope: Record<string, unknown>, go?: string): Promise<void> {
		go ||= 'globalThis'
		this.evalAndPlay(
			await this.transpileAsync(vbs, 'play', go),
			scope,
			cacheKey(vbs, 'play', go, getTableDataForWorker(this.table, this.player)),
		)
	}
}
