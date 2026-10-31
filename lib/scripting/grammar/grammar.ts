// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type IRule, type IToken, Parser } from 'ebnf'
import { generate } from 'escodegen'
import type { Program, Statement } from 'estree'
import { astCacheKey } from '../../util/idb-cache.js'
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
import { getAstMemCache, setAstMemCache } from '../transpiler-worker-pool.js'
import { RULES } from './rules.js'

/**
 * Post-order token-tree walk. Replaces dash-ast (only its `leave` visitor was
 * ever used): dash-ast is CJS calling its `require('assert')` result directly,
 * which bundlers alias to a non-callable ESM shim in the browser — breaking
 * every in-browser transpile (worker and ExecuteGlobal inline) with
 * "assert is not a function" while node keeps passing.
 */
function walkPostOrder(
	node: ESIToken,
	leave: (node: ESIToken, parent: ESIToken | null) => void,
	parent: ESIToken | null = null,
): void {
	for (const key of Object.keys(node)) {
		if (key === 'parent') continue
		const value: unknown = (node as unknown as Record<string, unknown>)[key]
		if (isToken(value)) {
			walkPostOrder(value, leave, node)
		} else if (Array.isArray(value)) {
			for (const child of value) {
				if (isToken(child)) walkPostOrder(child, leave, node)
			}
		}
	}
	leave(node, parent)
}

const isToken = (value: unknown): value is ESIToken =>
	typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'

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

const SCOPE_OPEN_RE =
	/^(?:\s*(?:(?:public|private)(?:\s+default)?\s+)?(?:sub|function)\b|\s*(?:(?:public|private)\s+)?property\s+(?:get|let|set)\b|\s*class\b)/i
const SCOPE_CLOSE_RE = /^\s*end\s+(?:sub|function|property|class)\b/i
const IF_OPEN_RE = /^\s*if\b/i
const BLOCK_THEN_RE = /\bthen\s*$/i
const END_IF_RE = /^\s*end\s+if\b/i
const SPACED_ELSE_IF_RE = /^\s*else\s+if\b/i
const LITERAL_RE = /"(?:""|[^"])*"|#[^#]*#/g

/** Blank string/date literals in place (same length) so the scan can't match inside them. */
function blankLiterals(line: string): string {
	return line.replace(LITERAL_RE, match => ' '.repeat(match.length))
}

/**
 * Two-word `Else If` parity: MS reads line-leading `Else If <cond> Then`
 * (nothing after `Then`) as `Else` opening a nested block-`If` with its own
 * `End If`; our grammar reads one `ElseIf` needing none, so nested-style
 * tables (e.g. Royal Flush 1976) fail to parse. Single-line
 * `Else If ... Then <stmt>` needs no `End If` either way: keep it lenient.
 *
 * Repair: per Sub/Function/Property/Class scope, count `If`/`End If` under
 * the lenient reading; a scope with a net extra `End If` splits that many
 * trailing block-form candidates into `Else` + `If ... Then` (latest first,
 * a heuristic when several could balance). Balanced scopes return untouched.
 */
function repairSpacedElseIf(lines: string[]): string[] {
	const depths = new Map<number, number>()
	const candidates = new Map<number, number[]>()
	const stack: number[] = [0]
	let nextScope = 1
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!
		// Boundary lines belong to the outer scope: pop before assigning, push after.
		const isScopeClose = SCOPE_CLOSE_RE.test(line)
		if (isScopeClose && stack.length > 1) stack.pop()
		const scope = stack[stack.length - 1]!
		if (SCOPE_OPEN_RE.test(line)) {
			stack.push(nextScope++)
			continue
		}
		if (isScopeClose) continue
		const stripped = blankLiterals(line)
		if (END_IF_RE.test(stripped)) {
			depths.set(scope, (depths.get(scope) ?? 0) - 1)
			continue
		}
		const segments = stripped.split(':')
		// Any `:` segment may open a block `If` (`z = 1 : If c Then`).
		if (segments.some(segment => IF_OPEN_RE.test(segment) && BLOCK_THEN_RE.test(segment))) {
			depths.set(scope, (depths.get(scope) ?? 0) + 1)
			continue
		}
		// Block form only: single-line `Then <stmt>` parses either way, never a candidate.
		if (SPACED_ELSE_IF_RE.test(stripped) && BLOCK_THEN_RE.test(segments[0]!)) {
			let list = candidates.get(scope)
			if (!list) candidates.set(scope, (list = []))
			list.push(i)
		}
	}
	const splits: number[] = []
	for (const [scope, depth] of depths) {
		if (depth < 0) splits.push(...(candidates.get(scope) ?? []).slice(depth))
	}
	if (splits.length === 0) return lines
	const out = [...lines]
	// Descending so earlier indices stay valid; splits never emit scope
	// boundaries, so scopes and remaining candidacies are unaffected.
	for (const split of splits.sort((a, b) => b - a)) {
		// Keep the tail verbatim (`Then : stmt` stays on the new `If` line).
		const indent = /^(\s*)/.exec(out[split]!)![1]
		const rest = out[split]!.trimStart().slice('Else'.length).trimStart()
		out.splice(split, 1, `${indent}Else`, `${indent}${rest}`)
	}
	return out
}

