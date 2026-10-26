// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import dashAstImport from 'dash-ast'
import { type IToken, Parser } from 'ebnf'
import { generate } from 'escodegen'
import type { Program, Statement } from 'estree'
import { logger, progress } from '../../util/logger.js'
import { program } from '../estree.js'
import { ppArray } from '../post-process/array.js'
import { ppAssign } from '../post-process/assign.js'
import { ppBranch } from '../post-process/branch.js'
import { ppCall } from '../post-process/call.js'
import { ppClass } from '../post-process/class.js'
import { ppConditional } from '../post-process/conditional.js'
import { ppConst } from '../post-process/const.js'
import { ppError } from '../post-process/error.js'
import { ppExpr } from '../post-process/expr.js'
import { ppHelpers } from '../post-process/helpers.js'
import { ppLiteral } from '../post-process/literal.js'
import { ppLoop } from '../post-process/loop.js'
import { ppMethod } from '../post-process/method.js'
import { ppVarDecl } from '../post-process/vardecl.js'
import { ppWith } from '../post-process/with.js'
import { renameReservedWords } from '../transformer/reference-transformer.js'
import { RULES } from './rules.js'

// dash-ast is CJS, handle both default and direct export
const dashAst: (ast: any, opts: any) => void = (dashAstImport as any)?.default ?? (dashAstImport as any)

const isAlphaChar = (char: string): boolean => /[A-Za-z_]/.test(char)
const isAlNumChar = (char: string): boolean => /[A-Za-z0-9_]/.test(char)

/** True when `line[colonIdx]` starts a `: Rem comment` tail (docs: Rem after other statements needs a colon). */
const isColonRemComment = (line: string, colonIdx: number): boolean => {
	let j = colonIdx + 1
	while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++
	if (line.slice(j, j + 3).toLowerCase() !== 'rem') return false
	const after = line[j + 3]
	return after === undefined || after === ' ' || after === '\t' || after === ':'
}

const isWordChar = (char: string | undefined): boolean => char !== undefined && /[A-Za-z0-9_]/.test(char)

/**
 * Rewrite canonical `Call Name(a, b)` / `Call obj.Name(a, b)` to the equivalent
 * `Call Name a, b`, which the grammar already accepts with identical semantics.
 * Only single paren groups holding a top-level comma are rewritten; those never
 * parse today, so previously accepted lines are byte-identical afterwards.
 */
const stripCallParens = (line: string): string => {
	let result = ''
	let i = 0
	while (i < line.length) {
		const ch = line[i] ?? ''
		if (ch === '"') {
			let j = i + 1
			while (j < line.length) {
				if (line[j] === '"') {
					if (j + 1 < line.length && line[j + 1] === '"') {
						j += 2
						continue
					}
					j++
					break
				}
				j++
			}
			result += line.slice(i, j)
			i = j
			continue
		}
		if (
			(ch === 'C' || ch === 'c') &&
			line.slice(i, i + 4).toLowerCase() === 'call' &&
			!isWordChar(line[i - 1]) &&
			!isWordChar(line[i + 4])
		) {
			const m = matchCallParenGroup(line, i + 4)
			if (m) {
				result += `${line.slice(i, m.open).trimEnd()} ${line.slice(m.open + 1, m.close)}`
				i = m.close + 1
				continue
			}
		}
		result += ch
		i++
	}
	return result
}

/** Locate the single multi-arg paren group of a `Call` target, or null to leave the text untouched. */
const matchCallParenGroup = (line: string, from: number): { open: number; close: number } | null => {
	let j = from
	while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++
	if (!isAlphaChar(line[j] ?? '')) return null
	while (j < line.length && isAlNumChar(line[j] ?? '')) j++
	for (;;) {
		let k = j
		while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++
		if (line[k] !== '.') break
		k++
		while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++
		if (!isAlphaChar(line[k] ?? '')) return null
		while (k < line.length && isAlNumChar(line[k] ?? '')) k++
		j = k
	}
	while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++
	if (line[j] !== '(') return null
	const open = j
	let depth = 0
	let hasTopComma = false
	j++
	while (j < line.length) {
		const c = line[j] ?? ''
		if (c === '"') {
			j++
			while (j < line.length) {
				if (line[j] === '"') {
					if (j + 1 < line.length && line[j + 1] === '"') {
						j += 2
						continue
					}
					j++
					break
				}
				j++
			}
			continue
		}
		if (c === '(') depth++
		else if (c === ')') {
			if (depth === 0) break
			depth--
		} else if (c === ',' && depth === 0) hasTopComma = true
		j++
	}
	if (j >= line.length || !hasTopComma) return null
	let k = j + 1
	while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++
	if (k < line.length && line[k] !== ':') return null
	return { open, close: j }
}

