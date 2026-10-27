// Shared TSL DAG inspection harness for the node-material algorithm-lock specs
// (unshaded-baked-node, bulb-lift-volume). These suites pin upstream shader parity
// (fs_basic.sc/fs_unshaded.sc bulb math, lift volume) structurally instead of by
// pixels; keep them in sync with the factories — a red test here means the
// shader graph changed, not the test. Do not duplicate these helpers into specs.

export interface TslOperand {
	readonly op?: unknown
	readonly method?: unknown
	readonly aNode?: unknown
	readonly bNode?: unknown
	readonly value?: unknown
	readonly isMathNode?: unknown
	readonly isTextureNode?: unknown
}

export function asOperand(node: unknown): TslOperand | null {
	return node && typeof node === 'object' ? (node as TslOperand) : null
}

/**
 * Eagerly runs a lazy TSL Fn body (three keeps `Fn()()` closures unbuilt
 * until backend compile: VarNode -> call -> jsFunc) so the spec can inspect
 * the real node DAG. Falls back to the raw node if internals change, which
 * fails the gate tests loudly instead of passing silently.
 */
export function materialize(node: unknown): unknown {
	let current = node as Record<string, unknown> | null | undefined
	if (current && typeof current === 'object' && current.node && typeof current.node === 'object') {
		current = current.node as Record<string, unknown>
	}
	if (current && typeof current === 'object' && current.shaderNode && typeof current.shaderNode === 'object') {
		current = current.shaderNode as Record<string, unknown>
	}
	if (current && typeof current === 'object' && typeof current.jsFunc === 'function') {
		return (current.jsFunc as () => unknown)()
	}
	return node
}

/** Collects every reachable object node under `root` (identity-based). */
export function collectNodes(root: unknown): TslOperand[] {
	const seen = new Set<unknown>()
	const found: TslOperand[] = []
	const stack: unknown[] = [root]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!node || typeof node !== 'object' || seen.has(node)) continue
		seen.add(node)
		const operand = asOperand(node)
		if (operand) found.push(operand)
		for (const key of Object.keys(node)) {
			const value = (node as Record<string, unknown>)[key]
			if (value && typeof value === 'object') stack.push(value)
		}
	}
	return found
}

/** Structural check: does the TSL node DAG under `root` reference `target`? */
export function graphReferences(root: unknown, target: unknown): boolean {
	return collectNodes(root).includes(target as TslOperand)
}
