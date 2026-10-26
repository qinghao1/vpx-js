import type { Program } from 'estree'
import { Enums } from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
import { Grammar } from './grammar/grammar.js'
import { Stdlib } from './stdlib/index.js'
import { buildPipeline, normalizeNewCall } from './transpiler-pipeline.js'

export interface TableDataPayload {
	elementNames: string[]
	elementEvents: Record<string, string[]>
	elementApis: Record<string, string[]>
	elementApiFuncs?: Record<string, string[]>
	elementApiUndefined?: Record<string, string[]>
	globalFuncs?: string[]
	globalUndefined?: string[]
}

/** Case-insensitive name mock: functions as no-ops, undefined props as undefined, the rest as 0. */
function makeApiMock(props: string[], funcs: Set<string>, undef: Set<string>): any {
	const map = new Map<string, string>()
	const mock: any = {}
	for (const prop of props) {
		const key = prop.toLowerCase()
		map.set(key, prop)
		mock[prop] = funcs.has(key) ? () => {} : undef.has(key) ? undefined : 0
	}
	mock._getPropertyName = (name: string) => map.get(name.toLowerCase())
	return mock
}

export async function transpileInWorker(payload: {
	vbs: string
	globalFunction?: string
	globalObject?: string
	tableData?: TableDataPayload | null
}): Promise<string> {
	const escodegenModule: any = await import('escodegen')
	const generate =
		escodegenModule.generate ?? escodegenModule.default?.generate ?? escodegenModule.default?.default?.generate
	const { vbs, globalFunction, globalObject, tableData } = payload
	const grammar = new Grammar()
	let ast: Program = grammar.transpile(normalizeNewCall(vbs))
	let tableMock: any = null
	const itemApis: Record<string, unknown> = {}
	const stdlibMock: any = new Stdlib()
	let globalMock: any = null
	if (tableData) {
		const lowerMap = new Map<string, string>()
		for (const n of tableData.elementNames) lowerMap.set(n.toLowerCase(), n)
		tableMock = {
			getElementApiName: (n: string) => lowerMap.get(n.toLowerCase()),
			getElements: () => {
				const els: Record<string, any> = {}
				for (const n of tableData.elementNames)
					els[n] = { getName: () => n, getEventNames: () => tableData.elementEvents?.[n] ?? [] }
				return els
			},
		}
		const apiFuncs = tableData.elementApiFuncs ?? {}
		const apiUndef = tableData.elementApiUndefined ?? {}
		for (const [name, props] of Object.entries(tableData.elementApis)) {
			const funcs = new Set((apiFuncs[name] ?? []).map(s => s.toLowerCase()))
			const undef = new Set((apiUndef[name] ?? []).map(s => s.toLowerCase()))
			itemApis[name] = makeApiMock(props, funcs, undef)
		}
		const globalFuncs = new Set((tableData.globalFuncs ?? []).map(s => s.toLowerCase()))
		const globalUndef = new Set((tableData.globalUndefined ?? []).map(s => s.toLowerCase()))
		globalMock = makeApiMock(Object.getOwnPropertyNames(GlobalApi.prototype), globalFuncs, globalUndef)
	} else {
		tableMock = { getElementApiName: () => undefined, getElements: () => ({}) }
		globalMock = {
			_getPropertyName: (n: string) => {
				for (const k of Object.getOwnPropertyNames(GlobalApi.prototype))
					if (k.toLowerCase() === n.toLowerCase()) return k
				return undefined
			},
		}
	}
	const pipeline = buildPipeline({
		table: tableMock,
		elements: tableMock.getElements(),
		itemApis,
		enumApis: Enums as any,
		globalApi: globalMock,
		stdlib: stdlibMock,
		globalFunction,
		globalObject,
	})
	for (const fn of pipeline) ast = fn(ast)
	return generate(ast)
}
