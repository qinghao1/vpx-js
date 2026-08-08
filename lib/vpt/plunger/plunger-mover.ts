// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import { AssignKey } from '../../game/key-code.js'
import type { Player } from '../../game/player.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import { LineSeg } from '../../physics/line-seg.js'
import type { MoverObject } from '../../physics/mover-object.js'
import { logger } from '../../util/logger.js'
import { Vertex2D } from '../../util/math.js'
import type { TableApi } from '../table/table-api.js'
import { Plunger, type PlungerConfig } from './plunger.js'
import type { PlungerData } from './plunger-data.js'
import type { PlungerState } from './plunger-state.js'

// Mirrors hitplunger.cpp:133 UpdateDisplacements / 278 UpdateVelocities
// headless: mech sensor stubbed to 0, syncs mech plunger via spring (0.95, dt 0.1, 13 norm)
export class PlungerMover implements MoverObject {
	readonly x: number; readonly x2: number; y: number
	readonly lineSegBase = new LineSeg(new Vertex2D(0,0), new Vertex2D(0,0), 0, 0)
	readonly lineSegEnd = new LineSeg(new Vertex2D(0,0), new Vertex2D(0,0), 0, 0)
	readonly lineSegSide = [new LineSeg(new Vertex2D(0,0), new Vertex2D(0,0), 0, 0), new LineSeg(new Vertex2D(0,0), new Vertex2D(0,0), 0, 0)]
	readonly jointBase = [new HitLineZ(new Vertex2D(0,0)), new HitLineZ(new Vertex2D(0,0))]
	readonly jointEnd = [new HitLineZ(new Vertex2D(0,0)), new HitLineZ(new Vertex2D(0,0))]
	private _pos = 0; get pos(){return this._pos} set pos(v:number){this._pos=v; this.state.frame=this.getFrame()}
	speed=0; travelLimit=0; mass=30; reverseImpulse=0; fireBounce=0; scatterVelocity=0
	private pullForce=0; private fireTimer=0; private fireSpeed=0; private autoFireTimer=0; private fStrokeEventsArmed=false
	private readonly restPos:number; readonly frameStart:number; readonly frameEnd:number; private readonly frameLen:number; readonly cFrames:number
	private mech0=0; private mech1=0; private mech2=0
	constructor(cfg: PlungerConfig, private readonly data: PlungerData, private readonly state: PlungerState, private readonly events: EventProxy, private readonly player: Player, private readonly tableApi: TableApi){
		this.x=cfg.x; this.x2=cfg.x2; this.y=cfg.y
		this.frameEnd=cfg.frameTop; this.frameStart=cfg.frameBottom; this.frameLen=cfg.frameBottom-cfg.frameTop
		this.cFrames=cfg.cFrames; this.travelLimit=cfg.frameTop; this.scatterVelocity=data.scatterVelocity
		this.restPos=data.parkPosition; this.pos=cfg.frameTop+this.restPos*this.frameLen
		const z0=cfg.zHeight, z1=cfg.zHeight+Plunger.PLUNGER_HEIGHT
		for(const s of [this.lineSegBase, ...this.lineSegSide, this.lineSegEnd]) s.setZ(z0,z1)
		for(const j of [...this.jointBase, ...this.jointEnd]) j.setZ(z0,z1)
		this.setObjects(this.pos)
	}
	updateDisplacements(dTime:number):void{
		this.pos += dTime*this.speed
		if(this.pos < this.travelLimit) this.pos=this.travelLimit
		const rel=(this.pos-this.frameEnd)/this.frameLen, bounce=this.restPos+this.fireBounce
		if(this.fireTimer!==0 && dTime!==0 && (this.fireSpeed<0 ? rel<=bounce : rel>=bounce)){
			this.pos=this.frameEnd+bounce*this.frameLen; this.fireSpeed*=-0.4; this.fireBounce*=-0.4
		}
		if(this.pos < this.travelLimit) this.pos=this.travelLimit
		if(dTime!==0){
			if(this.pos < this.frameEnd){this.speed=0; this.pos=this.frameEnd}
			else if(this.pos > this.frameStart){this.speed=0; this.pos=this.frameStart}
			if(this.pos < this.travelLimit) this.pos=this.travelLimit
		}
		this.travelLimit=this.frameEnd
		const dx=dTime*this.speed, limit=this.frameLen/50, hyst=limit*2
		if(this.fStrokeEventsArmed && this.pos+dx > this.frameStart-limit){logger().info('[%s] Pulled back.',this.data.getName()); this.events.fireVoidEventParm(Event.LimitEventsBOS, Math.abs(this.speed)); this.fStrokeEventsArmed=false}
		else if(this.fStrokeEventsArmed && this.pos+dx < this.frameEnd+limit){logger().info('[%s] Fired.',this.data.getName()); this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(this.speed)); this.fStrokeEventsArmed=false}
		else if(this.pos>this.frameEnd+hyst && this.pos<this.frameStart-hyst) this.fStrokeEventsArmed=true
		this.setObjects(this.pos)
	}
	updateVelocities():void{
		const pos=(this.pos-this.frameEnd)/this.frameLen, mech=0, dMech=this.mech0-mech, auto=this.data.autoPlunger
		if(this.fireTimer>0){this.speed=this.fireSpeed; --this.fireTimer}
		else if(this.autoFireTimer>0){if(--this.autoFireTimer===0) this.tableApi.fireKeyEvent(Event.GameEventsKeyUp, this.player.getKey(AssignKey.PlungerKey))}
		else if(auto && dMech>0.2){this.tableApi.fireKeyEvent(Event.GameEventsKeyDown, this.player.getKey(AssignKey.PlungerKey)); this.autoFireTimer=101}
		else if(this.pullForce!==0){this.speed+=this.pullForce/this.mass; if(this.pos>=this.frameStart) this.speed=0}
		else if(dMech>0.2){let apex=this.mech0; if(this.mech1>apex) apex=this.mech1; if(this.mech2>apex) apex=this.mech2; this.fire(apex)}
		else{const target=auto?this.restPos:mech, err=target-pos, norm=(this.tableApi.PlungerNormalize??100)/13/100; this.speed=this.speed*0.95 + (err*this.frameLen*this.data.mechStrength/this.mass)*norm*0.1 + this.reverseImpulse}
		this.reverseImpulse=0
		if(mech!==this.mech0){this.mech2=this.mech1; this.mech1=this.mech0; this.mech0=mech}
	}
	pullBack(speed:number):void{this.speed=0; this.pullForce=speed}
	fire(startPos=0):void{
		if(!startPos) startPos=(this.pos-this.frameEnd)/(this.frameStart-this.frameEnd)
		this.pullForce=0; if(startPos<this.restPos) startPos=this.restPos
		this.pos=this.frameEnd+startPos*this.frameLen
		const dx=startPos-this.restPos, norm=(this.tableApi.PlungerNormalize??100)/13/100
		this.fireSpeed=(-this.data.speedFire*dx*this.frameLen/this.mass)*norm
		const bounce=dx<0.5?dx/0.5:1; this.fireBounce=-bounce*this.restPos; this.fireTimer=200
	}
	private setObjects(len:number):void{
		this.lineSegBase.setSeg(this.x,this.y,this.x2,this.y); this.jointBase[0].set(this.x,this.y); this.jointBase[1].set(this.x2,this.y)
		this.lineSegSide[0].setSeg(this.x+0.0001,len,this.x,this.y); this.lineSegSide[1].setSeg(this.x2,this.y,this.x2+0.0001,len)
		this.lineSegEnd.setSeg(this.x2,len,this.x,len); this.jointEnd[0].set(this.x,len); this.jointEnd[1].set(this.x2,len)
	}
	getFrame():number{const f=Math.floor(((this.pos-this.frameStart)/(this.frameEnd-this.frameStart))*(this.cFrames-1)+0.5); return f<0?0:f>=this.cFrames?this.cFrames-1:f}
}
