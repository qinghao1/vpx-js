// Cabinet button mesh-name → direct-input code mapping.
//
// Boundaries are separator-aware: a keyword matches at the string start or
// after a non-alphanumeric separator (`_`, space, camel-hump split), so
// `contour` (tour), `campfire` (fire) and `starburst` (start) do not match.
// Specific multi-word spellings stay before the generic `button`, which is
// additionally end-anchored so furniture such as `button_holder` does not
// match while `start_button`/`exit_button` still resolve.
const atTokenStart = (alt: string): RegExp => new RegExp(`(?:^|[^a-z0-9])${alt}`, 'i')

export const BUTTON_CODE_PATTERNS: { regex: RegExp; code: string }[] = [
	{ regex: atTokenStart('coin'), code: 'Digit5' },
	{ regex: atTokenStart('start'), code: 'Digit1' },
	{ regex: atTokenStart('tour'), code: 'Digit1' },
	{ regex: atTokenStart('(?:plunger|launch)'), code: 'Enter' },
	{ regex: atTokenStart('(?:fire|lockbar)'), code: 'AltLeft' },
	{ regex: atTokenStart('(?:magna.*left|left.*magna)'), code: 'ControlLeft' },
	{ regex: atTokenStart('magna'), code: 'ControlRight' },
	{ regex: /(?:^|[^a-z0-9])button$/i, code: 'Digit1' },
]

export const resolveButtonCode = (name: string): string | null => {
	// Split camel humps so `StartButton` tokenizes like `start_button`.
	const spaced = String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
	const nameLower = spaced.toLowerCase()
	for (const { regex, code } of BUTTON_CODE_PATTERNS) {
		if (regex.test(nameLower)) return code
	}
	return null
}
