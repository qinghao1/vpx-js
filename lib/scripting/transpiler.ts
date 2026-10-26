import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
import { type AnimationGate, animationGate } from '../util/animation-gate.js'
import { Enums, type EnumsApi } from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
import type { Table } from '../vpt/table/table.js'
import { Grammar } from './grammar/grammar.js'
import { Stdlib } from './stdlib/index.js'
import { buildPipeline, normalizeNewCall } from './transpiler-pipeline.js'
import { VBSHelper } from './vbs-helper.js'
import { VbsProxyHandler } from './vbs-proxy-handler.js'

export { normalizeNewCall }

declare function play(
	scope: unknown,
	table: Record<string, unknown>,
	enums: EnumsApi,
	globalApi: GlobalApi,
	stdlib: Stdlib,
	vbsHelper: VBSHelper,
	player: Player,
): void

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
		return generate(this.parseAndTransform(vbs, gf, go))
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
