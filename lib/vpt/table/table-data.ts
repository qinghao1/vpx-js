// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BiffParser } from '../../io/biff-parser.js'
import { getDataView } from '../../io/binary-helpers.js'
import type { Storage } from '../../io/ole-doc.js'
import { Vertex2D, Vertex3D } from '../../math/vector.js'
import {
	DEFAULT_TABLE_CONTACTFRICTION,
	DEFAULT_TABLE_ELASTICITY,
	DEFAULT_TABLE_ELASTICITY_FALLOFF,
	DEFAULT_TABLE_GRAVITY,
	DEFAULT_TABLE_PFSCATTERANGLE,
	GRAVITYCONST,
} from '../../physics/constants.js'
import { logger } from '../../util/logger.js'
import { handleBiffTag } from '../biff-helper.js'
import { ItemData } from '../item-data.js'
import { Material, SaveMaterial, SavePhysicsMaterial } from '../material.js'

/** 0-based backglass view ids (upstream `ViewSetupID`); the script-facing `BackglassIndex` enum is 110-based. */
export const BG_DESKTOP = 0
export const BG_FULLSCREEN = 1
export const BG_FSS = 2

function bgMaps(): {
	BG_FLOAT_MAP: Record<string, [string, number]>
	BG_INT_MAP: Record<string, [string, number]>
	BG_IMAGE_MAP: Record<string, number>
} {
	const views = [BG_DESKTOP, BG_FULLSCREEN, BG_FSS] as const
	const floatDefs: [string[], string][] = [
		[['ROTA', 'ROTF', 'ROFS'], 'bgRotation'],
		[['LAYB', 'LAYF', 'LAFS'], 'bgLayback'],
		[['INCL', 'INCF', 'INFS'], 'bgInclination'],
		[['FOVX', 'FOVF', 'FOFS'], 'bgFov'],
		[['SCLX', 'SCFX', 'SCXS'], 'bgScaleX'],
		[['SCLY', 'SCFY', 'SCYS'], 'bgScaleY'],
		[['SCLZ', 'SCFZ', 'SCZS'], 'bgScaleZ'],
		[['XLTX', 'XLFX', 'XLXS'], 'bgXlateX'],
		[['XLTY', 'XLFY', 'XLYS'], 'bgXlateY'],
		[['XLTZ', 'XLFZ', 'XLZS'], 'bgXlateZ'],
		[['HOF0', 'HOF1', 'HOF2'], 'bgViewHOfs'],
		[['VOF0', 'VOF1', 'VOF2'], 'bgViewVOfs'],
		[['WTZ0', 'WTZ1', 'WTZ2'], 'bgWindowTopZOfs'],
		[['WBZ0', 'WBZ1', 'WBZ2'], 'bgWindowBottomZOfs'],
	]
	const BG_FLOAT_MAP: Record<string, [string, number]> = {}
	for (const [tags, field] of floatDefs) {
		tags.forEach((tag, i) => {
			BG_FLOAT_MAP[tag] = [field, views[i]!]
		})
	}
	const BG_INT_MAP: Record<string, [string, number]> = {
		VSM0: ['bgViewMode', BG_DESKTOP],
		VSM1: ['bgViewMode', BG_FULLSCREEN],
		VSM2: ['bgViewMode', BG_FSS],
	}
	const BG_IMAGE_MAP: Record<string, number> = {
		BIMG: BG_DESKTOP,
		BIMF: BG_FULLSCREEN,
		BIMS: BG_FSS,
	}
	return { BG_FLOAT_MAP, BG_INT_MAP, BG_IMAGE_MAP }
}

const { BG_FLOAT_MAP, BG_INT_MAP, BG_IMAGE_MAP } = bgMaps()

/** cm-to-VPX-units (upstream `CMTOVPU`, core/def.h): ViewSetup position defaults. */
const CM_TO_VPU = 50 / (2.54 * 1.0625)

/** Upstream `ProtectionData` flags (parts/pintable.h): the script is locked. */
const DISABLE_SCRIPT_EDITING = 0x00000002
const DISABLE_EVERYTHING = 0x80000000

