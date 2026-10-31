// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import _6803 from '../../res/scripts/6803.vbs?raw'
import ALI from '../../res/scripts/ALI.vbs?raw'
import Atari from '../../res/scripts/Atari.vbs?raw'
import Atari1 from '../../res/scripts/Atari1.vbs?raw'
import Atari1b from '../../res/scripts/Atari1b.vbs?raw'
import Atari2 from '../../res/scripts/Atari2.vbs?raw'
import alving from '../../res/scripts/alving.vbs?raw'
import antar from '../../res/scripts/antar.vbs?raw'
import B2B from '../../res/scripts/B2B.vbs?raw'
import B2Bcollision from '../../res/scripts/B2Bcollision.vbs?raw'
import Bally from '../../res/scripts/Bally.vbs?raw'
import BallyG from '../../res/scripts/BallyG.vbs?raw'
import b2s from '../../res/scripts/b2s.vbs?raw'
import Class1812 from '../../res/scripts/Class1812.vbs?raw'
import capcom from '../../res/scripts/capcom.vbs?raw'
import controller from '../../res/scripts/controller.vbs?raw'
import core from '../../res/scripts/core.vbs?raw'
import de from '../../res/scripts/de.vbs?raw'
import de2 from '../../res/scripts/de2.vbs?raw'
import FPVPX from '../../res/scripts/FPVPX.vbs?raw'
import GamePlan from '../../res/scripts/GamePlan.vbs?raw'
import gts1 from '../../res/scripts/gts1.vbs?raw'
import gts3 from '../../res/scripts/gts3.vbs?raw'
import Hankin from '../../res/scripts/Hankin.vbs?raw'
import idsa from '../../res/scripts/idsa.vbs?raw'
import inder from '../../res/scripts/inder.vbs?raw'
import inder_atleta from '../../res/scripts/inder_atleta.vbs?raw'
import inder_centaur from '../../res/scripts/inder_centaur.vbs?raw'
import inder_skateboard from '../../res/scripts/inder_skateboard.vbs?raw'
import ironballs from '../../res/scripts/ironballs.vbs?raw'
import joctronic from '../../res/scripts/joctronic.vbs?raw'
import juegos from '../../res/scripts/juegos.vbs?raw'
import juegos2 from '../../res/scripts/juegos2.vbs?raw'
import jvh from '../../res/scripts/jvh.vbs?raw'
import LTD from '../../res/scripts/LTD.vbs?raw'
import LTD3 from '../../res/scripts/LTD3.vbs?raw'
import LTD4a from '../../res/scripts/LTD4a.vbs?raw'
import LTDPecmen from '../../res/scripts/LTDPecmen.vbs?raw'
import lancelot from '../../res/scripts/lancelot.vbs?raw'
import mac from '../../res/scripts/mac.vbs?raw'
import mrgame from '../../res/scripts/mrgame.vbs?raw'
import nuova from '../../res/scripts/nuova.vbs?raw'
import PDB from '../../res/scripts/PDB.vbs?raw'
import Play1 from '../../res/scripts/Play1.vbs?raw'
import Play2 from '../../res/scripts/Play2.vbs?raw'
import Play4 from '../../res/scripts/Play4.vbs?raw'
import p2k from '../../res/scripts/p2k.vbs?raw'
import peyper from '../../res/scripts/peyper.vbs?raw'
import pinheck from '../../res/scripts/pinheck.vbs?raw'
import playbar from '../../res/scripts/playbar.vbs?raw'
import s4 from '../../res/scripts/s4.vbs?raw'
import s6 from '../../res/scripts/s6.vbs?raw'
import s7 from '../../res/scripts/s7.vbs?raw'
import s8_StillCrazy from '../../res/scripts/s8_StillCrazy.vbs?raw'
import s11 from '../../res/scripts/s11.vbs?raw'
import sam from '../../res/scripts/sam.vbs?raw'
import sega from '../../res/scripts/sega.vbs?raw'
import sega2 from '../../res/scripts/sega2.vbs?raw'
import sleic from '../../res/scripts/sleic.vbs?raw'
import solarwars from '../../res/scripts/solarwars.vbs?raw'
import spike1 from '../../res/scripts/spike1.vbs?raw'
import spinball from '../../res/scripts/spinball.vbs?raw'
import stern from '../../res/scripts/stern.vbs?raw'
import sys80 from '../../res/scripts/sys80.vbs?raw'
import taito from '../../res/scripts/taito.vbs?raw'
import tecnoplay from '../../res/scripts/tecnoplay.vbs?raw'
import UltraDMD_Options from '../../res/scripts/UltraDMD_Options.vbs?raw'
import VPMKeys from '../../res/scripts/VPMKeys.vbs?raw'
import WPC from '../../res/scripts/WPC.vbs?raw'
import wpc_ph from '../../res/scripts/wpc_ph.vbs?raw'
import zac from '../../res/scripts/zac.vbs?raw'
import zac1 from '../../res/scripts/zac1.vbs?raw'
import zac2 from '../../res/scripts/zac2.vbs?raw'
import zacproto from '../../res/scripts/zacproto.vbs?raw'

