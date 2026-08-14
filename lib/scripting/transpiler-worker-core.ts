// Shared core for worker - no worker lifecycle, just logic

import { generate } from 'escodegen'
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
	globalProps?: string[]
	globalFuncs?: string[]
	stdlibProps?: string[]
	enumProps?: Record<string, string[]>
}

export async function transpileInWorker(payload: {
	vbs: string
	globalFunction?: string
	globalObject?: string
	tableData?: TableDataPayload | null
}): Promise<string> {
	const { vbs, globalFunction, globalObject, tableData } = payload
	const grammar = new Grammar()
	const src = normalizeNewCall(vbs)
	let ast: Program = grammar.transpile(src)
	let tableMock: any = null
	const itemApis: Record<string, unknown> = {}
	const enumApis: any = Enums
	const stdlibInstance = new Stdlib()
	const stdlibMock: any = stdlibInstance
	let globalMock: any = null
	const enumMock: any = Enums
	if (tableData) {
		const lowerMap = new Map<string, string>()
		for (const name of tableData.elementNames) lowerMap.set(name.toLowerCase(), name)
		tableMock = {
			getElementApiName: (n: string) => lowerMap.get(n.toLowerCase()),
			getElements: () => {
				const els: Record<string, any> = {}
				for (const name of tableData.elementNames) {
					els[name] = { getName: () => name, getEventNames: () => tableData.elementEvents?.[name] ?? [] }
				}
				return els
			},
		}
		const apiFuncs = (tableData.elementApiFuncs ?? {}) as Record<string, string[]>
		for (const [name, props] of Object.entries(tableData.elementApis as Record<string, string[]>)) {
			const propMap = new Map<string, string>()
			const mock: any = {}
			const funcSet = new Set((apiFuncs[name] ?? []).map(s => s.toLowerCase()))
			for (const p of props) {
				propMap.set(p.toLowerCase(), p)
				mock[p] = funcSet.has(p.toLowerCase()) ? (() => {}) : 0
			}
			mock._getPropertyName = (n: string) => propMap.get(n.toLowerCase())
			itemApis[name] = mock
		}
		const globalFuncsSet = new Set((tableData.globalFuncs ?? []).map(s => s.toLowerCase()))
		const globalPropMap = new Map<string, string>()
		const gMock: any = {}
		const globalProtoProps = tableData.globalProps ?? Object.getOwnPropertyNames(GlobalApi.prototype)
		for (const p of globalProtoProps) {
			globalPropMap.set(p.toLowerCase(), p)
			gMock[p] = globalFuncsSet.has(p.toLowerCase()) ? (() => {}) : 0
		}
		gMock._getPropertyName = (n: string) => globalPropMap.get(n.toLowerCase())
		globalMock = gMock
	} else {
		tableMock = {
			getElementApiName: () => undefined,
			getElements: () => ({}),
		}
		globalMock = {
			_getPropertyName: (n: string) => {
				const proto = GlobalApi.prototype as any
				for (const key of Object.getOwnPropertyNames(proto)) {
					if (key.toLowerCase() === n.toLowerCase()) return key
				}
				return undefined
			},
		}
	}
	const pipeline: Array<(ast: Program) => Program> = []
	pipeline.push(a => new FunctionHoistTransformer(a).transform())
	pipeline.push(a => new EventTransformer(a, tableMock.getElements()).transform())
	pipeline.push(a => new ErrorTransformer(a).transform())
	pipeline.push(a => new ReferenceTransformer(a, tableMock, itemApis, enumMock, globalMock, stdlibMock).transform())
	pipeline.push(a => new ScopeTransformer(a).transform())
	pipeline.push(a => new ClassTransformer(a).transformThisIdentifiers())
	pipeline.push(a => new AmbiguityTransformer(a, itemApis, enumMock, globalMock, stdlibMock).transform())
	pipeline.push(a => new ClassTransformer(a).transform())
	pipeline.push(a => new WrapTransformer(a).transform(globalFunction, globalObject))
	for (const fn of pipeline) ast = fn(ast)
	const js = generate(ast)
	return js
}
