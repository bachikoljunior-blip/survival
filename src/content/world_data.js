/**
 * HOLLIS — the authored district.
 *
 * Three neighbourhoods that read differently on sight and play differently on
 * foot:
 *
 *   THE STACKS   north-west. Three housing slabs and the district heat plant.
 *                People still live here. Fires in barrels, washing on lines,
 *                barricaded ground floors. The roofs are linked by planks
 *                because the courtyard fills with blackdamp after dark.
 *
 *   MARROW ST    the centre. The old commercial spine — shopfronts, the
 *                Arcade, fire escapes on every rear elevation. Half evacuated,
 *                half scavenged. Where Bower Street used to meet Marrow there
 *                is now a hole eighteen metres across.
 *
 *   THE CUT      east. The Hollis Reclamation Authority's ground: a trench
 *                excavation, a borehole field, a survey office, and the only
 *                lit, swept, orderly streets left in the city. The air here is
 *                the worst in Hollis and the Authority's people wear masks.
 *
 * The Cinder Line — the surveyed boundary of the burn — is painted across
 * Cinder Road. It has been repainted four times. Each old line is still there
 * under the new one, further west every time.
 */

import { TAU } from '../core/util.js';

const D2R = Math.PI / 180;

/** Helper: a terrace of buildings along a line, with authored variation. */
function terrace(list, opts) {
  const {
    x0, z0, x1, z1, depth, floors, style = 'row', facing = 'pz',
    bays = [], gap = 0.6, idPrefix = 't', names = [], signs = [],
    lit = 0.05, boarded = 0.2, mat = 'brick', shop = true, doors = {},
    avoid = [],
  } = opts;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dz, dx);
  // The building's local +X runs along the street, so its Y rotation is -rot.
  const bRot = -rot;
  // Rotate the local face normal into world space using the *building's*
  // rotation, then push the mass back along it so the detailed elevation ends
  // up flush on the street line.
  const local = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[facing];
  const c = Math.cos(bRot), s = Math.sin(bRot);
  const wnx = local[0] * c - local[1] * s;
  const wnz = local[0] * s + local[1] * c;

  const matList = Array.isArray(mat) ? mat : [mat];
  let cursor = 0;
  let i = 0;
  while (cursor < len - 3) {
    const w = bays.length ? bays[i % bays.length] : 9 + (i % 3) * 3;
    const useW = Math.min(w, len - cursor);
    if (useW < 4) break;
    const t = (cursor + useW / 2) / len;
    const cx = x0 + dx * t;
    const cz = z0 + dz * t;
    const bx = cx - wnx * (depth / 2);
    const bz = cz - wnz * (depth / 2);

    // Leave a hole where a cross street runs through. Terraces are continuous
    // between junctions and absent across them, which is what makes a street
    // grid read as a grid rather than as one very long shed.
    const spanLo = Math.min(cx - useW / 2, cx + useW / 2);
    const spanHi = Math.max(cx - useW / 2, cx + useW / 2);
    let blocked = false;
    for (const [lo, hi] of avoid) {
      if (spanHi > lo && spanLo < hi) { blocked = true; break; }
    }
    if (blocked) { cursor += useW; i++; continue; }

    const id = `${idPrefix}${i}`;
    list.push({
      id,
      name: names[i] || null,
      x: bx, z: bz, w: useW - gap, d: depth,
      rot: bRot,
      floors: Array.isArray(floors) ? floors[i % floors.length] : floors,
      style, mat: matList[i % matList.length], faces: facing, entry: facing,
      shop, lit, boarded,
      // Vary the bay rhythm and parapet height so a terrace never reads as one
      // stamped unit repeated.
      bay: 2.0 + ((i * 7) % 5) * 0.16,
      parapet: 0.6 + ((i * 5) % 4) * 0.22,
      floorH: 3.15 + ((i * 3) % 3) * 0.22,
      signs: signs[i] ? { [facing]: signs[i] } : undefined,
      door: doors[i] || null,
      doorLabel: doors[i] ? names[i] : undefined,
    });
    cursor += useW;
    i++;
  }
  return list;
}

