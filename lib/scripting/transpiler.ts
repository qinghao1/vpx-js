import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
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
		const { ast, t0 } = this.parseAndTransform(vbs, gf, go)
		return this.gen(ast, t0)
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
