# Emu overview

`lib/emu/` runs the pinball machine's CPU (ROM emulation) behind the
`IEmulator` interface (`emulator.ts`). Table scripts talk to it through
`Controller` (`lib/scripting/objects/vpm-controller.ts`), never directly.

## Backend selection

`VpmController._loadGame(name)` picks one backend per `GameName`:

- `GamelistDB.getByPinmameName(name)` hits → **wpc-emu** (`wpc-emu.ts`, pure
  JS/TS, WPC machines only). ROM fetched via `rom-fetcher.ts`.
- Otherwise → **PinMAME** (`pinmame/pinmame-emu.ts`, Emscripten build of
  libPinMAME 3.7, everything else: SAM, Whitestar, Data East, ...).
  Without `npm run build:wasm` it degrades to a mock (`wasm/mock/`) that
  accepts input but emulates nothing — physics-only tables still run.

Both adapters feed the same `EmulatorState`, so `ChangedLamps` etc. behave
identically regardless of backend.

## Why the message queue exists

ROM load is async (`fetch` + `initVMwithRom`), but table scripts set switches
synchronously during `Table_Init`. `EmulatorMessageQueue`
(`emulator-message-queue.ts`) buffers `setSwitchInput` / `setCabinetInput` /
`emuSimulateCycle` / DIP calls made before the backend is ready and replays
them once `loadGame` completes. After replay, `addMessage` warns and drops —
a post-init queue write is always a bug in the caller.

## Changed* polling contract

`EmulatorState` (`emulator-state.ts`) keeps `cur` + `last` snapshots of lamps,
solenoids, and GI. Each `getChangedX()` call diffs, latches `last = cur`, and
returns `[[number, state], ...]` (VBS 2-D array shape). Consequences:

- Polling is destructive: a second call with no intervening simulation returns
  empty. Poll once per frame and fan out.
- Numbers are backend-native: WPC matrix numbers under wpc-emu (see below),
  PinMAME indices under PinMAME (`applyPinmame` switches the map to identity).
- `getChangedLEDs` always returns `[]` (unimplemented).

## WPC matrix numbering

WPC hardware wires lamps/switches as an 8×8 matrix addressed
`column*10 + row` (11–18, 21–28, ..., 81–88). `OffsetIndex`
(`offset-index.ts`) converts: `fromWpcMatrix(11).zeroBasedIndex === 0`,
`fromZeroBased(8).wpcMatrixIndex === 21`. Scripts always use matrix numbers;
state arrays are 0-based. PinMAME games are not WPC-numbered.

## DMD flow

Per simulated tick the adapter copies the shaded DMD buffer into
`EmulatorState` (`updateState` for wpc-emu, `pullDmd` for PinMAME).
`getDmdFrame()` returns that snapshot (`Uint8Array`, 128×32 default;
PinMAME reports real dimensions via `getDmdDimensions`). Renderers poll; the
emu never pushes.

## WASM build

PinMAME ships as Emscripten output in `wasm/dist/` (gitignored). See
`wasm/README.md`: `npm run build:wasm` (release), `:debug`, `:mock`.
`pinmame-loader.ts` resolves real-vs-mock at runtime; `isMock === true`
means "input accepted, nothing emulated".

---

# API

## Visual PinMAME Control

### STATS

A quick evaluation of 357 VPX VBS files, showed this amount of API Calls

#### Visual Pinball Calls

- .Switch 9473
- .Lamp 374
- .Dip 16
- .Solenoid 204
- .GIString 0
- .GameName 310
- .Running 0
- .Pause 447
- .Version 278
- .Run 359
- .Stop 453
- .HandleMechanics 292
- .WPCNumbering 0
- .SampleRate 0
- .SplashInfoLine 306
- .ShowFrame 308
- .DoubleSize 3
- .Antialias 0
- .BorderSizeX 0
- .BorderSizeY 0
- .WindowPosX 0
- .WindowPosY 0
- .LockDisplay 1
- .Hidden 270
- .SetDisplayPosition 22
- .ShowOptsDialog 1
- .ShowPathesDialog 0
- .ShowAboutDialog 0
- .CheckROMS 0
- .ChangedLamps 247
- .ChangedSolenoids 2
- .ChangedGI 11
- .ChangedLEDs 56
- .ShowDMDOnly 310
- .HandleKeyboard 286
- .ShowTitle 313

#### Non Visual Pinball Calls

- .SolMask 78
- .B2SSetData 505
- .GetMech 38

### Properties

- GameName, Read/Write: Initializes VPinMAME for game "gameName". Example Controller.GameName = "tz_94h"
- Running, Read Only: Returns True if the emulation is running, False otherwise.
- Pause, Read/Write: Setting this property to True will "Pause" the current emulation. Setting it to false will "Resume" a paused emulation.
- Version, Read Only: Returns the version number of Visual PinMAME as an 8-digit string "vvmmbbrr":

### Methods

- Run(parentWindow, minVersion): Starts Visual PinMAME emulation of game specified with .GameName property.
  parentWindow: handler of window to put outputin. (Default= 0 -> no parent window)
  minVersion: Minimum version of Visual PinMAME (e.g. 100 for 1.00) required to run this game! (Default=any version)
- Stop, Stops Visual PinMAME emulation.

## Game Settings

### Properties

- Dip (Dip Bank Number), Read/Write, Sets/Gets the Dip switch settings for the current game. Dip Bank Number: dip 1-8 = bank 0, dip 9-16 = bank 1 ... value: binary value to set the dips 1=On, 0=Off. Example: Controller.Dip(0) = &H55, Controller.Dip(1) = &Haa
- HandleMechanics, Read/Write, If the game has a PinMAME simulator it can be used to simulate hardware "toys". value: # of which Mechanics VPinMAME should handle. Example: For TZ: 1=Clock, 2=Gumball Machine
- WPCNumbering, Read Only, Determine if game uses WPC Numbering of Switches and Lamps, WPCNumbering = Column*10 + Row (11,12,13,14,15,16,17,18,21,22...), non WPCnumbering = 1,2,3,4,..., Example: If WPCNumbering Then firstSwitch = 1 Else firstSwitch = 11
- SampleRate, Read/Write, Sets/Gets the sample rate, Example: Controller.SampleRate = 22050