export function buildHollisData() {
  const buildings = [];
  const structures = [];
  const props = [];
  const scatter = [];
  const gasSources = [];
  const covered = [];
  const interactions = [];
  const spawns = [];
  const regions = [];
  const doors = [];

  // =========================================================== MARROW STREET
  // The spine. Runs east–west at z = 0.

  terrace(buildings, {
    x0: -138, z0: -9.5, x1: 18, z1: -9.5, depth: 13, floors: [3, 4, 3, 5, 3],
    facing: 'pz', idPrefix: 'mn',
avoid: [[-108, -92], [-53, -37]], lit: 0.02, boarded: 0.34,
    mat: ['brick', 'brick', 'plaster', 'brick', 'concrete', 'brick'],
    bays: [11, 8, 14, 9, 12, 10],
    names: ['Kestrel & Sons', 'Marrow Chemists', 'The Arcade', 'Vaida Grocers', 'Hollis Loans', 'Bower Hardware',
            'Ferrant Surgery', 'Two Bells', 'Marrow Post', 'Ashfield Cycles', 'Kell Fabrics', 'Reddin Optical'],
    signs: ['KESTREL & SONS', 'CHEMISTS', ['MARROW ARCADE', 'EST. 1911'], 'VAIDA GROCERS', 'HOLLIS LOANS', 'HARDWARE',
            'SURGERY', 'TWO BELLS', 'POST OFFICE', 'CYCLES', 'FABRICS', 'OPTICAL'],
    doors: { 2: 'arcade' },
  });

  terrace(buildings, {
    x0: -138, z0: 9.5, x1: 18, z1: 9.5, depth: 13, floors: [4, 3, 3, 4, 6],
    facing: 'nz', idPrefix: 'ms',
avoid: [[-108, -92], [-53, -37]], lit: 0.03, boarded: 0.3,
    mat: ['brick', 'concrete', 'brick', 'plaster', 'brick'],
    bays: [10, 13, 9, 11, 8, 15],
    names: ['Corliss Works Office', 'Marrow Billiards', 'Wren Street Bakers', 'Hollis Trades Club',
            'Selvin & Vane', 'Marrow Cinema', 'Delph Ironmongers', 'Nine Lamps', ['VASKO', '& CO'], 'Colliery Outfitters'],
    signs: ['CORLISS', 'BILLIARDS', 'BAKERS', ['TRADES CLUB', 'MEMBERS ONLY'], 'SELVIN & VANE',
            ['THE MARROW', 'CINEMA'], 'IRONMONGERS', 'NINE LAMPS', null, 'OUTFITTERS'],
  });

  // --- The Slip: where Bower Street met Marrow, there is now a hole. --------
  // This is the game's first hard lesson in verticality: the street route is
  // gone, the air in the hole is lethal, and the way past is up.
  structures.push({ kind: 'pit', x: -58, z: 0, w: 26, d: 20, depth: 9, rot: 0,
                    gasStrength: 4200, gasId: 'slip' });
  regions.push({ id: 'slip', name: 'The Slip', x: -58, z: 0, w: 34, d: 30, music: 'tense', ambience: 'slip' });

  // Barriers and warnings around the hole.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    props.push({ kind: 'barrier', x: -58 + Math.cos(a) * 16.5, z: Math.sin(a) * 13.5, rot: a + Math.PI / 2, len: 2.0 });
  }
  props.push({ kind: 'sign', x: -58, z: -15.5, rot: 0, w: 2.4, h: 1.2, lift: 1.4,
               text: ['SUBSIDENCE', 'DO NOT APPROACH', 'H.R.A. FIELD OFFICE 2'], accent: '#c8452a' });
  props.push({ kind: 'sign', x: -44, z: 0, rot: -Math.PI / 2, w: 1.8, h: 0.9, lift: 1.3,
               text: ['BOWER ST', 'CLOSED'], weathered: 0.75 });

  // The way over: fire escape up, roofs across, plank bridge, ladder down.
  structures.push({ kind: 'fireescape', x: -74, z: -11.5, rot: 0, floors: 3, y: 3.3, side: 1, width: 1.6 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -70, z0: -16.5, x1: -70, z1: -30.5, y: 10.1, w: 1.1, tag: 'slipbridge' });
  structures.push({ kind: 'bridge', style: 'plank', x0: -66, z0: -16, x1: -44, z1: -16, y: 10.1, w: 1.1 });
  structures.push({ kind: 'ladder', x: -42, z: -13.6, rot: Math.PI / 2, h: 10.1, caged: true });

  // =============================================================== THE STACKS
  // Three slabs around a courtyard, north-west.

  // Laid out around an open courtyard 44 m by 32 m: the slabs shelter it from
  // the street, which is exactly why the blackdamp settles there.
  const slabs = [
    { id: 'pell', name: 'Pell House', x: -112, z: -62, w: 44, d: 12, rot: 0, floors: 7 },
    { id: 'kettle', name: 'Kettle House', x: -112, z: -106, w: 44, d: 12, rot: 0, floors: 6 },
    { id: 'dray', name: 'Dray House', x: -84, z: -84, w: 12, d: 32, rot: 0, floors: 8 },
  ];
  for (const s of slabs) {
    buildings.push({
      ...s, style: 'slab', faces: 'pz,nz,px,nx', lit: 0.14, boarded: 0.24,
      balconies: true, floorH: 2.85,
      door: s.id === 'pell' ? 'pell_lobby' : null,
      doorLabel: s.name, entry: 'pz',
    });
  }
  regions.push({ id: 'stacks', name: 'The Stacks', x: -104, z: -84, w: 84, d: 74, music: 'home', ambience: 'camp' });
  regions.push({ id: 'yard', name: 'Stacks Courtyard', x: -112, z: -84, w: 42, d: 30, music: 'home', ambience: 'camp' });

  // The courtyard camp: this is where people are.
  scatter.push({ id: 'yard', x: -112, z: -84, w: 40, d: 28, character: 'camp', density: 2.6 });
  // Authored anchors so the courtyard reads as a lived-in place, not scatter.
  props.push({ kind: 'tarp', x: -128, z: -76, rot: 0.2, w: 3.0, d: 2.4, h: 1.9 });
  props.push({ kind: 'tarp', x: -124, z: -94, rot: 1.9, w: 2.6, d: 2.2, h: 1.8 });
  props.push({ kind: 'tarp', x: -98, z: -92, rot: -1.2, w: 2.8, d: 2.2, h: 1.8 });
  props.push({ kind: 'mattress', x: -127.4, z: -76.4, rot: 0.2 });
  props.push({ kind: 'mattress', x: -123.6, z: -93.6, rot: 1.9 });
  props.push({ kind: 'crate', x: -119, z: -86, rot: 0.3 });
  props.push({ kind: 'crate', x: -118.2, z: -86.9, rot: 1.1 });
  props.push({ kind: 'trolley', x: -106, z: -88 });
  props.push({ kind: 'bin', x: -103, z: -78 });
  props.push({ kind: 'debris', x: -110, z: -88, r: 5, n: 26 });
  props.push({ kind: 'debris', x: -120, z: -80, r: 4, n: 18 });
  props.push({ kind: 'chair', x: -121.6, z: -78.4, rot: 2.2 });
  props.push({ kind: 'chair', x: -100.5, z: -90, rot: 0.4, fallen: true });
  props.push({ kind: 'pallet', x: -114, z: -92, rot: 0.6 });
  props.push({ kind: 'pallet', x: -113.2, z: -91.4, rot: 0.9 });
  props.push({ kind: 'barrier', x: -96, z: -88, rot: 1.57, len: 2 });
  props.push({ kind: 'covered', x: -130, z: -97, rot: 1.2 });
  props.push({ kind: 'drum', x: -122, z: -78, burning: true, id: 'yard_fire_1' });
  props.push({ kind: 'drum', x: -100, z: -90, burning: true, id: 'yard_fire_2' });
  props.push({ kind: 'drum', x: -110, z: -95, burning: true, id: 'yard_fire_3' });
  props.push({ kind: 'generator', x: -126, z: -92, rot: 0.4 });
  props.push({ kind: 'worklight', x: -120, z: -90, id: 'yard_light' });
  props.push({ kind: 'table', x: -116, z: -78, rot: 0.2, w: 2.4, d: 0.9 });
  props.push({ kind: 'chair', x: -116, z: -76.4, rot: 0.2 });
  props.push({ kind: 'chair', x: -114, z: -79.6, rot: 3.4 });
  props.push({ kind: 'table', x: -104, z: -80, rot: 1.7, w: 1.8, d: 0.8 });
  props.push({ kind: 'shelf', x: -95, z: -76, rot: Math.PI, w: 2.0 });
  props.push({ kind: 'washing', x0: -128, y0: 5.6, z0: -72, x1: -108, y1: 5.4, z1: -72 });
  props.push({ kind: 'washing', x0: -100, y0: 6.4, z0: -94, x1: -92, y1: 6.6, z1: -80 });
  props.push({ kind: 'washing', x0: -130, y0: 8.2, z0: -96, x1: -116, y1: 8.4, z1: -96 });
  props.push({ kind: 'sign', x: -112, z: -70, rot: 0, w: 3.4, h: 1.7, lift: 1.7,
               text: ['THE STACKS', 'WE STAY', 'DOORS SHUT AFTER DARK'],
               bg: '#20180f', accent: '#cfe04f', weathered: 0.4 });
  props.push({ kind: 'sign', x: -90, z: -70, rot: -Math.PI / 2, w: 2.2, h: 1.1, lift: 1.4,
               text: ['FILTERS —', 'ASK SOL FIRST'], bg: '#1c1810', accent: '#cfe04f', weathered: 0.5 });

  // Barricaded ground-floor entrances — the holdouts seal what they can.
  props.push({ kind: 'barricade', x: -112, z: -68.6, rot: 0, len: 9 });
  props.push({ kind: 'barricade', x: -90.6, z: -84, rot: Math.PI / 2, len: 8 });
  props.push({ kind: 'barricade', x: -112, z: -99.4, rot: 0, len: 9 });

  // Roof network across the Stacks. This is the safe route when the yard fills.
  structures.push({ kind: 'fireescape', x: -128, z: -68.6, rot: 0, floors: 6, y: 3.0, side: 1, floorH: 2.85 });
  structures.push({ kind: 'fireescape', x: -96, z: -99.4, rot: Math.PI, floors: 5, y: 3.0, side: 1, floorH: 2.85 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -100, z0: -69.2, x1: -90.6, z1: -69.2, y: 20.05, w: 1.1 });
  structures.push({ kind: 'bridge', style: 'steel', x0: -84, z0: -68.4, x1: -84, z1: -55.4, y: 20.05, w: 1.4 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -100, z0: -99.8, x1: -90.6, z1: -99.8, y: 17.2, w: 1.1 });
  structures.push({ kind: 'ramp', x0: -84, z0: -100.2, y0: 22.9, x1: -84, z1: -104, y1: 17.2, w: 1.6, mat: 'metal' });
  structures.push({ kind: 'scaffold', x: -134, z: -84, rot: 0, w: 4, d: 4, levels: 9 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -134, z0: -80, x1: -134, z1: -68.6, y: 18.05, w: 1.1 });

  scatter.push({ id: 'pellroof', x: -112, z: -62, w: 38, d: 7, character: 'roof', density: 0.9, y: 20.05 });
  scatter.push({ id: 'kettleroof', x: -112, z: -106, w: 38, d: 7, character: 'roof', density: 0.9, y: 17.2 });
  scatter.push({ id: 'drayroof', x: -84, z: -84, w: 7, d: 26, character: 'roof', density: 0.9, y: 22.9 });

  // District heat plant, north edge — the reason the Stacks still have hot water.
  buildings.push({
    id: 'heatplant', name: 'Hollis District Heat', style: 'works',
    x: -46, z: -118, w: 34, d: 24, rot: 0, h: 11, faces: 'pz,px',
    doorFace: 'pz', door: 'boiler', lit: 0.04,
    signs: { pz: ['HOLLIS DISTRICT HEAT', 'STATION 3'] },
  });
  props.push({ kind: 'sign', x: -46, z: -104, rot: 0, w: 4.2, h: 1.1, lift: 3.2, post: false,
               text: ['HOLLIS DISTRICT HEAT — STATION 3'], accent: '#8fb4c4' });
  structures.push({ kind: 'pipe', x0: -63, y0: 4.2, z0: -114, x1: -63, y1: 4.2, z1: -80, r: 0.34, mat: 'rust', solid: true });
  structures.push({ kind: 'pipe', x0: -63, y0: 4.2, z0: -80, x1: -96, y1: 4.2, z1: -80, r: 0.34, mat: 'rust', solid: true });
  structures.push({ kind: 'ladder', x: -63, z: -78.4, rot: 0, h: 4.2 });
  scatter.push({ id: 'plantyard', x: -46, z: -100, w: 30, d: 8, character: 'industrial', density: 1.1 });

  // ================================================================= THE CUT
  // The Authority's ground: trench, boreholes, survey office. East.

  regions.push({ id: 'cut', name: 'The Cut', x: 86, z: 0, w: 116, d: 130, music: 'authority', ambience: 'cut' });

  // The trench itself: a long excavation, the Authority's showpiece.
  structures.push({ kind: 'pit', x: 96, z: 6, w: 62, d: 18, depth: 11, rot: 0,
                    gasStrength: 5200, gasId: 'trench' });
  // Crossings: one gantry, one earth ramp at the east end.
  structures.push({ kind: 'bridge', style: 'steel', x0: 74, z0: -4, x1: 74, z1: 16, y: 0.4, w: 2.2, tag: 'trench_gantry' });
  structures.push({ kind: 'ramp', x0: 128, z0: 6, y0: 0, x1: 118, z1: 6, y1: -10.8, w: 4.0, mat: 'rubble' });

  buildings.push({
    id: 'survey', name: 'H.R.A. Field Office 2', style: 'civic',
    x: 62, z: -46, w: 26, d: 18, rot: 0, floors: 3, floorH: 3.6,
    faces: 'pz,nx', entry: 'pz', door: 'survey', lit: 0.4, boarded: 0.0,
    doorLabel: 'H.R.A. Field Office 2',
  });
  props.push({ kind: 'sign', x: 62, z: -36.4, rot: 0, w: 5.2, h: 1.3, lift: 3.0, post: false,
               text: ['HOLLIS RECLAMATION AUTHORITY', 'FIELD OFFICE 2 — RESTRICTED'],
               bg: '#12161a', fg: '#dbe4ea', accent: '#6fa8bd', weathered: 0.2 });
  props.push({ kind: 'worklight', x: 54, z: -36, id: 'survey_light_a' });
  props.push({ kind: 'worklight', x: 70, z: -36, id: 'survey_light_b' });
  props.push({ kind: 'van', x: 48, z: -30, rot: 0.1 });
  props.push({ kind: 'barrier', x: 62, z: -32, rot: 0, len: 2 });
  props.push({ kind: 'barrier', x: 58, z: -32, rot: 0, len: 2 });
  props.push({ kind: 'barrier', x: 66, z: -32, rot: 0, len: 2 });
  scatter.push({ id: 'surveyyard', x: 62, z: -26, w: 30, d: 10, character: 'industrial', density: 0.9 });

  // Vent field 9 — the borehole array. The worst air in Hollis outside the
  // trench, and the most beautiful thing in it at night.
  regions.push({ id: 'ventfield', name: 'Vent Field 9', x: 104, z: -74, w: 60, d: 52, music: 'dread', ambience: 'vents' });
  const ventGrid = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const x = 82 + i * 11 + ((j % 2) * 4);
      const z = -94 + j * 13;
      ventGrid.push({ x, z });
      props.push({ kind: 'vent', x, z, hot: true, gasStrength: 1500, gasRadius: 15, id: `vent_${i}_${j}` });
    }
  }
  props.push({ kind: 'sign', x: 82, z: -56, rot: 0, w: 3.2, h: 1.6, lift: 1.5,
               text: ['VENT FIELD 9', 'RESPIRATOR REQUIRED', 'BEYOND THIS POINT'],
               accent: '#c8452a', weathered: 0.35 });
  scatter.push({ id: 'ventscatter', x: 104, z: -74, w: 52, d: 46, character: 'industrial', density: 0.55 });

  // Authority compound sheds along Cinder Road.
  buildings.push({ id: 'cut_shed_a', name: 'Plant Store', style: 'works', x: 44, z: 44, w: 22, d: 16, rot: 0, h: 7.5, faces: 'nz,nx', doorFace: 'nz', lit: 0.05 });
  buildings.push({ id: 'cut_shed_b', name: 'Sample Store', style: 'works', x: 44, z: 68, w: 18, d: 14, rot: 0, h: 6.5, faces: 'nz,nx', doorFace: 'nz', lit: 0.02 });
  buildings.push({ id: 'cut_office', name: 'Weighbridge', style: 'row', x: 78, z: 46, w: 14, d: 11, rot: 0, floors: 2, faces: 'nz,nx', shop: false, lit: 0.1 });
  scatter.push({ id: 'cutyard', x: 60, z: 56, w: 44, d: 24, character: 'industrial', density: 1.2 });

  // The Cinder Line itself, repainted across Cinder Road every quarter.
  //
  // i = 0 is the OLDEST and the most weathered, and it sits furthest EAST;
  // each repaint steps west. Teo's line — "same road, further west every time"
  // — and the memorial both depend on that reading, and an earlier version had
  // it inverted, which made the fire look as though it were retreating.
  const CINDER_YEARS = [2019, 2020, 2021, 2022, 2023];
  for (let i = 0; i < CINDER_YEARS.length; i++) {
    const newest = i === CINDER_YEARS.length - 1;
    const x = 32 - i * 3.4;                       // oldest east, newest west
    props.push({
      kind: 'sign', x, z: -2 + i * 0.2, rot: -Math.PI / 2, w: 0.9, h: 0.45, lift: 0.9,
      text: [`${CINDER_YEARS[i]}`], weathered: 0.78 - i * 0.16, border: false,
      accent: newest ? '#ff7a2f' : '#8a7a64', post: true,
    });
    // The marker post is a label on a painted stripe; the stripe is the thing
    // you actually read from a moving camera, so it goes across the road.
    props.push({
      kind: 'roadstripe', x, z: 6, w: 0.5, d: 26, rot: 0,
      colour: newest ? '#d86a2a' : '#6d6154', wear: 0.78 - i * 0.16,
    });
  }
  props.push({ kind: 'sign', x: 25, z: -12, rot: 0, w: 3.6, h: 1.8, lift: 1.6,
               text: ['CINDER LINE', 'SURVEYED BOUNDARY OF', 'SUBSURFACE COMBUSTION', 'H.R.A. — REVISED QUARTERLY'],
               accent: '#ff7a2f', weathered: 0.25 });
  regions.push({ id: 'cinderroad', name: 'Cinder Road', x: 25, z: 10, w: 20, d: 100, music: 'liminal', ambience: 'road' });

  // ========================================================== SOUTH / EVACUATED
  regions.push({ id: 'southmarrow', name: 'South Marrow', x: -60, z: 54, w: 150, d: 76, music: 'lonely', ambience: 'empty' });

  terrace(buildings, {
    x0: -130, z0: 45.5, x1: 12, z1: 45.5, depth: 12, floors: [3, 2, 4, 3],
    facing: 'nz', idPrefix: 'sm',
avoid: [[-108, -92], [-53, -37]], lit: 0.0, boarded: 0.5, shop: true,
    mat: ['brick', 'plaster', 'brick', 'brick', 'concrete'],
    bays: [12, 9, 15, 10],
    names: ['Fenn Street Laundry', 'Ashall Motors', 'Coldharbour Rooms', 'Vane Street Chapel',
            'The Weigh House', 'Bek & Daughter', 'Hollis Tyres'],
    signs: ['LAUNDRY', 'MOTORS', 'ROOMS TO LET', 'CHAPEL', 'WEIGH HOUSE', ['BEK', '& DAUGHTER'], 'TYRES'],
    doors: { 5: 'bek' },
  });

  terrace(buildings, {
    x0: -130, z0: 76.5, x1: 12, z1: 76.5, depth: 14, floors: [2, 3, 2],
    facing: 'pz', idPrefix: 'sf',
avoid: [[-108, -92], [-53, -37]], lit: 0.0, boarded: 0.62, shop: false,
    mat: ['brick', 'concrete', 'plaster'],
    bays: [16, 11, 20],
  });

  scatter.push({ id: 'southst', x: -60, z: 56, w: 140, d: 22, character: 'evacuated', density: 1.35 });
  scatter.push({ id: 'southrubble', x: -108, z: 62, w: 40, d: 20, character: 'rubble', density: 1.1 });

  // Collapsed terrace — a whole row came down when the ground moved.
  structures.push({ kind: 'rubble', x: -96, z: 46, r: 9, h: 4.2 });
  structures.push({ kind: 'rubble', x: -84, z: 48, r: 7, h: 3.4 });
  structures.push({ kind: 'rubble', x: -106, z: 44, r: 6, h: 2.8 });
  props.push({ kind: 'covered', x: -90, z: 52, rot: 0.4 });
  props.push({ kind: 'covered', x: -87, z: 53.6, rot: 0.2 });
  props.push({ kind: 'sign', x: -92, z: 40, rot: 0, w: 2.6, h: 1.3, lift: 1.4,
               text: ['CELLAR ROW', '14 MARCH', 'THEY WERE TOLD IT WAS SAFE'],
               bg: '#181410', accent: '#cfe04f', weathered: 0.5, border: false });
  interactions.push({ id: 'cellar_row_memorial', kind: 'examine', x: -92, y: 1.4, z: 40,
                      label: 'Read', prompt: 'Read the board', topic: 'cellar_row' });
  // Nessa's dropped filter bag: how the player learns she has not come back.
  interactions.push({ id: 'nessa_bag', kind: 'examine', x: -92, y: 1.0, z: 47,
                      label: "A filter bag", prompt: 'Look at the bag', topic: 'nessa_bag',
                      startsQuest: 'nessaRun' });

  // ================================================================= STREETS
  const streets = [
    { x0: -145, z0: 0, x1: 34, z1: 0, width: 12, kind: 'arterial' },
    { x0: -100, z0: -120, x1: -100, z1: 60, width: 9 },
    { x0: -45, z0: -112, x1: -45, z1: 88, width: 9 },
    { x0: 25, z0: -100, x1: 25, z1: 92, width: 14, kind: 'arterial' },
    { x0: -72, z0: -101, x1: -20, z1: -101, width: 10 },
    { x0: -72, z0: -101, x1: -72, z1: -30, width: 8 },
    { x0: 25, z0: -30, x1: 140, z1: -30, width: 12 },
    { x0: -132, z0: 56, x1: 26, z1: 56, width: 10 },
    { x0: -132, z0: 88, x1: 20, z1: 88, width: 9 },
    { x0: 30, z0: 56, x1: 132, z1: 56, width: 10 },
    { x0: 116, z0: -100, x1: 116, z1: 40, width: 9 },
    
  ];

  // ================================================================== LIGHTS
  // Street lamps: only some still work, and where they work tells a story —
  // the Authority's roads are lit, the Stacks light themselves, and Marrow is
  // dark except where somebody has spliced into a supply.
  for (let x = -138; x <= 20; x += 26) {
    props.push({ kind: 'lamp', x, z: -7.6, lit: x > -40 && x < 30, rot: Math.PI / 2 });
    props.push({ kind: 'lamp', x: x + 13, z: 7.6, lit: false, rot: -Math.PI / 2 });
  }
  for (let z = -96; z <= 84; z += 22) {
    props.push({ kind: 'lamp', x: 17.4, z, lit: true, rot: 0 });
  }
  for (let z = -110; z <= -40; z += 24) {
    props.push({ kind: 'lamp', x: -95.6, z, lit: z > -80, rot: 0 });
  }
  for (let x = 34; x <= 132; x += 24) {
    props.push({ kind: 'lamp', x, z: -37.6, lit: true, rot: Math.PI / 2 });
  }
  for (let x = -128; x <= 18; x += 30) {
    props.push({ kind: 'lamp', x, z: 49.6, lit: false, rot: Math.PI / 2 });
  }

  // ============================================================ STREET LIFE
  // Wrecked and abandoned vehicles, placed to shape movement rather than
  // sprinkled: they make cover, choke points and sightline breaks.
  const cars = [
    [-130, -4, 0.1], [-118, 4, 3.2], [-108, -3.4, 0.3], [-92, 3.8, 3.0],
    [-80, -4.2, 0.2], [-36, 3.4, 3.1], [-24, -4, 0.05], [-12, 4.2, 3.2],
    [2, -3.8, 0.4], [14, 3.6, 3.0],
    [-95.6, -50, 1.6], [-95.6, -26, 1.5], [-95.6, 12, 1.55],
    [-45, 30, 1.6], [-45, 68, 1.58],
    [-120, 52, 0.2], [-104, 60, 3.0], [-70, 52, 0.15], [-52, 60, 3.1], [-18, 52, 0.1],
    [-120, 84, 0.1], [-66, 84, 3.1],
  ];
  for (const [x, z, r] of cars) props.push({ kind: 'car', x, z, rot: r });
  props.push({ kind: 'van', x: -66, z: -4, rot: 0.08 });
  props.push({ kind: 'van', x: -100, z: 56, rot: 1.6 });

  // Dumpsters in the rear alleys and against shopfronts.
  for (const [x, z, r] of [[-126, -12, 0], [-102, 12, 0], [-64, -12, 0], [-20, 12, 0],
                           [8, -12, 0], [-110, 49, 0], [-40, 49, 0], [50, -34, 0]]) {
    props.push({ kind: 'dumpster', x, z, rot: r });
  }

  scatter.push({ id: 'marrow_n', x: -60, z: -4.5, w: 156, d: 6, character: 'street', density: 1.25 });
  scatter.push({ id: 'marrow_s', x: -60, z: 4.5, w: 156, d: 6, character: 'street', density: 1.25 });
  scatter.push({ id: 'kell', x: -100, z: -30, w: 8, d: 88, character: 'street', density: 0.9 });
  scatter.push({ id: 'dray_st', x: -45, z: 30, w: 8, d: 100, character: 'evacuated', density: 1.0 });
  scatter.push({ id: 'cinder_st', x: 25, z: 0, w: 12, d: 180, character: 'industrial', density: 0.5 });

  // Rear-elevation fire escapes along Marrow — the vertical grid of the centre.
  for (let i = 0; i < 7; i++) {
    const x = -128 + i * 22;
    structures.push({ kind: 'fireescape', x, z: -22.5, rot: Math.PI, floors: 3, y: 3.3, side: 1 });
  }
  for (let i = 0; i < 5; i++) {
    const x = -110 + i * 26;
    structures.push({ kind: 'fireescape', x, z: 22.5, rot: 0, floors: 3, y: 3.3, side: 1 });
  }
  // Roof-to-roof crossings over Marrow's rear alleys.
  structures.push({ kind: 'bridge', style: 'plank', x0: -128, z0: -23.6, x1: -128, z1: -32.4, y: 10.1, w: 1.1 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -106, z0: -23.6, x1: -106, z1: -32.4, y: 10.1, w: 1.1 });
  structures.push({ kind: 'bridge', style: 'plank', x0: -18, z0: 23.6, x1: -18, z1: 32.4, y: 10.1, w: 1.1 });
  structures.push({ kind: 'bridge', style: 'steel', x0: -3, z0: -9.5, x1: -3, z1: 9.5, y: 13.6, w: 1.6, tag: 'marrow_span' });

  scatter.push({ id: 'marrowroof_n', x: -60, z: -16, w: 150, d: 10, character: 'roof', density: 0.55, y: 10.05 });
  scatter.push({ id: 'marrowroof_s', x: -60, z: 16, w: 150, d: 10, character: 'roof', density: 0.55, y: 10.05 });

  // ==================================================== AIR: ambient sources
  // Cellars and drains breathe all over Marrow. These are what make the
  // low ground genuinely dangerous rather than decoratively hazy.
  const seeps = [
    [-124, 14, 700], [-86, -14, 900], [-52, 14, 800], [-30, -14, 650],
    [-6, 14, 720], [-112, 52, 950], [-72, 60, 880], [-30, 84, 760],
    [-92, 48, 1400], [-100, -34, 520], [-45, -60, 600],
  ];
  for (const [x, z, s] of seeps) gasSources.push({ x, z, strength: s, radius: 17 });
  // The Stacks courtyard fills at night: this source is toggled by the story.
  gasSources.push({ x: -112, z: -84, strength: 1100, radius: 26, id: 'yard_seep', active: false });

  covered.push({ x: -46, z: -118, w: 34, d: 24, amount: 0.85 });   // heat plant
  covered.push({ x: -58, z: 0, w: 26, d: 20, amount: 0.4 });       // the Slip

  // ================================================================= SPAWNS
  spawns.push({ id: 'start', x: -112, z: -84, y: 0, rot: 0 });
  spawns.push({ id: 'marrow_west', x: -128, z: 0, y: 0, rot: 0 });
  spawns.push({ id: 'arcade_out', x: -104.5, z: -6.5, y: 0, rot: Math.PI });
  spawns.push({ id: 'stacks_yard', x: -96, z: -78, y: 0, rot: Math.PI });
  spawns.push({ id: 'cinder_road', x: 25, z: -10, y: 0, rot: Math.PI });
  spawns.push({ id: 'survey_out', x: 62, z: -34, y: 0, rot: Math.PI });
  spawns.push({ id: 'ventfield', x: 82, z: -60, y: 0, rot: Math.PI });
  spawns.push({ id: 'south_marrow', x: -60, z: 52, y: 0, rot: 0 });
  spawns.push({ id: 'plant_out', x: -46, z: -102, y: 0, rot: Math.PI });
  spawns.push({ id: 'slip_east', x: -40, z: 0, y: 0, rot: Math.PI });
  spawns.push({ id: 'bek_out', x: -34, z: 40, y: 0, rot: 0 });
  spawns.push({ id: 'trench_edge', x: 74, z: 20, y: 0, rot: Math.PI });

  // ============================================================== INTERIORS
  // Built in a reserved strip east of the city and reached by a fade through
  // a door. See City._buildInteriors for why.

  const interiors = [
    // ---------------------------------------------------------- the Arcade
    {
      id: 'arcade', ox: 600, oz: 0, w: 26, d: 11, h: 4.6,
      wallMat: 'brick', floorMat: 'tile', ceilMat: 'plaster', mood: 'interior',
      walls: [
        { x: -3, z: -3.4, w: 8, d: 0.3, h: 2.6 },
        { x: 6, z: -3.4, w: 7, d: 0.3, h: 2.6 },
        { x: -3, z: 3.4, w: 8, d: 0.3, h: 2.6 },
      ],
      props: [
        { kind: 'shelf', x: -3, z: -3.0, rot: 0, w: 2.4 },
        { kind: 'shelf', x: 0.2, z: -3.0, rot: 0, w: 2.4 },
        { kind: 'shelf', x: 6, z: -3.0, rot: 0, w: 2.4 },
        { kind: 'table', x: -8.5, z: 0, rot: Math.PI / 2, w: 2.6, d: 1.0 },
        { kind: 'crate', x: -10.6, z: -2.4 }, { kind: 'crate', x: -10.2, z: -3.1 },
        { kind: 'crate', x: -10.6, z: 2.4 },
        { kind: 'drum', x: 10.5, z: -3.4, burning: true, id: 'arcade_fire' },
        { kind: 'locker', x: -12.2, z: 0, rot: Math.PI / 2, h: 1.9, w: 1.1 },
        { kind: 'chair', x: -7.2, z: 1.2, rot: 2.4 },
        { kind: 'bench', x: 4, z: 3.0, rot: 0 },
        { kind: 'debris', x: 9, z: 1.5, r: 3, n: 12 },
        { kind: 'paper', x: -8, z: 1.6, r: 1.6, n: 9 },
        { kind: 'trolley', x: 8, z: 2.6 },
      ],
      lights: [
        { x: -9, z: 0, w: 0.7, d: 0.35, kind: 'work', id: 'arcade_l1' },
        { x: 0, z: 0, w: 0.7, d: 0.35, id: 'arcade_l2' },
        { x: 9, z: 0, w: 0.7, d: 0.35, id: 'arcade_l3' },
      ],
      signs: [
        { x: -8.5, z: -5.2, rot: 0, w: 3.2, h: 0.9, lift: 2.0, post: false,
          text: ['FILTER EXCHANGE', 'SALVAGE ONLY — NO CREDIT'], accent: '#cfe04f', weathered: 0.4 },
        { x: 9, z: 5.2, rot: Math.PI, w: 2.6, h: 1.3, lift: 1.9, post: false,
          text: ['MARROW ARCADE', 'EST. 1911'], weathered: 0.7 },
      ],
      spawns: [
        { id: 'arcade_in', x: -12, z: 4.2, rot: Math.PI * 0.75 },
        { id: 'npc_teo', x: -8.5, z: -1.6, rot: Math.PI },
      ],
      exit: { x: -12.6, z: 5.35, rot: 0, to: 'arcade_out', prompt: 'Out to Marrow Street' },
      ppm: 40,
    },

    // ------------------------------------------------------ H.R.A. office
    {
      id: 'survey', ox: 660, oz: 0, w: 18, d: 14, h: 3.2,
      wallMat: 'plaster', floorMat: 'tile', ceilMat: 'plaster', mood: 'interior',
      walls: [
        { x: 2.5, z: -1.5, w: 0.3, d: 11, h: 3.2 },
        { x: 6.5, z: 3.2, w: 8, d: 0.3, h: 3.2 },
      ],
      props: [
        { kind: 'table', x: -4, z: -3.5, rot: 0, w: 2.6, d: 1.1 },
        { kind: 'table', x: -4, z: 0.5, rot: 0, w: 2.6, d: 1.1 },
        { kind: 'chair', x: -4, z: -2.2, rot: Math.PI },
        { kind: 'chair', x: -4, z: 1.8, rot: Math.PI },
        { kind: 'locker', x: -8, z: -4.5, rot: Math.PI / 2, w: 1.2 },
        { kind: 'locker', x: -8, z: -3.0, rot: Math.PI / 2, w: 1.2, open: true },
        { kind: 'shelf', x: -8, z: 2.0, rot: Math.PI / 2, w: 2.6 },
        { kind: 'paper', x: -4, z: -1.4, r: 2.4, n: 22 },
        { kind: 'table', x: 6, z: -4, rot: 0, w: 2.2, d: 1.1 },
        { kind: 'chair', x: 6, z: -2.6, rot: Math.PI },
        { kind: 'locker', x: 8, z: -1.0, rot: -Math.PI / 2, w: 1.0 },
        { kind: 'bin', x: 7.6, z: -5.4 },
        { kind: 'crate', x: 5, z: 5 }, { kind: 'crate', x: 6, z: 5.4 },
      ],
      lights: [
        { x: -4, z: -2, w: 1.1, d: 0.3, id: 'survey_l1' },
        { x: -4, z: 2.4, w: 1.1, d: 0.3, id: 'survey_l2' },
        { x: 6, z: -3, w: 1.1, d: 0.3, id: 'survey_l3' },
        { x: 6.2, z: -4.2, y: 0.85, w: 0.3, d: 0.2, kind: 'screen', id: 'survey_screen' },
      ],
      signs: [
        { x: -8.7, z: 0, rot: Math.PI / 2, w: 3.0, h: 1.5, lift: 1.6, post: false,
          text: ['CINDER LINE', 'Q4 — PUBLISHED', 'DO NOT AMEND'], bg: '#12161a', accent: '#6fa8bd', weathered: 0.12 },
      ],
      interactions: [
        { id: 'trench_order', kind: 'take', x: 8, z: -1.0, y: 1.2, label: 'Second drawer',
          prompt: 'Open the second drawer', item: 'trenchOrder', once: true },
        { id: 'survey_board', kind: 'examine', x: -8.4, z: 0, y: 1.5, label: 'Read',
          prompt: 'Read the published line', topic: 'published_line' },
      ],
      spawns: [
        { id: 'survey_in', x: -7.5, z: 5.2, rot: Math.PI * 0.9 },
        { id: 'survey_back_in', x: 7.4, z: 4.6, rot: Math.PI * 0.05 },
        { id: 'npc_krajcik', x: 6, z: -5.0, rot: Math.PI },
      ],
      exit: { x: -8.2, z: 6.85, rot: 0, to: 'survey_out', prompt: 'Out to the yard' },
      ppm: 30,
    },

    // ------------------------------------------------- Vent 9 instrument hut
    {
      id: 'hut', ox: 712, oz: 0, w: 6.5, d: 5.5, h: 2.6,
      wallMat: 'corrugated', floorMat: 'wood', ceilMat: 'corrugated', mood: 'interior',
      props: [
        { kind: 'shelf', x: -2.6, z: 0, rot: Math.PI / 2, w: 3.4 },
        { kind: 'table', x: 1.6, z: -1.6, rot: 0, w: 2.0, d: 0.9 },
        { kind: 'locker', x: 2.6, z: 1.4, rot: -Math.PI / 2, w: 0.9 },
        { kind: 'paper', x: 1.6, z: -0.6, r: 1.4, n: 14 },
        { kind: 'debris', x: 0, z: 1.5, r: 2, n: 8 },
      ],
      lights: [{ x: 0, z: 0, w: 0.5, d: 0.25, id: 'hut_l1' }],
      signs: [
        { x: -3.15, z: 0, rot: Math.PI / 2, w: 2.0, h: 1.0, lift: 1.5, post: false,
          text: ['FIELD 9', 'INSTRUMENT HUT', 'LOGS — WEEKLY'], accent: '#6fa8bd', weathered: 0.5 },
      ],
      interactions: [
        { id: 'borehole_log', kind: 'take', x: 1.6, z: -1.6, y: 1.1, label: 'Borehole log',
          prompt: 'Take the borehole log', item: 'logbook', once: true },
      ],
      spawns: [{ id: 'hut_in', x: -1.8, z: 2.0, rot: Math.PI } ],
      exit: { x: -2.0, z: 2.9, rot: 0, to: 'hut_out', prompt: 'Out to the field' },
      ppm: 260,
    },

    // ------------------------------------------ Bek & Daughter, South Marrow
    {
      id: 'bek', ox: 760, oz: 0, w: 12, d: 9, h: 3.6,
      wallMat: 'brick', floorMat: 'concrete', ceilMat: 'corrugated', mood: 'interior',
      props: [
        { kind: 'car', x: 2, z: -1, rot: 0.1, burnt: false },
        { kind: 'shelf', x: -5, z: -2, rot: Math.PI / 2, w: 3.0 },
        { kind: 'table', x: -4, z: 2.4, rot: 0, w: 2.0, d: 0.9 },
        { kind: 'drum', x: 5, z: 3, burning: true, id: 'bek_fire' },
        { kind: 'crate', x: -5, z: 3.4 }, { kind: 'crate', x: -4.2, z: 3.6 },
        { kind: 'mattress', x: -4.6, z: 0.4, rot: 1.57 },
        { kind: 'debris', x: 0, z: 3, r: 3, n: 12 },
      ],
      lights: [{ x: -2, z: 1, w: 0.6, d: 0.3, id: 'bek_l1' }],
      signs: [
        { x: -5.9, z: 0, rot: Math.PI / 2, w: 2.4, h: 1.2, lift: 2.0, post: false,
          text: ['BEK', '& DAUGHTER'], weathered: 0.6 },
      ],
      spawns: [
        { id: 'bek_in', x: -4.5, z: 3.8, rot: Math.PI * 0.9 },
        { id: 'npc_garage', x: -1.0, z: 2.2, rot: Math.PI * 0.7 },
      ],
      exit: { x: -4.8, z: 4.35, rot: 0, to: 'bek_out', prompt: 'Out to Fenn Street' },
      ppm: 240,
    },

    // ----------------------------------------------- Pell House, ground floor
    {
      id: 'pell', ox: 808, oz: 0, w: 20, d: 8, h: 2.85,
      wallMat: 'plaster', floorMat: 'tile', ceilMat: 'plaster', mood: 'interior',
      walls: [
        { x: -2, z: 0.4, w: 0.3, d: 6.5 },
        { x: 5, z: -1.4, w: 6, d: 0.3 },
      ],
      props: [
        { kind: 'locker', x: -8, z: -3.2, rot: 0, w: 1.2, fallen: true },
        { kind: 'mattress', x: -6, z: 2.4, rot: 0.2 },
        { kind: 'mattress', x: -3.4, z: 2.6, rot: -0.3 },
        { kind: 'crate', x: 0.6, z: -2.8 },
        { kind: 'table', x: 3, z: 2, rot: 0, w: 1.8, d: 0.8 },
        { kind: 'chair', x: 3, z: 3.1, rot: Math.PI },
        { kind: 'debris', x: 7, z: 0, r: 3, n: 14 },
        { kind: 'shelf', x: 8.6, z: 2, rot: -Math.PI / 2, w: 2.4 },
      ],
      lights: [
        { x: -6, z: 0, w: 0.6, d: 0.3, id: 'pell_l1' },
        { x: 4, z: 0, w: 0.6, d: 0.3, id: 'pell_l2' },
      ],
      spawns: [
        { id: 'pell_in', x: -8.6, z: 3.2, rot: Math.PI * 0.9 },
        { id: 'crisis_a', x: 2, z: -2.6, rot: 0 },
        { id: 'crisis_b', x: 7, z: 2.4, rot: Math.PI },
      ],
      exit: { x: -9.0, z: 3.85, rot: 0, to: 'pell_out', prompt: 'Out to the courtyard' },
      ppm: 45,
    },
  ];

  // Exterior doors that lead into the interiors above.
  // Ren's father's shop. Not a quest, not a key, not a reward — a sign on a
  // street she has to walk down four times.
  interactions.push({
    id: 'vasko_shop', kind: 'examine', x: -66, y: 1.5, z: -12.4,
    label: 'VASKO & CO', prompt: 'Look at the sign', topic: 'vasko_shop', range: 3.0,
  });

  interactions.push(
    { id: 'door_arcade', kind: 'door', x: -104.5, y: 1.1, z: -8.4, label: 'Marrow Arcade',
      prompt: 'Enter the Arcade', target: 'arcade_in', interiorId: 'arcade', range: 2.6 },
    { id: 'survey_door', kind: 'door', x: 62, y: 1.1, z: -36.6, label: 'H.R.A. Field Office 2',
      prompt: 'Enter the field office', target: 'survey_in', interiorId: 'survey', range: 2.8,
      locked: true, lockedPrompt: 'Locked — pass reader',
      unlockIf: { item: 'keySurvey' } },
    // Iris either gives you a pass for the front door or tells you about the
    // rusted hasp on the north elevation. They were the same door, so her
    // refusal cost nothing and her sacrifice bought nothing. They are two
    // doors now, and the back way puts you in the file room, not the lobby.
    { id: 'survey_backdoor', kind: 'door', x: 55.4, y: 1.1, z: -44, label: 'Service door — north elevation',
      prompt: 'Force the rusted hasp', target: 'survey_back_in', interiorId: 'survey', range: 2.6,
      locked: true, lockedPrompt: 'The hasp is sound here. Iris said the north elevation.',
      unlockIf: { flag: 'iris_hinted_door' } },
    { id: 'door_hut', kind: 'door', x: 96, y: 1.1, z: -58, label: 'Instrument hut',
      prompt: 'Enter the instrument hut', target: 'hut_in', interiorId: 'hut', range: 2.6 },
    { id: 'door_bek', kind: 'door', x: -34, y: 1.1, z: 44.6, label: 'Bek & Daughter',
      prompt: 'Enter the garage', target: 'bek_in', interiorId: 'bek', range: 2.8 },
    { id: 'door_pell', kind: 'door', x: -112, y: 1.1, z: -68.4, label: 'Pell House',
      prompt: 'Enter Pell House', target: 'pell_in', interiorId: 'pell', range: 2.8 },
  );

  // Boarded shopfronts. Hollis was evacuated in a hurry and then boarded in an
  // even bigger one, and behind about one hoarding in six there is still a
  // stockroom. These are the reason to walk down a street you have no errand
  // on, and the reason Teo regrinding the bar is worth a conversation.
  const BOARDED = [
    { id: 'brd_delph', x: -78, z: -12.6, rot: 0, reveal: 'Delph Ironmongers, back store',
      loot: [['salvage', 4], ['cell', 1]],
      journal: ['delph', 'Delph Ironmongers', `Two hundred feet of copper flex and a shelf of lamp
cells, behind eleven-year-old boards, forty metres from a courtyard that has been
rationing light since March. Nobody checked. Everybody walked past.`] },
    { id: 'brd_outfit', x: -58, z: -12.6, rot: 0, reveal: 'Colliery Outfitters',
      loot: [['salvage', 3], ['bandage', 2]] },
    { id: 'brd_ninelamps', x: -38, z: -12.6, rot: 0, reveal: 'Nine Lamps — cellar hatch',
      loot: [['salvage', 3], ['filter', 1]],
      journal: ['ninelamps', 'The Nine Lamps', `A pub cellar with the hatch still chained from the
inside, which means whoever chained it went out the front and meant to come back.
There is a crate of respirator cartridges down there, unopened, still in date.`] },
    { id: 'brd_selvin', x: -96, z: -12.6, rot: 0, reveal: 'Selvin & Vane',
      loot: [['salvage', 4]] },
    { id: 'brd_chapel', x: -50, z: 33.4, rot: Math.PI, reveal: 'Chapel vestry',
      loot: [['salvage', 2], ['bandage', 1], ['stim', 1]] },
    { id: 'brd_weigh', x: 71, z: 40.4, rot: Math.PI, reveal: 'Weighbridge office',
      loot: [['salvage', 3], ['cell', 1]],
      journal: ['weigh', 'Weighbridge office', `Authority stock, Authority padlock, Authority
boards. Four cases of cartridges issued to a plant crew that was stood down in
the spring and never came for them.`] },
    { id: 'brd_laundry', x: -22, z: 33.4, rot: Math.PI, reveal: 'Laundry, rear',
      loot: [['salvage', 3], ['filter', 1]] },
  ];
  for (const b of BOARDED) {
    props.push({
      kind: 'hoarding', x: b.x, z: b.z, rot: b.rot, w: 2.6, h: 2.3,
      interact: {
        id: b.id, kind: 'breach', label: 'Boarded shopfront',
        prompt: 'Lever the boards off', dy: 1.2, range: 2.4,
        reveal: b.reveal, loot: b.loot, journal: b.journal,
      },
    });
  }

  // The instrument hut needs a shell outdoors so the door is somewhere.
  buildings.push({
    id: 'hutshell', name: 'Instrument hut', style: 'works',
    x: 96, z: -54, w: 7, d: 6, rot: 0, h: 3.0, faces: 'pz', doorFace: 'pz', lit: 0.3, boarded: 0,
  });

  // Exterior spawn points paired with each interior exit.
  spawns.push({ id: 'hut_out', x: 96, z: -57, y: 0, rot: 0 });
  spawns.push({ id: 'pell_out', x: -112, z: -70.5, y: 0, rot: Math.PI });
  spawns.push({ id: 'bek_out', x: -34, z: 42.5, y: 0, rot: Math.PI });

  // The three cracked borehole heads on the west side — Sol's work.
  for (let i = 0; i < 3; i++) {
    const x = -118 + i * 14, z = 26;
    // `cracked` is not decoration: it puts the bar still in the collar, the rag
    // wedge, and the fresh scoring on the cap, so the single most important
    // physical evidence in the story does not render as the same asset as the
    // twenty background heads in Field 9.
    props.push({ kind: 'vent', x, z, hot: true, cracked: true, gasStrength: 2600, gasRadius: 24,
      id: `vent_west_${i + 1}`,
      interact: { id: `vent_west_${i + 1}`, kind: 'vent', label: 'Cracked borehole head',
        prompt: 'Examine the wedged head', dy: 1.2, range: 2.6 } });
  }
  regions.push({ id: 'westheads', name: 'West Heads', x: -104, z: 26, w: 56, d: 20, music: 'tense', ambience: 'vents' });

  return {
    seed: 'hollis-1',
    bounds: { minX: -150, minZ: -132, maxX: 148, maxZ: 100 },
    streets, buildings, structures, props, scatter, gasSources, covered,
    interactions, spawns, regions, doors, interiors,
  };
}
