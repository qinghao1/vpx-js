// Table structure & physics-constants audit (split from verify-vpinball-compat.ts).
export interface TableStructureAudit {
	itemCounts: {
		bumpers: number
		decals: number
		dispReels: number
		flashers: number
		flippers: number
		gates: number
		hitTargets: number
		kickers: number
		lights: number
		lightSeqs: number
		plungers: number
		primitives: number
		ramps: number
		rubbers: number
		spinners: number
		surfaces: number
		textboxes: number
		timers: number
		triggers: number
		textures: number
		collections: number
		totalItems: number
	}
	dimensions: {
		width: number
		height: number
		glassTop: number
		glassBottom: number
		inclination: number
	}
	physics: {
		flipperCount: number
		bumperCount: number
		rubberCount: number
		allPhysicsValid: boolean
		issues: string[]
	}
	warnings: string[]
	errors: string[]
}

type ItemCountKey = keyof Omit<TableStructureAudit['itemCounts'], 'totalItems'>

const COUNT_KEYS = [
	'bumpers',
	'decals',
	'dispReels',
	'flashers',
	'flippers',
	'gates',
	'hitTargets',
	'kickers',
	'lights',
	'lightSeqs',
	'plungers',
	'primitives',
	'ramps',
	'rubbers',
	'spinners',
	'surfaces',
	'textboxes',
	'timers',
	'triggers',
	'textures',
	'collections',
] as const satisfies ReadonlyArray<ItemCountKey>

function countItems(table: any): TableStructureAudit['itemCounts'] {
	const counts = {} as TableStructureAudit['itemCounts']
	for (const key of COUNT_KEYS) {
		counts[key] = Object.keys(table[key] ?? {}).length
	}
	counts.totalItems = Object.keys(table.items ?? {}).length
	return counts
}

type NumCheck = 'positive' | 'nonNegative' | 'positiveIfPresent' | 'nonNegativeIfPresent'

interface NumRule {
	field: string
	check: NumCheck
}

interface ItemNumRules {
	prop: string
	label: string
	fields: NumRule[]
	checkCenter?: boolean
}