const FLOAT_MAP: Record<string, string> = {
	LEFT: 'left',
	TOPX: 'top',
	RGHT: 'right',
	BOTM: 'bottom',
	GAVT: 'gravity',
	FRCT: 'friction',
	ELAS: 'elasticity',
	ELFA: 'elasticityFalloff',
	PFSC: 'scatter',
	SCAT: 'defaultScatter',
	NDGT: 'nudgeTime',
	ZOOM: 'zoom',
	MAXS: '_3DmaxSeparation',
	ZPD: '_3DZPD',
	STO: '_3DOffset',
	SLPX: 'angleTiltMax',
	SLOP: 'angletiltMin',
	GLAS: 'glassHeight',
	GLAB: 'glassBottomHeight',
	LZHI: 'lightHeight',
	LZRA: 'lightRange',
	LIES: 'lightEmissionScale',
	ENES: 'envEmissionScale',
	GLES: 'globalEmissionScale',
	AOSC: 'aoScale',
	SSSC: 'ssrScale',
	BPRS: 'ballPlayfieldReflectionStrength',
	DBIS: 'defaultBulbIntensityScaleOnBall',
	BLST: 'bloomStrength',
	TDFT: 'globalDifficulty',
	SVOL: 'tableSoundVolume',
	MVOL: 'tableMusicVolume',
	CLBH: 'groundToLockbarHeight',
	EXPO: 'exposure',
}

const INT_MAP: Record<string, string> = {
	ORRP: 'overridePhysics',
	SEDT: 'numGameItems',
	SSND: 'numSounds',
	SIMG: 'numTextures',
	SFNT: 'numFonts',
	SCOL: 'numCollections',
	LZAM: 'lightAmbient',
	BREF: 'useReflectionForBalls',
	UAAL: 'useAA',
	BCLR: 'colorBackdrop',
	AVSY: 'tableAdaptiveVSync',
	ARAC: 'userDetailLevel',
	MASI: 'numMaterials',
	TLCK: 'tablelocked',
	UFXA: 'useFXAA',
}

const BOOL_MAP: Record<string, string> = {
	ORPF: 'overridePhysicsFlipper',
	DECL: 'renderDecals',
	REEL: 'renderEMReels',
	OGST: 'overwriteGlobalStereo3D',
	FBCK: 'displayBackdrop',
	BIMN: 'imageBackdropNightDay',
	BDMO: 'ballDecalMode',
	OGAC: 'overwriteGlobalDetailLevel',
	OGDN: 'overwriteGlobalDayNight',
	GDAC: 'showGrid',
	REOP: 'reflectElementsOnPlayfield',
	BLSM: 'ballSphericalMapping',
	UAOC: 'useAO',
	USSR: 'useSSR',
}

const STRING_MAP: Record<string, string> = {
	IMAG: 'szImage',
	BLIM: 'szBallImage',
	BLIF: 'szBallImageFront',
	SSHT: 'szScreenShot',
	IMCG: 'szImageColorGrade',
	EIMG: 'szEnvImage',
	PLMA: 'szPlayfieldMaterial',
	NOTX: 'notesText',
}

/** Table global data.
 * @see https://github.com/vpinball/vpinball/blob/master/pintable.cpp */
export class TableData extends ItemData {
	public static BGI_DESKTOP = 110
	public static BGI_FULLSCREEN = 111
	public static BGI_FSS = 112

	public left = 0
	public top = 0
	public right = 0
	public bottom = 0

