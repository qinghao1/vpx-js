// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { generate } from 'escodegen'
import type { Program } from 'estree'
import type { Player } from '../game/player.js'
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

/** Transpiles VBS to JS and executes.
 * @see https://github.com/vpinball/vpinball/blob/master/codeview.cpp */
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
	) {
		this.itemApis = table.getElementApis()
		this.globalApi = new GlobalApi(table, player)
	}

	public transpile(vbs: string, globalFunction?: string, globalObject?: string): string {
		const src = normalizeNewCall(vbs)
		const t0 = Date.now()
		let ast = this.grammar.transpile(src)
		logger().info('[Transpiler] Parsed in %sms', Date.now() - t0)

		const t1 = Date.now()
		const pipeline: Array<(ast: Program) => Program> = [
			(a) => new FunctionHoistTransformer(a).transform(),
			(a) => new EventTransformer(a, this.table.getElements()).transform(),
			(a) => new ErrorTransformer(a).transform(),
			(a) =>
				new ReferenceTransformer(a, this.table, this.itemApis, this.enumApis, this.globalApi, this.stdlib).transform(),
			(a) => new ScopeTransformer(a).transform(),
			(a) => new ClassTransformer(a).transformThisIdentifiers(),
			(a) => new AmbiguityTransformer(a, this.itemApis, this.enumApis, this.globalApi, this.stdlib).transform(),
			(a) => new ClassTransformer(a).transform(),
			(a) => new WrapTransformer(a).transform(globalFunction, globalObject),
		]
		ast = pipeline.reduce((a, fn) => fn(a), ast)
		logger().info('[Transpiler] Transformed in %sms', Date.now() - t1)

		const t2 = Date.now()
		const js = generate(ast)
		logger().info('[Transpiler] Generated in %sms (total %sms)', Date.now() - t2, Date.now() - t0)
		logger().debug(js)
		return js
	}

	public execute(vbs: string, globalScope: Record<string, unknown>, globalObject?: string): void {
		globalObject ||= typeof window !== 'undefined' ? 'window' : typeof self !== 'undefined' ? 'self' : 'global'
		const js = this.transpile(vbs, 'play', globalObject)
		let t = Date.now()
		progress().details('evaluating')
		eval('//@ sourceURL=game:///tablescript.vbs.js\n' + js)
		logger().info('[Transpiler] Evaluated in %sms', Date.now() - t)
		progress().details('executing')
		t = Date.now()
		play(
			new Proxy(globalScope, new VbsProxyHandler()),
			this.itemApis,
			this.enumApis,
			this.globalApi,
			this.stdlib,
			new VBSHelper(this),
			this.player,
		)
		logger().info('[Transpiler] Executed in %sms', Date.now() - t)
	}

	private parse(vbs: string): Program {
		return this.grammar.transpile(normalizeNewCall(vbs))
	}
	private generate(ast: Program): string {
		return generate(ast)
	}
}