// Per-item numeric validations, in audit order. Message shape is fixed:
// `${label} '${name}' ${verb} ${field}: ${value}` with verb invalid/negative.
const NUM_RULES: ItemNumRules[] = [
	{
		prop: 'flippers',
		label: 'Flipper',
		checkCenter: true,
		fields: [
			{ field: 'mass', check: 'positive' },
			{ field: 'strength', check: 'positive' },
			{ field: 'baseRadius', check: 'positive' },
			{ field: 'endRadius', check: 'positive' },
			{ field: 'flipperRadiusMax', check: 'positive' },
		],
	},
	{
		prop: 'bumpers',
		label: 'Bumper',
		checkCenter: true,
		fields: [
			{ field: 'radius', check: 'positive' },
			{ field: 'force', check: 'nonNegative' },
		],
	},
	{
		prop: 'rubbers',
		label: 'Rubber',
		fields: [
			{ field: 'hitHeight', check: 'nonNegativeIfPresent' },
			{ field: 'elasticity', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'gates',
		label: 'Gate',
		fields: [
			{ field: 'damping', check: 'nonNegativeIfPresent' },
			{ field: 'friction', check: 'nonNegativeIfPresent' },
			{ field: 'elasticity', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'spinners',
		label: 'Spinner',
		fields: [
			{ field: 'damping', check: 'nonNegativeIfPresent' },
			{ field: 'elasticity', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'ramps',
		label: 'Ramp',
		fields: [
			{ field: 'topWidth', check: 'nonNegativeIfPresent' },
			{ field: 'bottomWidth', check: 'nonNegativeIfPresent' },
			{ field: 'wireDiameter', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'surfaces',
		label: 'Surface',
		fields: [
			{ field: 'elasticity', check: 'nonNegativeIfPresent' },
			{ field: 'friction', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'kickers',
		label: 'Kicker',
		checkCenter: true,
		fields: [
			{ field: 'radius', check: 'positiveIfPresent' },
			{ field: 'hitHeight', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'hitTargets',
		label: 'HitTarget',
		fields: [
			{ field: 'depth', check: 'nonNegativeIfPresent' },
			{ field: 'elasticity', check: 'nonNegativeIfPresent' },
			{ field: 'friction', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'triggers',
		label: 'Trigger',
		fields: [
			{ field: 'hitHeight', check: 'nonNegativeIfPresent' },
			{ field: 'radius', check: 'nonNegativeIfPresent' },
		],
	},
	{
		prop: 'plungers',
		label: 'Plunger',
		fields: [
			{ field: 'speedPull', check: 'nonNegativeIfPresent' },
			{ field: 'speedFire', check: 'nonNegativeIfPresent' },
			{ field: 'stroke', check: 'nonNegativeIfPresent' },
		],
	},
]

// Flashers run after primitives (original audit order).
const FLASHER_RULES: ItemNumRules = {
	prop: 'flashers',
	label: 'Flasher',
	fields: [{ field: 'opacity', check: 'nonNegativeIfPresent' }],
}

const MATERIAL_FIELDS: NumRule[] = [
	{ field: 'elasticity', check: 'nonNegativeIfPresent' },
	{ field: 'friction', check: 'nonNegativeIfPresent' },
	{ field: 'scatterAngle', check: 'nonNegativeIfPresent' },
]

function checkNumeric(
	issues: string[],
	label: string,
	name: string,
	data: Record<string, unknown>,
	field: string,
	check: NumCheck,
): void {
	const value: unknown = data[field]
	if (typeof value !== 'number') {
		if (check === 'positive' || check === 'nonNegative') {
			issues.push(`${label} '${name}' invalid ${field}: ${value}`)
		}
		return
	}
	const bad = check === 'positive' || check === 'positiveIfPresent' ? value <= 0 : value < 0
	if (bad) {
		const verb = check === 'nonNegativeIfPresent' ? 'negative' : 'invalid'
		issues.push(`${label} '${name}' ${verb} ${field}: ${value}`)
	}
}

function checkCenterNaN(issues: string[], label: string, name: string, data: any): void {
	if (data.center && (Number.isNaN(data.center.x) || Number.isNaN(data.center.y))) {
		issues.push(`${label} '${name}' center coordinate is NaN`)
	}
}

function auditNumerics(table: any, rules: ItemNumRules, issues: string[]): void {
	for (const [name, item] of Object.entries(table[rules.prop] ?? {})) {
		const data = (item as any).data
		if (!data) continue
		for (const { field, check } of rules.fields) {
			checkNumeric(issues, rules.label, name, data, field, check)
		}
		if (rules.checkCenter) checkCenterNaN(issues, rules.label, name, data)
	}
}

export function auditTableStructure(table: any): TableStructureAudit {
	const itemCounts = countItems(table)

	const dimensions = {
		width: table.data?.tableWidth ?? 0,
		height: table.data?.tableHeight ?? 0,
		glassTop: table.data?.glassTopHeight ?? 0,
		glassBottom: table.data?.glassBottomHeight ?? 0,
		inclination: table.data?.inclination ?? 0,
	}

	const warnings: string[] = []
	const errors: string[] = []
	const physicsIssues: string[] = []

	if (dimensions.width <= 0 || dimensions.height <= 0) {
		warnings.push(`Non-standard table dimensions: ${dimensions.width}x${dimensions.height}`)
	}
	if (dimensions.glassBottom > dimensions.glassTop) {
		warnings.push(`Glass bottom (${dimensions.glassBottom}) is higher than top (${dimensions.glassTop})`)
	}

	// Per-item numeric validations (flippers → plungers, see NUM_RULES)
	for (const rules of NUM_RULES) {
		auditNumerics(table, rules, physicsIssues)
	}

	// Surfaces (walls) height validation
	for (const [name, surface] of Object.entries(table.surfaces ?? {})) {
		const surfaceData = (surface as any).data
		if (!surfaceData) continue
		if (
			typeof surfaceData.topHeight === 'number' &&
			typeof surfaceData.bottomHeight === 'number' &&
			surfaceData.bottomHeight > surfaceData.topHeight
		)
			warnings.push(
				`Surface '${name}' bottomHeight (${surfaceData.bottomHeight}) > topHeight (${surfaceData.topHeight})`,
			)
	}

	// Primitives validation
	for (const [name, primitive] of Object.entries(table.primitives ?? {})) {
		const primitiveData = (primitive as any).data
		if (!primitiveData) continue
		if (
			primitiveData.position &&
			(Number.isNaN(primitiveData.position.x) || Number.isNaN(primitiveData.position.y))
		)
			physicsIssues.push(`Primitive '${name}' position coordinate is NaN`)
		if (primitiveData.size && (Number.isNaN(primitiveData.size.x) || Number.isNaN(primitiveData.size.y)))
			physicsIssues.push(`Primitive '${name}' size dimension is NaN`)
	}
	auditNumerics(table, FLASHER_RULES, physicsIssues)

	// Textboxes validation
	for (const [name, textbox] of Object.entries(table.textboxes ?? {})) {
		const textboxData = (textbox as any).data
		if (!textboxData) continue
		if (textboxData.isDMD || /dmd/i.test(textboxData.text ?? '')) {
			warnings.push(`Legacy Textbox '${name}' is used for DMD rendering (recommend Flasher)`)
		}
	}

	// Materials validation
	for (const mat of table.data?.materials ?? []) {
		for (const { field, check } of MATERIAL_FIELDS) {
			checkNumeric(physicsIssues, 'Material', mat.name, mat, field, check)
		}
	}

	// Timers frame-pacing check (< 17ms below 60fps)
	for (const [name, timer] of Object.entries(table.timers ?? {})) {
		const timerData = (timer as any).data
		if (!timerData) continue
		if (timerData.timerEnabled && timerData.timerInterval > 0 && timerData.timerInterval < 17) {
			warnings.push(`Timer '${name}' interval ${timerData.timerInterval}ms is below 60FPS frame pacing threshold`)
		}
	}

	// Lights intensity check
	for (const [name, light] of Object.entries(table.lights ?? {})) {
		const lightData = (light as any).data
		if (!lightData) continue
		checkNumeric(warnings, 'Light', name, lightData, 'intensity', 'nonNegativeIfPresent')
	}

	// Script keyword diagnostics (matches native AuditTable)
	const script = (table as any).tableScript ?? ''
	if (script) {
		const lowerScript = script.toLowerCase()
		if (/\bexecute\b/.test(lowerScript)) {
			warnings.push("Script uses 'Execute' command (may trigger security/performance checks)")
		}
		const hasLoadVpm = lowerScript.includes('loadvpm')
		const hasPinMameTimer = Boolean(table.timers?.pinmametimer || table.timers?.PinMAMETimer)
		if (hasLoadVpm && !hasPinMameTimer) {
			warnings.push("VPM controller is used but table is missing a Timer object named 'PinMAMETimer'")
		}
		const hasVpmTimer = lowerScript.includes('vpmtimer')
		const hasPulseTimer = Boolean(table.timers?.pulsetimer || table.timers?.PulseTimer)
		if (hasVpmTimer && !hasPulseTimer) {
			warnings.push("Script references 'vpmTimer' but table is missing a Timer object named 'PulseTimer'")
		}
	}

	return {
		itemCounts,
		dimensions,
		physics: {
			flipperCount: itemCounts.flippers,
			bumperCount: itemCounts.bumpers,
			rubberCount: itemCounts.rubbers,
			allPhysicsValid: physicsIssues.length === 0,
			issues: physicsIssues,
		},
		warnings,
		errors,
	}
}