	/** Upstream `ViewSetup` member-init defaults (renderer/ViewSetup.h): FOV 45, scales 1, lookAt 0.25. */
	public bgRotation: number[] = [0, 0, 0]
	public bgLayback: number[] = [0, 0, 0]
	public bgInclination: number[] = [0.25, 0.25, 0.25]
	public bgFov: number[] = [45, 45, 45]
	public bgScaleX: number[] = [1, 1, 1]
	public bgScaleY: number[] = [1, 1, 1]
	public bgScaleZ: number[] = [1, 1, 1]
	public bgXlateX: number[] = [0, 0, 0]
	public bgXlateY: number[] = [20 * CM_TO_VPU, 20 * CM_TO_VPU, 20 * CM_TO_VPU]
	public bgXlateZ: number[] = [70 * CM_TO_VPU, 70 * CM_TO_VPU, 70 * CM_TO_VPU]
	public bgViewHOfs: number[] = [0, 0, 0]
	public bgViewVOfs: number[] = [0, 0, 0]
	public bgWindowTopZOfs: number[] = [20 * CM_TO_VPU, 20 * CM_TO_VPU, 20 * CM_TO_VPU]
	public bgWindowBottomZOfs: number[] = [7.5 * CM_TO_VPU, 7.5 * CM_TO_VPU, 7.5 * CM_TO_VPU]
	public bgViewMode: number[] = [0, 0, 0]
	public bgEnableFss = false
	public bgCurrentSet = 0
	public bgImage: string[] = ['', '', '']
	public imageBackdropNightDay = false
	public ballSphericalMapping = true
	public notesText?: string
	public groundToLockbarHeight?: number
	/** TM_REINHARD, the pre-10.8 upstream default applied by SetLoadDefaults. */
	public toneMapper = 0
	public exposure = 1
	public tablelocked?: number

	public overridePhysics = 0
	public overridePhysicsFlipper = false
	/** Absolute units (upstream `m_Gravity` member init: 0.97 * GRAVITYCONST). */
	public gravity = DEFAULT_TABLE_GRAVITY * GRAVITYCONST
	public friction = DEFAULT_TABLE_CONTACTFRICTION
	public elasticity = DEFAULT_TABLE_ELASTICITY
	public elasticityFalloff = DEFAULT_TABLE_ELASTICITY_FALLOFF
	public scatter = DEFAULT_TABLE_PFSCATTERANGLE
	public defaultScatter = 0
	public nudgeTime = 5
	/** (int)0xFFFFFFFF: upstream sentinel/player default, script-visible as -1. */
	public physicsMaxLoops = -1
	public renderDecals = true
	public renderEMReels = true

	public offset = new Vertex2D()
	public _3DmaxSeparation?: number
	public _3DZPD?: number
	public zoom?: number
	public _3DOffset?: number
	public overwriteGlobalStereo3D = false

	public angleTiltMax = 6
	public angletiltMin = 4.5
	public glassHeight = 210
	public glassBottomHeight = 210
	/** Deprecated upstream: TBLH is read-and-discarded and the playfield sits at z=0. Kept for the script API. */
	public tableHeight = 0

	public szImage?: string
	public szBallImage?: string
	public szBallImageFront?: string
	public szScreenShot?: string
	public displayBackdrop = true

	public numGameItems!: number
	public numSounds!: number
	public numTextures!: number
	public numFonts!: number
	public numCollections!: number
	public scriptPos!: number
	public scriptLen!: number
	public declare name: string

	public Light: LightSource[] = [new LightSource()]
	public szImageColorGrade?: string
	public szEnvImage?: string
	public szPlayfieldMaterial?: string
	/** RGB(25, 25, 25): 10% gray ambient from SetLoadDefaults. */
	public lightAmbient = 25 | (25 << 8) | (25 << 16)
	public lightHeight = 1000
	public lightRange = 3000
	public lightEmissionScale = 1000000
	public envEmissionScale = 10
	public globalEmissionScale = 1
	public aoScale = 1.75
	public ssrScale = 0.5
	public useReflectionForBalls?: number
	public playfieldReflectionStrength = 0.2
	public useTrailForBalls?: number
	public ballTrailStrength!: number
	public ballPlayfieldReflectionStrength = 1
	public defaultBulbIntensityScaleOnBall = 1
	public useAA?: number
	public useAO = true
	public useSSR = true
	public useFXAA?: number
	public bloomStrength = 1
	/** RGB(0x62, 0x6e, 0x8e) from SetLoadDefaults. */
	public colorBackdrop = 0x62 | (0x6e << 8) | (0x8e << 16)
	public rgcolorcustom?: number[]
	public globalDifficulty = 0.2
	/** Upstream `m_script_protected` (parts/pintable.h): set from the SECB flags. */
	public scriptProtected = false
	public tableSoundVolume = 1
	public ballDecalMode = false
	public tableMusicVolume = 1
	public tableAdaptiveVSync?: number
	public overwriteGlobalDetailLevel = false
	public overwriteGlobalDayNight = false
	public showGrid = true
	public reflectElementsOnPlayfield = false
	public userDetailLevel?: number

