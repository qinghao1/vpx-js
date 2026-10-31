// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

const REM_HEAD = /^rem(\s|$|:)/i

/** True when the text at j opens a `Rem` comment — VBScript requires the colon after other statements. */
function isRemComment(line: string, j: number): boolean {
	while (j < line.length && /\s/.test(line[j])) j++
	return REM_HEAD.test(line.slice(j))
}

// Table scripts often keep superseded ROM names commented out, so match
// comment-stripped source. VBScript comments are ' outside string literals,
// or a REM line (which needs a colon after other statements).
export function stripVbsComments(script: string): string {
	return script
		.split('\n')
		.map(line => {
			if (isRemComment(line, 0)) return ''
			let inStr = false
			for (let i = 0; i < line.length; i++) {
				const c = line[i]
				if (c === '"') inStr = !inStr
				else if (!inStr && (c === "'" || (c === ':' && isRemComment(line, i + 1)))) return line.slice(0, i)
			}
			return line
		})
		.join('\n')
}
