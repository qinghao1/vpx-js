# Emu overview

ROM emulation is not done here: PinMAME runs inside the headless vpinball
WASM engine (`lib/wasm/`), which mounts a ROM zip under the table script's
game name (`romMountFileName`). `lib/emu/` only helps users _find_ tables and
ROMs.

## VPS catalog (`vps-catalog.ts`)

Plain TS (no DOM besides `fetch` and the optional IDB cache), used by the
demo's table browser (`demo-browser/src/ui/table-browser.ts`).

- **Source**: the [Virtual Pinball Spreadsheet](https://virtualpinballspreadsheet.github.io/)
  database, `vps-db/db/vpsdb.json` (~8 MB, `access-control-allow-origin: *`)
  plus `vps-db/lastUpdated.json`, a millisecond stamp that changes with it.
- **`parseVpsDb(raw)`** trims the raw array to `VpsGame[]`, sorted by name.
  Fields read per game: `id`, `name`, `manufacturer`, `year`, `tableFiles[]`,
  `romFiles[]`; per file: `id`, `authors`, `version`, `features`, `comment`,
  `tableFormat` (tables, only `VPX` kept), `urls[].url` / `urls[].broken`
  (broken links dropped). For ROM files `version` is the PinMAME set name
  (`twd_160h`), so it matches a table script's `GameName`.
- **`searchVpsGames(games, query)`** — every term must hit name, manufacturer,
  year, or a ROM name; name-prefix matches rank first.
- **`findGamesByRom(games, romName)`** — games listing a ROM set, for
  suggesting downloads once a table is loaded.
- **`loadVpsCatalog({ download, signal })`** — serves the parsed catalog from
  IDB (`lib/util/idb-cache.ts`, key `vps1:catalog`) while the stamp is unchanged
  or unreachable, else downloads, parses, and re-caches. Bump the `vps1` prefix
  whenever the `VpsGame` shape changes. `download` defaults to plain `fetch`;
  the demo passes its progress-reporting fetch.

## What can be downloaded directly

Almost nothing. Catalog URLs point at download _pages_ (vpuniverse.com,
vpforums.org, pinballnirvana.com, sternpinball.com, ...) that are login-gated
and send no CORS headers; the handful of direct `.vpx`/`.zip` links
(`isDirectFileUrl`) are on hosts that also lack CORS or refuse non-browser
requests. The demo therefore probes a direct link before handing it to the
viewer, and otherwise opens the source page in a new tab so the user can
download the file and drop it onto the viewer. VPS carries no ROM checksums,
so downloaded zips are not verified here (the old CRC-32 check went with VPDB).

The former VPDB fetcher (`rom-fetcher.ts`, wpc-emu `GamelistDB` +
`api.vpdb.io`) was removed: VPDB no longer responds.
