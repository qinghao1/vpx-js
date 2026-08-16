export * from './input/input-manager.js'
export * from './input/nudge-controller.js'
import { attachKeyboard, attachPointerTouch } from './input/input-manager.js'
import { attachNudgeInput } from './input/nudge-controller.js'
export function attachInput(viewer){ const a=attachKeyboard(viewer); const b=attachPointerTouch(viewer); const c=attachNudgeInput(viewer); return ()=>{a();b();c()} }