	public numMaterials!: number
	public materials: Material[] = []
	private warnedNewMaterialFormat = false

	public plungerNormalize?: number
	public plungerFilter?: boolean

	public readonly overrideContactFriction = 0.075
	public readonly overrideElasticity = 0.25
	public readonly overrideElasticityFalloff = 0
	public readonly overrideScatterAngle = 0

	public static async fromStorage(storage: Storage, itemName: string): Promise<TableData> {
		const d = new TableData(itemName)
		await storage.streamFiltered(itemName, 0, BiffParser.stream(d.fromTag.bind(d), { streamedTags: ['CODE'] }))
		d.removeDuplicateMaterials()
		return d
	}

	public getName(): string {
		return this.name
	}

	public getFriction(): number {
		return this.overridePhysics ? this.overrideContactFriction : this.friction
	}
	public getElasticity(): number {
		return this.overridePhysics ? this.overrideElasticity : this.elasticity
	}
	public getElasticityFalloff(): number {
		return this.overridePhysics ? this.overrideElasticityFalloff : this.elasticityFalloff
	}
	public getScatter(): number {
		return this.overridePhysics ? this.overrideScatterAngle : this.scatter
	}

	private async fromTag(buffer: Uint8Array, tag: string, offset: number, len: number): Promise<number> {
		const bg = BG_FLOAT_MAP[tag]
		if (bg) {
			;(this as unknown as Record<string, number[]>)[bg[0]][bg[1]] = this.getFloat(buffer)
			return 0
		}
		const bgInt = BG_INT_MAP[tag]
		if (bgInt) {
			;(this as unknown as Record<string, number[]>)[bgInt[0]][bgInt[1]] = this.getInt(buffer)
			return 0
		}
		const bgImg = BG_IMAGE_MAP[tag]
		if (bgImg !== undefined) {
			this.bgImage[bgImg] = this.getString(buffer, len)
			return 0
		}
		if (
			handleBiffTag(this, tag, buffer, len, {
				float: FLOAT_MAP,
				int: INT_MAP,
				bool: BOOL_MAP,
				string: STRING_MAP,
			})
		)
			return 0
		switch (tag) {
			case 'PHML':
				// Upstream maps 0xFFFFFFFF to the player default ((int)0xFFFFFFFF = -1);
				// port has no player settings, so the signed value is kept as-is.
				this.physicsMaxLoops = this.getInt(buffer)
				break
			case 'PLST':
				this.playfieldReflectionStrength = this.getInt(buffer) / 255
				break
			case 'BTRA':
			case 'BTST':
				// legacy user tweaks: upstream forwards these to player settings, never
				// stores them on the table (the script BallTrail/TrailStrength API is
				// runtime state, kept on the data fields only so scripts can read it back)
				this.getInt(buffer)
				break
			case 'TMAP':
				// upstream clamps via GetValidToneMapper (TM_REINHARD..TM_NEUTRAL, else TM_AGX)
				this.toneMapper = validToneMapper(this.getInt(buffer))
				break
			case 'MPGC':
			case 'MPDF':
				this.getFloat(buffer)
				break
			case 'TBLH':
				// deprecated: upstream reads-and-discards, the playfield sits at z=0
				this.getFloat(buffer)
				break
			case 'PIID':
			case 'VERS':
				this.getInt(buffer)
				break
			case 'EFSS':
				this.bgEnableFss = this.getBool(buffer)
				if (this.bgEnableFss) this.bgCurrentSet = BG_FSS
				break
			case 'OFFX':
				this.offset.x = this.getFloat(buffer)
				break
			case 'OFFY':
				this.offset.y = this.getFloat(buffer)
				break
			case 'CODE':
				this.scriptPos = offset
				this.scriptLen = len
				break
			case 'NAME':
				this.name = this.getWideString(buffer, len)
				break
			case 'LZDI':
				this.Light[0].emission = this.getInt(buffer)
				break
			case 'CCUS':
				this.rgcolorcustom = this.getUnsignedInt4s(buffer, 16)
				break
			// CUST is never stored in GameData upstream: custom info tags live in
			// GameStg/CustomInfoTags with values under TableInfo/ (LoadCustomInfo),
			// already covered here by TableLoader.loadTableInfo.
			case 'MATE':
				this.materials = this.getMaterials(buffer, len, this.numMaterials)
				break
			case 'PHMA':
				this.applyPhysicsMaterials(buffer, len, this.numMaterials)
				break
			case 'SECB': {
				// old protection/encryption data (upstream pintable.cpp ProtectionData:
				// fileversion, size, 24-byte paraphrase, flags, keyversion, spare1, spare2).
				// Only the script-locked flag survives: the script itself stays ciphertext
				// without the legacy Windows RC2 key, so flag it loudly.
				if (len >= 48) {
					const flags = getDataView(buffer).getUint32(32, true)
					this.scriptProtected = (flags & DISABLE_EVERYTHING) !== 0 || (flags & DISABLE_SCRIPT_EDITING) !== 0
					if (this.scriptProtected)
						logger().warn(
							'[TableData] Table is script-protected (SECB flags %s); the embedded script may be encrypted and is not decrypted.',
							flags,
						)
				}
				break
			}
			case 'MATR':
			case 'RPRB':
				// 10.8+ materials and render probes use a new stream format the port
				// cannot parse yet; MATE/PHMA cover the legacy path
				if (!this.warnedNewMaterialFormat) {
					this.warnedNewMaterialFormat = true
					logger().warn(
						'[TableData] 10.8+ materials/render probes (%s) are not loaded; legacy MATE/PHMA only.',
						tag,
					)
				}
				break
		}
		return 0
	}

