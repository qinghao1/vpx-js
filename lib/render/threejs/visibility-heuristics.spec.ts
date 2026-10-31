// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import * as THREE from 'three'
import { hideCabFlippers, isInCabFlipper, showCabFlippers } from './visibility-heuristics.js'

const named = (name: string): THREE.Object3D => {
	const obj = new THREE.Object3D()
	obj.name = name
	return obj
}

describe('cabinet flipper visibility', () => {
	it('matches both vrcab and vr_cab spellings', () => {
		expect(isInCabFlipper(named('primitive-VRCab_FlipperLeft'))).to.be.true
		expect(isInCabFlipper(named('primitive-VR_CabFlipperLeft'))).to.be.true
		expect(isInCabFlipper(named('primitive-VR_CabFlipperLeftRing'))).to.be.true
		expect(isInCabFlipper(named('primitive-VR-CabFlipperLeft'))).to.be.true
	})

	it('matches a neutral child under a cabinet flipper group', () => {
		const parent = named('primitive-VR_CabFlipperLeft')
		const child = named('mesh')
		parent.add(child)
		expect(isInCabFlipper(child)).to.be.true
		expect(isInCabFlipper(named('mesh'))).to.be.false
	})

	it('leaves real bats alone', () => {
		expect(isInCabFlipper(named('flipper.base-LeftFlipper'))).to.be.false
		expect(isInCabFlipper(named('flipper.rubber-RightFlipper'))).to.be.false
		expect(isInCabFlipper(named('primitive-LM_GI_GI_2_FlipperT5'))).to.be.false
	})

	it('leaves bare cabinet names alone', () => {
		expect(isInCabFlipper(named('VRCab_Cabinet'))).to.be.false
		expect(isInCabFlipper(named('primitive-VR_CabSideRail'))).to.be.false
	})

	it('hide/show round-trips the underscore spelling', () => {
		const root = new THREE.Group()
		const cab = named('primitive-VR_CabFlipperLeft')
		const bat = named('flipper.base-LeftFlipper')
		root.add(cab, bat)
		expect(hideCabFlippers(root)).to.equal(1)
		expect(cab.visible).to.be.false
		expect(bat.visible).to.be.true
		expect(showCabFlippers(root)).to.equal(1)
		expect(cab.visible).to.be.true
	})
})
