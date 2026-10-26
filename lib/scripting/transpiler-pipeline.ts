import type { Program } from 'estree'
import type { IScriptable } from '../game/interfaces.js'
import type { EnumsApi } from '../vpt/enums.js'
import type { GlobalApi } from '../vpt/global-api.js'
import type { Table } from '../vpt/table/table.js'
import type { Stdlib } from './stdlib/index.js'
import { AmbiguityTransformer } from './transformer/ambiguity-transformer.js'
import { ClassTransformer } from './transformer/class-transformer.js'
import { DateLiteralTransformer } from './transformer/date-literal-transformer.js'
import { ErrorTransformer } from './transformer/error-transformer.js'
import { EventTransformer } from './transformer/event-transformer.js'
import { FunctionHoistTransformer } from './transformer/function-hoist-transformer.js'
import { ReferenceTransformer } from './transformer/reference-transformer.js'
import { ScopeTransformer } from './transformer/scope-transformer.js'
import { WrapTransformer } from './transformer/wrap-transformer.js'

/** Applies a rewrite to every span outside `"..."` string literals (`""` escapes a quote). */
function rewriteOutsideStrings(source: string, rewrite: (segment: string) => string): string {
	let result = ''
	let segmentStart = 0
	let inString = false
	let index = 0
	const flush = (through: number, verbatim: boolean): void => {
		const segment = source.slice(segmentStart, through)
		result += verbatim ? segment : rewrite(segment)
		segmentStart = through
	}
	while (index < source.length) {
		const char = source[index]
		if (inString && (char === '\r' || char === '\n')) {
			// VBS strings cannot span lines: a quote in a comment must not swallow later lines.
			flush(index, true)
			inString = false
			index++
			continue
		}
		if (char !== '"') {
			index++
			continue
		}
		if (inString && source[index + 1] === '"') {
			index += 2
			continue
		}
		if (!inString) {
			flush(index, false)
		} else {
			flush(index + 1, true)
		}
		inString = !inString
		index++
	}
	flush(source.length, inString)
	return result
}

function rewriteOption(segment: string): string {
	return segment.replace(/\.Option\b/gi, '._Option')
}

function rewriteOptionOutsideStrings(text: string): string {
	return rewriteOutsideStrings(text, rewriteOption)
}

const NEW_FORM_PATTERN =
	/(?<literal>"[^\r\n"]*(?:""[^\r\n"]*)*")|Set\s+(?<setName>\w+)\s*=\s*\(\s*New\s+(?<setClass>\w+)\s*\)\s*\((?<setArgs>[^)]*)\)|\(\s*New\s+(?<bareClass>\w+)\s*\)\s*\(/gi

/** Desugars inline `(New Class)(args)` construction, leaving string literals untouched. */
function rewriteNewForms(vbs: string): string {
	return vbs.replace(NEW_FORM_PATTERN, (...replaceArgs: unknown[]) => {
		const groups = (replaceArgs.at(-1) ?? {}) as Record<string, string | undefined>
		if (groups.literal !== undefined) {
			return groups.literal
		}
		if (groups.setName !== undefined && groups.setClass !== undefined) {
			const args = rewriteOptionOutsideStrings((groups.setArgs ?? '').trim())
			return args
				? `Set ${groups.setName} = New ${groups.setClass}\n${groups.setName}.init ${args}`
				: `Set ${groups.setName} = New ${groups.setClass}`
		}
		return `(New ${groups.bareClass}).init(`
	})
}

/**
 * Desugars inline `(New Class)(args)` construction and renames `Option`
 * member access, which the grammar cannot parse as-is. String literals pass
 * through untouched so message text is never rewritten. (JS-reserved
 * identifiers like `switch` parse fine and are renamed later, after element
 * lookup, by `ReferenceTransformer.replaceReservedWords`.)
 */
export function normalizeNewCall(vbs: string): string {
	return rewriteOptionOutsideStrings(rewriteNewForms(vbs))
}

/** Compile-time context the AST pipeline resolves names against. */
export interface TranspilerPipelineDeps {
	table: Table
	elements: { [name: string]: IScriptable<any> }
	itemApis: Record<string, unknown>
	enumApis: EnumsApi
	globalApi: GlobalApi
	stdlib: Stdlib
	globalFunction?: string
	globalObject?: string
}

/** The single AST pipeline shared by the sync transpiler and the worker. */
export function buildPipeline(deps: TranspilerPipelineDeps): Array<(ast: Program) => Program> {
	const { table, elements, itemApis, enumApis, globalApi, stdlib, globalFunction, globalObject } = deps
	return [
		ast => new FunctionHoistTransformer(ast).transform(),
		ast => new EventTransformer(ast, elements).transform(),
		ast => new ErrorTransformer(ast).transform(),
		ast => new ReferenceTransformer(ast, table, itemApis, enumApis, globalApi, stdlib).transform(),
		ast => new ScopeTransformer(ast).transform(),
		ast => new DateLiteralTransformer(ast).transform(),
		ast => new ClassTransformer(ast).transformThisIdentifiers(),
		ast => new AmbiguityTransformer(ast, itemApis, enumApis, globalApi, stdlib).transform(),
		ast => new ClassTransformer(ast).transform(),
		ast => new WrapTransformer(ast).transform(globalFunction, globalObject),
	]
}