## Customization

### Properties

- SplashInfoLine, Read/Write, Game credits to display in startup splash screen. Example: Controller.SplashInfoLine = "Game design by ..."
- ShowFrame, Read/Write, Enabled/Disables the window border, Only works if ShowTitle is set to False!
- DoubleSize, Read/Write, Sets Visual PinMAME window to Double Size or Normal Size. Returns whether Window is Double Size or not.
- Antialias, Enables/disables scan lines/coumns between the dots of the DMD. Default value is True. Returns whether the scanlines are enabled or not. Set this property before the emulation starts.
- BorderSizeX and BorderSizeY, Read/Write, Sets & Gets the size of an empty area around the DMD Display, Default value is 4 Pixels
- WindowPosX and WindowPosY, Read/Write, Sets & Gets the position of the Display Window
- LockDisplay, Read/Write, Sets/Gets the lock state of the display. If the display is locked no keyboard events are handled and the display can't be the active window!
- Hidden, Read/Write, VPM 1.32 or higher, Sets or gets the hidden state of the display. Setting Hidden=True makes the VPM display invisible until it is turned back on with Hidden=False or VPM is restarted. This is useful for applications that want to do the display drawing on their own.

### Methods

- SetDisplayPosition(x,y,hWnd), Sets the position of the display to x and y; if hWnd is a valid window handle, x and y are assumed to be relative to the window, so this function calculates the proper screen position of the display
- ShowOptsDialog(hWnd), Shows the options dialog for the current game or set default options if no game name is set. The hWnd is the handle of the parent window, default is 0 (no parent window).
- ShowPathesDialog(hWnd), Shows the pathes dialog where the user can set the diffrent pathes (ROMS, Cfg, Screenshots). The hWnd is the handle of the parent window, default is 0 (no parent window).
- ShowAboutDialog(hWnd), Displays the About dialog of Visual PinMAME. The hWnd is the handle of the parent window, default is 0 (no parent window).
- CheckROMS(nShowOptions,hWnd), Checks the rom set for the current game and displays the results.
```
nShowOptions:
0 = Allways displays the results
1 = Only displays the results if there are errors found
2 = Never displays the results

Return value is true if the roms are good.
The hWnd is the handle for the parent window, default is 0 (no parent window)

Example:
Controller.CheckROMS(0,hWnd) : Displays the results of the ROM check (hWnd = Handle of a Window)
```

## Aggregate Polling Functions

These properties return a matrix with everything that has changed since the last call.
The array contains the following info
Matrix(0,0) Number of first changed item
Matrix(0,1) New status of first item
Matrix(1,0) Number of second changed item

### Properties

- ChangedLamps, Read Only, Returns which lamps have changed since last call to this property!
- ChangedSolenoids, Read Only, Same as ChangedLamps but for solenoids
- ChangedGI, Read Only, Same as ChangedLamps but for GI strings
- ChangedLEDs, Read Only, Returns changed display digit segments since last call to this property.

## Game Input/Output

### Properties

- Lamp(number), Read Only, Get status of a single lamp, return: True = Lamp on, False = Lamp off
- Solenoid(number), Read Only, Get status of a single solenoid, return: True = Solenoid on, False = Solenoid off
- GIString(number), Read Only, return: True = GI String on, False = GI String off
- Switch(number), Read/Write, setting/returning: True = Switch On, False = Switch Off

## Debugging

### Properties

- ShowDMDOnly, Read/Write, Enable/disable VPinMAME status matrices.
- HandleKeyboard, Read/Write, If set to True, VPinMAME will process the keyboard. Standard MAME keys can be used in VPinMAME output window. Also the internal ball simulator is enabled.
- ShowTitle, Read/Write, Show title bar on VPinMAME output window (to move it around)

## Events

May not be supported in all scripting environments!

- OnSolenoid(solenoidNo, isActive), Called whenever a solenoid changes state
- OnStateChange(newState), Called whenever the emulation is started or stopped (not called on Pause)

---

## Implementation gaps

`VpmController` logs-and-ignores (`stub()`) anything below; scripts calling
them run but get no emulation effect. Ordered by real-world usage (STATS
survey of 357 VBS files above):

| API                                                                      | Status                   | Note                                   |
| ------------------------------------------------------------------------ | ------------------------ | -------------------------------------- |
| `B2SSetData` (505 uses)                                                  | stub                     | Backglass data; no B2S renderer exists |
| `ChangedLEDs` (56 uses)                                                  | returns `[]`             | Alphanumeric segments not modeled      |
| `GetMech` / `Mech` (38 uses)                                             | stub                     | Mechanical toys (TZ clock, gumball)    |
| `HandleMechanics` (292 uses)                                             | stub, accepts value      | Same — nothing dispatches on it        |
| `ShowOpts/ShowPathes/ShowAboutDialog`, `CheckROMS`, `SetDisplayPosition` | stubs                    | Desktop-UI concepts; no window exists  |
| `SampleRate`                                                             | fixed `22050`, no setter | Stored nowhere; audio path ignores it  |
| WPC DIP bank ≠ 0                                                         | ignored                  | `wpc-emu.ts` only models bank 0        |

`GetSwitchInput` on PinMAME reflects the mock map until a real ROM loads.
When closing a gap, update this table and the STATS counts if re-surveyed.