import { ERR } from './stdlib/err.js'

// Browser embeds the committed set (mirror of upstream scripts); lookup is case-insensitive.
const MAP: Record<string, string> = {
	'6803.vbs': _6803,
	'ali.vbs': ALI,
	'atari.vbs': Atari,
	'atari1.vbs': Atari1,
	'atari1b.vbs': Atari1b,
	'atari2.vbs': Atari2,
	'alving.vbs': alving,
	'antar.vbs': antar,
	'b2b.vbs': B2B,
	'b2bcollision.vbs': B2Bcollision,
	'bally.vbs': Bally,
	'ballyg.vbs': BallyG,
	'b2s.vbs': b2s,
	'class1812.vbs': Class1812,
	'capcom.vbs': capcom,
	'controller.vbs': controller,
	'core.vbs': core,
	'de.vbs': de,
	'de2.vbs': de2,
	'fpvpx.vbs': FPVPX,
	'gameplan.vbs': GamePlan,
	'gts1.vbs': gts1,
	'gts3.vbs': gts3,
	'hankin.vbs': Hankin,
	'idsa.vbs': idsa,
	'inder.vbs': inder,
	'inder_atleta.vbs': inder_atleta,
	'inder_centaur.vbs': inder_centaur,
	'inder_skateboard.vbs': inder_skateboard,
	'ironballs.vbs': ironballs,
	'joctronic.vbs': joctronic,
	'juegos.vbs': juegos,
	'juegos2.vbs': juegos2,
	'jvh.vbs': jvh,
	'ltd.vbs': LTD,
	'ltd3.vbs': LTD3,
	'ltd4a.vbs': LTD4a,
	'ltdpecmen.vbs': LTDPecmen,
	'lancelot.vbs': lancelot,
	'mac.vbs': mac,
	'mrgame.vbs': mrgame,
	'nuova.vbs': nuova,
	'pdb.vbs': PDB,
	'play1.vbs': Play1,
	'play2.vbs': Play2,
	'play4.vbs': Play4,
	'p2k.vbs': p2k,
	'peyper.vbs': peyper,
	'pinheck.vbs': pinheck,
	'playbar.vbs': playbar,
	's4.vbs': s4,
	's6.vbs': s6,
	's7.vbs': s7,
	's8_stillcrazy.vbs': s8_StillCrazy,
	's11.vbs': s11,
	'sam.vbs': sam,
	'sega.vbs': sega,
	'sega2.vbs': sega2,
	'sleic.vbs': sleic,
	'solarwars.vbs': solarwars,
	'spike1.vbs': spike1,
	'spinball.vbs': spinball,
	'stern.vbs': stern,
	'sys80.vbs': sys80,
	'taito.vbs': taito,
	'tecnoplay.vbs': tecnoplay,
	'ultradmd_options.vbs': UltraDMD_Options,
	'vpmkeys.vbs': VPMKeys,
	'wpc.vbs': WPC,
	'wpc_ph.vbs': wpc_ph,
	'zac.vbs': zac,
	'zac1.vbs': zac1,
	'zac2.vbs': zac2,
	'zacproto.vbs': zacproto,
}

/** Whether a bundled text file exists. */
export function hasTextFile(fileName: string): boolean {
	return MAP[fileName.replace(/.*[\\/]/, '').toLowerCase()] !== undefined
}

export function getTextFile(fileName: string): string {
	const text = MAP[fileName.replace(/.*[\\/]/, '').toLowerCase()]
	if (text !== undefined) return text
	ERR.Raise(53, 'GetTextFile', `Unable to open ${fileName}`)
	return ''
}
