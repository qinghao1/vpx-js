import type { Program } from 'estree'
import { Enums } from '../vpt/enums.js'
import { GlobalApi } from '../vpt/global-api.js'
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

export interface TableDataPayload {
	elementNames: string[]
	elementEvents: Record<string, string[]>
	elementApis: Record<string, string[]>
	elementApiFuncs?: Record<string, string[]>
	elementApiUndefined?: Record<string, string[]>
	globalFuncs?: string[]
	globalUndefined?: string[]
}

export async function transpileInWorker(payload: {
	vbs: string
	globalFunction?: string
	globalObject?: string
	tableData?: TableDataPayload | null
}): Promise<string> {
	const escodegenModule: any = await import('escodegen')
	const generate = escodegenModule.generate ?? escodegenModule.default?.generate ?? escodegenModule.default?.default?.generate
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
		const funcs = tableData.elementApiFuncs ?? {}
		const undef = tableData.elementApiUndefined ?? {}
		for (const [name, props] of Object.entries(tableData.elementApis)) {
			const map = new Map<string, string>()
			const mock: any = {}
			const f = new Set((funcs[name] ?? []).map(s => s.toLowerCase()))
			const u = new Set((undef[name] ?? []).map(s => s.toLowerCase()))
			for (const p of props) {
				map.set(p.toLowerCase(), p)
				mock[p] = f.has(p.toLowerCase()) ? () => {} : u.has(p.toLowerCase()) ? undefined : 0
			}
			mock._getPropertyName = (n: string) => map.get(n.toLowerCase())
			itemApis[name] = mock
		}
		const gf = new Set((tableData.globalFuncs ?? []).map(s => s.toLowerCase()))
		const gu = new Set((tableData.globalUndefined ?? []).map(s => s.toLowerCase()))
		const gMap = new Map<string, string>()
		const gMock: any = {}
		for (const p of Object.getOwnPropertyNames(GlobalApi.prototype)) {
			gMap.set(p.toLowerCase(), p)
			gMock[p] = gf.has(p.toLowerCase()) ? () => {} : gu.has(p.toLowerCase()) ? undefined : 0
		}
		gMock._getPropertyName = (n: string) => gMap.get(n.toLowerCase())
		globalMock = gMock
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
	const pipeline = [
		(a: Program) => new FunctionHoistTransformer(a).transform(),
		(a: Program) => new EventTransformer(a, tableMock.getElements()).transform(),
		(a: Program) => new ErrorTransformer(a).transform(),
		(a: Program) =>
			new ReferenceTransformer(a, tableMock, itemApis, Enums as any, globalMock, stdlibMock).transform(),
		(a: Program) => new ScopeTransformer(a).transform(),
		(a: Program) => new ClassTransformer(a).transformThisIdentifiers(),
		(a: Program) => new AmbiguityTransformer(a, itemApis, Enums as any, globalMock, stdlibMock).transform(),
		(a: Program) => new ClassTransformer(a).transform(),
		(a: Program) => new WrapTransformer(a).transform(globalFunction, globalObject),
	]
	for (const fn of pipeline) ast = fn(ast)
	return generate(ast)
}
