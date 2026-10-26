export const BUTTON_CODE_PATTERNS: { regex: RegExp; code: string }[] = [
	{ regex: /coin/i, code: 'Digit5' },
	{ regex: /start/i, code: 'Digit1' },
	{ regex: /tour/i, code: 'Digit1' },
	{ regex: /plunger|launch/i, code: 'Enter' },
	{ regex: /fire|lockbar/i, code: 'AltLeft' },
	{ regex: /magna.*left|left.*magna/i, code: 'ControlLeft' },
	{ regex: /magna/i, code: 'ControlRight' },
	{ regex: /button/i, code: 'Digit1' },
]

export const resolveButtonCode = (name: string): string | null => {
	const nameLower = String(name ?? '').toLowerCase()
	for (const { regex, code } of BUTTON_CODE_PATTERNS) {
		if (regex.test(nameLower)) return code
	}
	return null
}
