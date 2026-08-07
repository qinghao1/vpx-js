// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { createRequire } from 'node:module'
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

const require = createRequire(import.meta.url)

//self.escodegen = require('escodegen');

// the table script function
declare function play(
	scope: any,
	table: { [key: string]: any },
	enums: EnumsApi,
	globalApi: GlobalApi,
	stdlib: Stdlib,
	vbsHelper: VBSHelper,
	player: Player,
): void

export class Transpiler {
	private readonly table: Table
	private readonly player: Player
	private readonly itemApis: { [p: string]: any }
	private readonly enumApis: EnumsApi
	private readonly globalApi: GlobalApi
	private readonly stdlib: Stdlib
	private readonly grammar: Grammar

	constructor(table: Table, player: Player) {
		this.table = table
		this.player = player
		this.itemApis = this.table.getElementApis()
		this.enumApis = Enums
		this.globalApi = new GlobalApi(this.table, player)
		this.stdlib = new Stdlib()
		this.grammar = new Grammar()
	}

	public transpile(vbs: string, globalFunction?: string, globalObject?: string) {
		//logger().debug(vbs);
		const then = Date.now()
		let ast = this.parse(vbs)
		logger().info('[Transpiler.transpile]: Parsed in %sms', Date.now() - then)

		let now = Date.now()
		ast = new FunctionHoistTransformer(ast).transform()
		ast = new EventTransformer(ast, this.table.getElements()).transform()
		ast = new ErrorTransformer(ast).transform()
		ast = new ReferenceTransformer(
			ast,
			this.table,
			this.itemApis,
			this.enumApis,
			this.globalApi,
			this.stdlib,
		).transform()
		ast = new ScopeTransformer(ast).transform()
		ast = new ClassTransformer(ast).transformThisIdentifiers()
		ast = new AmbiguityTransformer(ast, this.itemApis, this.enumApis, this.globalApi, this.stdlib).transform()
		ast = new ClassTransformer(ast).transform()
		ast = new WrapTransformer(ast).transform(globalFunction, globalObject)
		logger().info('[Transpiler.transpile]: Transformed in %sms', Date.now() - now)
		//logger().debug('AST:', ast);

		now = Date.now()
		const js = this.generate(ast)
		logger().info(
			'[Transpiler.transpile]: Generated in %sms (total transpilation time: %sms)',
			Date.now() - now,
			Date.now() - then,
		)
		logger().debug(js)

		return js
	}

	public execute(vbs: string, globalScope: any, globalObject?: string) {
		globalObject =
			globalObject || (typeof window !== 'undefined' ? 'window' : typeof self !== 'undefined' ? 'self' : 'global')
		const js = this.transpile(vbs, 'play', globalObject)

		let now = Date.now()
		progress().details('evaluating')
		// tslint:disable-next-line:no-eval
		eval('//@ sourceURL=game:///tablescript.vbs.js\n' + js)
		logger().info('[Transpiler.execute] Evaluated in %sms', Date.now() - now)
		progress().details('executing')
		now = Date.now()
		play(
			new Proxy(globalScope, new VbsProxyHandler()),
			this.itemApis,
			this.enumApis,
			this.globalApi,
			this.stdlib,
			new VBSHelper(this),
			this.player,
		)
		logger().info('[Transpiler.execute] Executed in %sms', Date.now() - now)
	}

	private parse(vbs: string): Program {
		return this.grammar.transpile(vbs)
	}

	private generate(ast: Program): string {
		return generate(ast)
	}
}