export interface ESIToken extends IToken {
	estree: any
	parent: ESIToken
	children: ESIToken[]
}

/**
 * VBS grammar parser: `format` (strip comments, join `_` continuations,
 * normalize keyword case) → `ebnf` parse with generated `RULES` → post-process
 * (`post-process/pp*`, token tree → ESTree). AST transformers run later in
 * `Transpiler` via `buildPipeline`, not here. See `../README.md`.
 */
export class Grammar {
	private readonly GRAMMAR_KEYWORDS: string[] = [
		'And',
		'ByVal',
		'ByRef',
		'Case',
		'Call',
		'Class',
		'Const',
		'Default',
		'Dim',
		'Do',
		'Each',
		'ElseIf',
		'Else',
		'Empty',
		'End',
		'Erase',
		'Error',
		'Eqv',
		'Exit',
		'Explicit',
		'False',
		'For',
		'Function',
		'Get',
		'GoTo',
		'If',
		'In',
		'Is',
		'Let',
		'Loop',
		'Mod',
		'New',
		'Next',
		'Nothing',
		'Not',
		'Null',
		'On',
		'Option',
		'Or',
		'Preserve',
		'Private',
		'Property',
		'Public',
		'ReDim',
		'Resume',
		'Select',
		'Set',
		'Sub',
		'Then',
		'To',
		'True',
		'Until',
		'While',
		'WEnd',
		'With',
		'Xor',
	]

	private readonly GRAMMAR_IDENTIFIERS: string[] = ['Me']

	private readonly GRAMMAR_TARGET_PROGRAM = 'Program'

	private readonly parser: Parser
	private readonly keywordsMap: { [index: string]: string } = {}
	private readonly identifiersMap: { [index: string]: string } = {}

	private readonly postProcessors = [
		ppHelpers,
		ppLiteral,
		ppExpr,
		ppVarDecl,
		ppConst,
		ppArray,
		ppError,
		ppAssign,
		ppConditional,
		ppLoop,
		ppBranch,
		ppWith,
		ppMethod,
		ppCall,
		ppClass,
	]

	constructor() {
		/**
		 * Create a lookup table of standardized keywords
		 */
		for (const key of this.GRAMMAR_KEYWORDS) {
			this.keywordsMap[key.toLowerCase()] = key
		}

		/**
		 * Create a lookup table of standardized identifiers
		 */
		for (const key of this.GRAMMAR_IDENTIFIERS) {
			this.identifiersMap[key.toLowerCase()] = key
		}

		this.parser = new Parser(RULES, {})
	}