	/** Upstream `PinTable::Load` tail: drop case-insensitive duplicate material names, keeping the last. */
	private removeDuplicateMaterials(): void {
		for (let i = 0; i < this.materials.length; i++) {
			for (let j = i + 1; j < this.materials.length; j++) {
				if (this.materials[i]!.name.toLowerCase() === this.materials[j]!.name.toLowerCase()) {
					logger().warn(
						'[TableData] Duplicate material name found: %s, dropping it!',
						this.materials[i]!.name,
					)
					this.materials.splice(i, 1)
					i--
					break
				}
			}
		}
	}

	private getMaterials(buffer: Uint8Array, len: number, num: number): Material[] {
		if (len < num * SaveMaterial.size)
			throw new Error(
				`Cannot parse ${num} materials of ${num * SaveMaterial.size} bytes from a ${len} bytes buffer.`,
			)
		return Array.from({ length: num }, (_, i) => Material.fromSaved(new SaveMaterial(buffer, i)))
	}

	private applyPhysicsMaterials(buffer: Uint8Array, len: number, num: number): void {
		if (len < num * SavePhysicsMaterial.size)
			throw new Error(
				`Cannot parse ${num} physical materials of ${num * SavePhysicsMaterial.size} bytes from a ${len} bytes buffer.`,
			)
		// MATE and PHMA are parallel arrays; upstream applies by index when lengths
		// match (the normal case), exact-name fallback only otherwise (old tables may
		// hold names differing only by case). pintable.cpp PHMA block.
		const applyByIndex = this.materials.length === num
		for (let i = 0; i < num; i++) {
			const pm = new SavePhysicsMaterial(buffer, i)
			let mat = applyByIndex ? this.materials[i] : this.materials.find(material => material.name === pm.name)
			if (!mat) {
				// upstream creates the material on a name miss instead of failing
				mat = new Material()
				mat.name = pm.name
				this.materials.push(mat)
			}
			mat.physUpdate(pm)
		}
	}
}

/** Upstream `GetValidToneMapper` (typedefs3D.h): user-selectable TM_REINHARD..TM_NEUTRAL (0-3), else TM_AGX (1). */
function validToneMapper(value: number): number {
	return 0 <= value && value <= 3 ? value : 1
}

class LightSource {
	/** RGB(102,102,102): 40% gray emission from SetLoadDefaults. */
	public emission = 102 | (102 << 8) | (102 << 16)
	public pos = new Vertex3D(0, 0, 400)
}