/**
 * VBS grammar parser: `format` (strip comments, join `_` continuations,
 * repair two-word `Else If` to the nested MS reading when the lenient
 * `ElseIf` reading unbalances the scope, normalize keyword case) → `ebnf`
 * parse with generated `RULES` → post-process (`post-process/pp*`, token
 * tree → ESTree). AST transformers run later in `Transpiler` via
 * `buildPipeline`, not here. See `../README.md`.
 */
const GRAMMAR_KEYWORDS: string[] = [
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

/** Per-letter `[Aa]` class (not an `i` flag: no Unicode folding). */
function keywordCharClass(char: string): string {
	const upper = char.toUpperCase()
	const lower = char.toLowerCase()
	return upper === lower ? char : `[${upper}${lower}]`
}

interface KeywordTrieNode {
	children: Map<string, KeywordTrieNode>
	terminal: boolean
}

function buildKeywordTrie(words: string[]): KeywordTrieNode {
	const root: KeywordTrieNode = { children: new Map(), terminal: false }
	for (const word of words) {
		let node = root
		for (const char of word.toLowerCase()) {
			let next = node.children.get(char)
			if (!next) {
				next = { children: new Map(), terminal: false }
				node.children.set(char, next)
			}
			node = next
		}
		node.terminal = true
	}
	return root
}

/**
 * Trie to regex source. Shared prefixes nest into greedy `(?:...)?` groups
 * (`Else(?:If)?`), which try the longest keyword first, matching bnf order.
 */
function emitKeywordTrie(node: KeywordTrieNode): string {
	const parts: string[] = []
	for (const [char, child] of node.children) {
		const head = keywordCharClass(char)
		const tail = emitKeywordTrie(child)
		if (!tail) parts.push(head)
		else if (child.terminal) parts.push(`${head}(?:${tail})?`)
		else parts.push(`${head}(?:${tail})`)
	}
	return parts.join('|')
}

/** Anchored single-token equivalent of the `%Keyword2` fragment (same language, one regex exec). */
const KEYWORD_RE = new RegExp(`^(?:${emitKeywordTrie(buildKeywordTrie(GRAMMAR_KEYWORDS))})`)

/**
 * Anchor a generated regex to the input start. ebnf's `readToken` only
 * accepts matches at index 0, so anchoring keeps the language identical
 * while failed matches return immediately instead of scanning the rest.
 */
function anchorRegExp(pattern: RegExp): RegExp {
	return new RegExp(`^(?:${pattern.source})`, pattern.flags)
}

/** RULES with `%Keyword2` collapsed to KEYWORD_RE and every regex anchored; tree shape unchanged. */
const OPTIMIZED_RULES: IRule[] = RULES.map(rule => {
	if (rule.name === '%Keyword2') {
		return { ...rule, bnf: [[KEYWORD_RE]] }
	}
	return {
		...rule,
		bnf: rule.bnf.map(alternative =>
			alternative.map(element => (element instanceof RegExp ? anchorRegExp(element) : element)),
		),
	}
})

let sharedParser: Parser | null = null

/** Process-wide parser (`parse` keeps no per-call state; sequential use only). */
function getSharedParser(): Parser {
	return (sharedParser ??= new Parser(OPTIMIZED_RULES, {}))
}

export class Grammar {
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
		for (const key of GRAMMAR_KEYWORDS) {
			this.keywordsMap[key.toLowerCase()] = key
		}

		for (const key of this.GRAMMAR_IDENTIFIERS) {
			this.identifiersMap[key.toLowerCase()] = key
		}

		this.parser = getSharedParser()
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
				// trimmed starts with rem, so its index is the leading-whitespace width.
				const idx = content.length - trimmed.length
				const before = content.slice(0, idx)
				if (before.trimEnd() === '' || before.trimEnd().endsWith(':')) content = content.slice(0, idx)
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
		for (const raw of repairSpacedElseIf(joined)) {
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
				// `&H`/`&O` without a following digit is the `&` concatenation operator.
				const isHexStart =
					ch === '&' && i + 2 < n && /[Hh]/.test(raw[i + 1]!) && /[0-9A-Fa-f]/.test(raw[i + 2]!)
				const isOctalStart = ch === '&' && i + 2 < n && /[Oo]/.test(raw[i + 1]!) && /[0-7]/.test(raw[i + 2]!)
				if (
					/[0-9]/.test(ch) ||
					(ch === '.' && i + 1 < n && /[0-9]/.test(raw[i + 1]!)) ||
					isHexStart ||
					isOctalStart
				) {
					let num = ''
					if (isHexStart || isOctalStart) {
						num += raw[i]! + raw[i + 1]!
						i += 2
						const digitRe = isHexStart ? /[0-9A-Fa-f]/ : /[0-7]/
						while (i < n && digitRe.test(raw[i]!)) {
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

		// Table-independent cache (see setAstMemCache); hits are caller-owned clones.
		const astKey = astCacheKey(formattedScript)
		const astHit = getAstMemCache(astKey)
		if (astHit !== undefined) {
			return astHit
		}

		let now = Date.now()

		progress().details('transpiling')
		const ast = this.parseFast(formattedScript)
		if (ast === null) {
			throw new Error('Unable to transpile script.')
		} else if (ast.rest?.length) {
			const start = formattedScript.length - ast.rest.length
			const lineNo = formattedScript.slice(0, start).split('\n').length
			const eol = formattedScript.indexOf('\n', start)
			const line = formattedScript.slice(start, eol === -1 ? start + 200 : eol)
			throw new Error(`Unable to transpile script. Syntax error at line ${lineNo}: ${line}`)
		}
		logger().debug('[Grammar.transpile] Parsed in %sms', Date.now() - now)

		const postProcessors = this.postProcessors
		now = Date.now()
		progress().details('post-processing')
		/**
		 * Per-call winner memo: token types are handled by a stable post
		 * processor (each `pp*` switches on `node.type`), so after the first
		 * node of a type, try the winner first. On a miss the full ordered
		 * loop still runs (skipping only the call just made), which is exactly
		 * today's behavior — the memo can only skip calls, never change which
		 * processor handles a node.
		 */
		const winners = new Map<string, number>()
		const runPostProcessors = (node: ESIToken): unknown => {
			const winner = winners.get(node.type)
			if (winner !== undefined) {
				const estree = postProcessors[winner]!(node)
				if (estree) {
					return estree
				}
				for (let i = 0; i < postProcessors.length; i++) {
					if (i === winner) continue
					const fallback = postProcessors[i]!(node)
					if (fallback) {
						winners.set(node.type, i)
						return fallback
					}
				}
				return null
			}
			for (let i = 0; i < postProcessors.length; i++) {
				const estree = postProcessors[i]!(node)
				if (estree) {
					winners.set(node.type, i)
					return estree
				}
			}
			return null
		}
		walkPostOrder(ast, (node: ESIToken, _parent: ESIToken | null) => {
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
				/**
				 * Loop through all registered post processors until an estree
				 * is returned. If no post processors can handle the node, and
				 * the node has a child, copy its estree. This will allow estrees
				 * to get propagated to parents, and we won't need to have
				 * post-processors for every single rule in the grammar.
				 */
				const estree = runPostProcessors(node)
				if (estree !== null) {
					node.estree = estree
				} else if (node.children[0]) {
					node.estree = node.children[0].estree
				}
			}
		})
		logger().debug('[Grammar.transpile] Post-processed in %sms', Date.now() - now)

		const result = program(stmts)
		setAstMemCache(astKey, result)
		return result
	}

	public vbsToJs(script: string): string {
		const ast = this.transpile(script)
		renameReservedWords(ast)
		return generate(ast)
	}

	/**
	 * Faster `parser.getAST`: the library tail (`agregateErrors`,
	 * `fixPositions`, two `stripRules` walks, `fixRest`) costs ~20% of the
	 * parse on table-size scripts, and none of it is observable downstream —
	 * only the root `rest` is read (syntax-error check above), while `errors`,
	 * `start`/`end` and child `rest`s are never consumed. So parse directly
	 * and strip rule helpers in a single walk instead.
	 */
	private parseFast(formattedScript: string): ESIToken | null {
		const ast = this.parser.parse(formattedScript, this.GRAMMAR_TARGET_PROGRAM) as ESIToken | null
		if (ast) {
			stripTokenRules(ast)
		}
		return ast
	}
}

/**
 * Single-pass equivalent of the ebnf `getAST` rule stripping (first `/^%/`
 * tags, then `UPPER_SNAKE` helpers): drops matching children with their
 * subtrees, recursing only into survivors. Removal is monotonic, so one
 * combined walk yields the same tree as the two sequential walks. Nodes are
 * kept by identity, preserving their `parent` links; non-root `rest`s are
 * cleared like the library `fixRest` (the root `rest` stays for the
 * syntax-error check).
 */
function stripTokenRules(root: ESIToken): void {
	const stack: ESIToken[] = [root]
	while (stack.length > 0) {
		const node = stack.pop()!
		const children = node.children
		if (!children?.length) {
			continue
		}
		let write = 0
		for (let read = 0; read < children.length; read++) {
			const child = children[read]!
			if (child.type && STRIPPED_TOKEN_RE.test(child.type)) {
				continue
			}
			// Every visited child is a non-root node: clear like `fixRest`
			// (the root `rest` is left intact for the syntax-error check).
			child.rest = ''
			children[write++] = child
			stack.push(child)
		}
		children.length = write
	}
}

/** Token types the ebnf `getAST` strips (`/^%/` tags and `UPPER_SNAKE` helpers). */
const STRIPPED_TOKEN_RE = /^(?:%|[A-Z0-9_]+$)/