	public format(script: string): string {
		const lines = script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
		const joined: string[] = []
		let buffer = ''
		for (let li = 0; li < lines.length; li++) {
			const line = lines[li]!
			let out = ''
			let inStr = false
			for (let ci = 0; ci < line.length; ci++) {
				const ch = line[ci]!
				if (ch === '"') {
					if (inStr && line[ci + 1] === '"') {
						out += '""'
						ci++
						continue
					}
					inStr = !inStr
					out += ch
					continue
				}
				if (!inStr && ch === "'") {
					break
				}
				if (!inStr && ch === ':' && isColonRemComment(line, ci)) {
					break
				}
				out += ch
			}
			let content = out
			const trimmed = content.trimStart()
			if (
				trimmed.length >= 3 &&
				trimmed.slice(0, 3).toLowerCase() === 'rem' &&
				(trimmed.length === 3 || /[\s:]/.test(trimmed[3]!))
			) {
				const idx = content.toLowerCase().indexOf('rem')
				if (idx >= 0) {
					const before = content.slice(0, idx)
					if (before.trimEnd() === '' || before.trimEnd().endsWith(':')) content = content.slice(0, idx)
				}
			}
			content = content.trimEnd()
			if (!content.trim()) continue
			let lastNonWs = -1
			for (let ci = content.length - 1; ci >= 0; ci--) {
				if (content[ci] !== ' ' && content[ci] !== '\t') {
					lastNonWs = ci
					break
				}
			}
			const isCont = lastNonWs >= 0 && content[lastNonWs] === '_' && !inStr
			if (isCont) {
				const part = content.slice(0, lastNonWs).trimEnd()
				buffer = buffer ? buffer + ' ' + part : part
			} else {
				if (buffer) {
					content = buffer + ' ' + content
					buffer = ''
				}
				joined.push(stripCallParens(content))
			}
		}
		const outLines: string[] = []
		for (const raw of joined) {
			let res = ''
			let prevTokenType: string | null = null
			let prevTokenText = ''
			let hadSep = false
			let i = 0
			const n = raw.length
			while (i < n) {
				const ch = raw[i]!
				if (ch === '"') {
					let str = '"'
					i++
					while (i < n) {
						const c = raw[i]!
						str += c
						if (c === '"') {
							if (i + 1 < n && raw[i + 1] === '"') {
								str += '"'
								i += 2
								continue
							}
							i++
							break
						}
						i++
					}
					if (
						prevTokenType &&
						(prevTokenType === 'Keyword' ||
							prevTokenType === 'Identifier' ||
							prevTokenType === 'Literal' ||
							prevTokenText === ')')
					) {
						res += ' '
					}
					res += str
					prevTokenType = 'Literal'
					prevTokenText = '"'
					hadSep = false
					continue
				}
				if (ch === '#') {
					let dateLit = '#'
					i++
					while (i < n) {
						const c = raw[i]!
						dateLit += c
						if (c === '#') {
							i++
							break
						}
						i++
					}
					if (
						prevTokenType &&
						(prevTokenType === 'Keyword' ||
							prevTokenType === 'Identifier' ||
							prevTokenType === 'Literal' ||
							prevTokenText === ')')
					) {
						res += ' '
					}
					res += dateLit
					prevTokenType = 'Literal'
					prevTokenText = '#'
					hadSep = false
					continue
				}
				if (ch === ' ' || ch === '\t') {
					hadSep = true
					i++
					continue
				}
				if (ch === ':') {
					res += ':'
					i++
					while (i < n && (raw[i] === ' ' || raw[i] === '\t')) i++
					prevTokenType = 'Colon'
					prevTokenText = ':'
					hadSep = false
					continue
				}
				if (ch === ',') {
					res += ','
					i++
					while (i < n && (raw[i] === ' ' || raw[i] === '\t')) i++
					prevTokenType = 'Separator'
					prevTokenText = ','
					hadSep = false
					continue
				}
				if (ch === '(') {
					if (prevTokenType === 'Keyword') res += ' '
					res += '('
					i++
					prevTokenType = 'Operator'
					prevTokenText = '('
					hadSep = false
					continue
				}
				if (ch === '-') {
					if (prevTokenType === 'Keyword') res += ' '
					res += ch
					i++
					prevTokenType = 'Operator'
					prevTokenText = ch
					hadSep = false
					continue
				}
				if (
					/[0-9]/.test(ch) ||
					(ch === '.' && i + 1 < n && /[0-9]/.test(raw[i + 1]!)) ||
					(ch === '&' && i + 1 < n && /[HhOo]/.test(raw[i + 1]!))
				) {
					let num = ''
					if (ch === '&' && i + 1 < n && /[HhOo]/.test(raw[i + 1]!)) {
						num += raw[i]! + raw[i + 1]!
						i += 2
						while (i < n && /[0-9A-Fa-f]/.test(raw[i]!)) {
							num += raw[i]!
							i++
						}
					} else if (ch === '.') {
						num += '.'
						i++
						while (i < n && /[0-9]/.test(raw[i]!)) {
							num += raw[i]!
							i++
						}
					} else {
						while (i < n && /[0-9]/.test(raw[i]!)) {
							num += raw[i]!
							i++
						}
						if (i < n && raw[i] === '.' && i + 1 < n && /[0-9]/.test(raw[i + 1]!)) {
							num += '.'
							i++
							while (i < n && /[0-9]/.test(raw[i]!)) {
								num += raw[i]!
								i++
							}
						}
						if (i < n && (raw[i] === 'E' || raw[i] === 'e')) {
							let hasExp = false
							const j = i + 1
							if (j < n && (raw[j] === '+' || raw[j] === '-')) {
								if (j + 1 < n && /[0-9]/.test(raw[j + 1]!)) hasExp = true
							} else if (j < n && /[0-9]/.test(raw[j]!)) hasExp = true
							if (hasExp) {
								num += raw[i]!
								i++
								if (i < n && (raw[i] === '+' || raw[i] === '-')) {
									num += raw[i]!
									i++
								}
								while (i < n && /[0-9]/.test(raw[i]!)) {
									num += raw[i]!
									i++
								}
							}
						}
					}
					if (prevTokenType === 'Keyword' || prevTokenType === 'Identifier') res += ' '
					res += num
					prevTokenType = 'Literal'
					prevTokenText = num
					hadSep = false
					continue
				}
				if (ch === '.' || ch === '&' || ch === '+') {
					if (ch === '.') {
						if (
							hadSep &&
							prevTokenType &&
							prevTokenType !== 'Operator' &&
							prevTokenText !== ':' &&
							prevTokenType !== 'Colon' &&
							prevTokenType !== 'Separator'
						) {
							res += ' '
						}
					}
					res += ch
					i++
					prevTokenType = 'Operator'
					prevTokenText = ch
					hadSep = false
					continue
				}
				if (
					ch === ')' ||
					ch === '=' ||
					ch === '*' ||
					ch === '/' ||
					ch === '\\' ||
					ch === '^' ||
					ch === '<' ||
					ch === '>' ||
					ch === '!' ||
					ch === '?' ||
					ch === '{' ||
					ch === '}'
				) {
					res += ch
					i++
					prevTokenType = 'Operator'
					prevTokenText = ch
					hadSep = false
					continue
				}
				if (isAlphaChar(ch)) {
					let word = ''
					while (i < n && isAlNumChar(raw[i]!)) {
						word += raw[i]!
						i++
					}
					const lower = word.toLowerCase()
					const std = this.keywordsMap[lower]
					let type = 'Identifier'
					let text = word
					if (std) {
						text = std
						type = 'Keyword'
					}
					if (lower === 'me' && prevTokenText !== '.') {
						text = this.identifiersMap[lower] ?? word
						type = 'Identifier'
					}
					if (prevTokenType) {
						if (type === 'Keyword') {
							if (
								prevTokenType === 'Keyword' ||
								prevTokenType === 'Identifier' ||
								prevTokenType === 'Literal' ||
								prevTokenText === ')'
							) {
								res += ' '
							}
						} else if (type === 'Identifier') {
							if (
								prevTokenType === 'Keyword' ||
								prevTokenType === 'Identifier' ||
								prevTokenType === 'Literal' ||
								prevTokenText === ')'
							) {
								res += ' '
							}
						} else if (type === 'Literal') {
							if (prevTokenType === 'Keyword' || prevTokenType === 'Identifier') res += ' '
						}
					}
					res += text
					prevTokenType = type
					prevTokenText = text
					hadSep = false
					continue
				}
				res += ch
				i++
				hadSep = false
			}
			outLines.push(res)
		}
		return outLines.join('\n') + '\n'
	}

