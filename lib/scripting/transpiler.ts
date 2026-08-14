// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { logger, progress } from '../util/logger.js'
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

const workerCache: Promise<string> | null = null

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

	private pipeline(globalFunction?: string, globalObject?: string): Array<(ast: Program) => Program> {
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
			a => new WrapTransformer(a).transform(globalFunction, globalObject),
		]
	}

	private parseAndTransform(vbs: string, gf?: string, go?: string): { ast: Program; t0: number; t1: number } {
		const src = normalizeNewCall(vbs)
		const t0 = Date.now()
		let ast = this.grammar.transpile(src)
		logger().debug('[Transpiler] Parsed in %sms', Date.now() - t0)
		const t1 = Date.now()
		ast = this.pipeline(gf, go).reduce((a, fn) => fn(a), ast)
		logger().debug('[Transpiler] Transformed in %sms', Date.now() - t1)
		return { ast, t0, t1 }
	}

	private gen(ast: Program, t0: number): string {
		const t2 = Date.now()
		const js = generate(ast)
		logger().debug('[Transpiler] Generated in %sms (total %sms)', Date.now() - t2, Date.now() - t0)
		logger().debug(js)
		return js
	}

	private evalAndPlay(js: string, scope: Record<string, unknown>): void {
		let t = Date.now()
		progress().details('evaluating')
		eval(`//@ sourceURL=game:///tablescript.vbs.js\n${js}`)
		logger().debug('[Transpiler] Evaluated in %sms', Date.now() - t)
		progress().details('executing')
		t = Date.now()
		play(
			new Proxy(scope, new VbsProxyHandler()),
			this.itemApis,
			this.enumApis,
			this.globalApi,
			this.stdlib,
			new VBSHelper(this),
			this.player,
		)
		logger().debug('[Transpiler] Executed in %sms', Date.now() - t)
	}

	public transpile(vbs: string, globalFunction?: string, globalObject?: string): string {
		const { ast, t0 } = this.parseAndTransform(vbs, globalFunction, globalObject)
		return this.gen(ast, t0)
	}

	public async transpileAsync(vbs: string, globalFunction?: string, globalObject?: string): Promise<string> {
		if (vbs.length > 2000 && typeof window !== 'undefined' && typeof Worker !== 'undefined') {
			try {
				const { transpileWithWorker, getTableDataForWorker } = await import('./transpiler-worker-pool.js')
				const tableData = getTableDataForWorker(this.table, this.player)
				const t0 = Date.now()
				const js = await transpileWithWorker(vbs, globalFunction, globalObject, tableData)
				logger().debug('[Transpiler] Worker transpiled in %sms', Date.now() - t0)
				if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
					import('../util/idb-cache.js')
						.then(({ vbsCacheKey, idbSet }) => {
							try {
								idbSet(vbsCacheKey(vbs), js).catch(() => {})
							} catch {}
						})
						.catch(() => {})
				}
				return js
			} catch (e) {
				logger().debug('[Transpiler] Worker failed, fallback %s', (e as Error).message)
			}
		}
		const src = normalizeNewCall(vbs)
		await this.gate.yieldToMain()
		await this.gate.waitIfAnimating()
		const t0 = Date.now()
		let ast = this.grammar.transpile(src)
		logger().debug('[Transpiler] Parsed in %sms', Date.now() - t0)
		await this.gate.yieldToMain()
		const t1 = Date.now()
		for (const fn of this.pipeline(globalFunction, globalObject)) {
			await this.gate.waitIfAnimating()
			ast = fn(ast)
			await this.gate.yieldToMain()
		}
		logger().debug('[Transpiler] Transformed in %sms', Date.now() - t1)
		const js = this.gen(ast, t0)
		if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
			import('../util/idb-cache.js')
				.then(({ vbsCacheKey, idbSet }) => {
					try {
						idbSet(vbsCacheKey(vbs), js).catch(() => {})
					} catch {}
				})
				.catch(() => {})
		}
		return js
	}

	public execute(vbs: string, globalScope: Record<string, unknown>, globalObject?: string): void {
		globalObject ||= typeof window !== 'undefined' ? 'window' : typeof self !== 'undefined' ? 'self' : 'global'
		const js = this.transpile(vbs, 'play', globalObject)
		this.evalAndPlay(js, globalScope)
	}

	public async executeAsync(vbs: string, globalScope: Record<string, unknown>, globalObject?: string): Promise<void> {
		globalObject ||= typeof window !== 'undefined' ? 'window' : typeof self !== 'undefined' ? 'self' : 'global'
		if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
			try {
				const { vbsCacheKey, idbGet } = await import('../util/idb-cache.js')
				const cached = await idbGet(vbsCacheKey(vbs))
				if (typeof cached === 'string' && cached.length > 1000) {
					logger().debug('[Transpiler] Cache hit (%s chars)', cached.length)
					let t = Date.now()
					progress().details('evaluating')
					eval(`//@ sourceURL=game:///tablescript.vbs.js\n${cached}`)
					logger().debug('[Transpiler] Evaluated in %sms', Date.now() - t)
					progress().details('executing')
					t = Date.now()
					await this.gate.yieldToMain()
					play(
						new Proxy(globalScope, new VbsProxyHandler()),
						this.itemApis,
						this.enumApis,
						this.globalApi,
						this.stdlib,
						new VBSHelper(this),
						this.player,
					)
					logger().debug('[Transpiler] Executed in %sms', Date.now() - t)
					return
				}
			} catch {}
		}
		const js = await this.transpileAsync(vbs, 'play', globalObject)
		let t2 = Date.now()
		progress().details('evaluating')
		eval(`//@ sourceURL=game:///tablescript.vbs.js\n${js}`)
		logger().debug('[Transpiler] Evaluated in %sms', Date.now() - t2)
		progress().details('executing')
		t2 = Date.now()
		await this.gate.yieldToMain()
		play(
			new Proxy(globalScope, new VbsProxyHandler()),
			this.itemApis,
			this.enumApis,
			this.globalApi,
			this.stdlib,
			new VBSHelper(this),
			this.player,
		)
		logger().debug('[Transpiler] Executed in %sms', Date.now() - t2)
	}
}