	public transpile(script: string): Program {
		const stmts: Statement[] = []

		const formattedScript = this.format(script)

		// An empty (or comment-only) script is a valid no-op in VBScript.
		if (!formattedScript.trim()) {
			return program(stmts)
		}

		let now = Date.now()

		progress().details('transpiling')
		const ast = this.parser.getAST(formattedScript, this.GRAMMAR_TARGET_PROGRAM)
		if (ast === null) {
			throw new Error('Unable to transpile script.')
		} else if (ast.rest?.length) {
			const start = formattedScript.length - ast.rest.length
			throw new Error(
				'Unable to transpile script. Syntax error at: ' +
					formattedScript.substr(start, formattedScript.indexOf('\n', start)),
			)
		}
		logger().debug('[Grammar.transpile] Parsed in %sms', Date.now() - now)

		const postProcessors = this.postProcessors
		now = Date.now()
		progress().details('post-processing')
		dashAst(ast, {
			leave(node: ESIToken, _parent: ESIToken) {
				if (node.type === 'Program') {
					for (const child of node.children) {
						if (child.estree) {
							if (!Array.isArray(child.estree)) {
								stmts.push(child.estree)
							} else {
								stmts.push(...child.estree)
							}
						}
					}
				} else {
					let estree: any = null
					/**
					 * Loop through all registered post processors until an estree
					 * is returned. If no post processors can handle the node, and
					 * the node has a child, copy it's estree. This will allow estrees
					 * to get propagated to parents, and we wont need to have
					 * post-processors for every single rule in the grammar.
					 */
					for (const postProcessor of postProcessors) {
						estree = postProcessor(node)
						if (estree) {
							break
						}
					}
					if (estree !== null) {
						node.estree = estree
					} else if (node.children[0]) {
						node.estree = node.children[0].estree
					}
				}
			},
		})
		logger().debug('[Grammar.transpile] Post-processed in %sms', Date.now() - now)

		return program(stmts)
	}

	public vbsToJs(script: string): string {
		const ast = this.transpile(script)
		renameReservedWords(ast)
		return generate(ast)
	}
}
