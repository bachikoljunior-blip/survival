// Read-only CPU fixture for this checkout. Calls the actual full City.build().
// It does not render: Canvas2D drawing/text metrics and surface textures are
// stubbed. Geometry, colliders, navigation, transforms and visibility are real.
// No actor/game state is constructed. This is not a browser or GPU test.
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { City } from './survival/src/world/city.js';
import { buildHollisData } from './survival/src/content/world_data.js';
import { TIERS } from './survival/src/core/engine.js';

export { THREE };

export function buildCpuCity({ tier = 'medium', cameraPosition = null, visibilityRadius = 104, CityConstructor = City } = {}) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const noop = () => {};
  const context = new Proxy({ measureText: () => ({ width: 6 }) }, {
    get: (target, key) => key in target ? target[key] : noop,
  });
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => ({ width: 1, height: 1, getContext: () => context }) },
    writable: true, configurable: true,
  });
  const pool = new Map();
  function material(key, opts, basic = false) {
    if (!pool.has(key)) {
      const Constructor = basic ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
      const m = new Constructor({
        side: opts.side ?? THREE.FrontSide,
        transparent: opts.transparent ?? false,
        opacity: opts.opacity ?? 1,
        vertexColors: opts.vertexColors ?? true,
      });
      m.name = key;
      pool.set(key, m);
    }
    return pool.get(key);
  }
  const mats = {
    get: (kind, opts = {}) => material(`world:${kind}:${JSON.stringify(opts)}`, opts),
    flat: (color, opts = {}) => material(`flat:${color}:${JSON.stringify(opts)}`, opts),
    glowShared: () => material('glowShared', {}, true),
    get count() { return pool.size; },
  };
  try {
    const data = buildHollisData();
    const city = new CityConstructor(data, mats, TIERS[tier]).build();
    city.root.updateMatrixWorld(true);
    if (cameraPosition) city.updateVisibility(cameraPosition[0], cameraPosition[2], visibilityRadius);
    const meshes = [];
    city.root.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { city, data, meshes, materialPool: pool };
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
}

export function hierarchyVisible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function worldTriangle(mesh, faceIndex) {
  const index = mesh.geometry.index;
  const position = mesh.geometry.attributes.position;
  return [0, 1, 2].map(k => new THREE.Vector3()
    .fromBufferAttribute(position, index ? index.getX(faceIndex * 3 + k) : faceIndex * 3 + k)
    .applyMatrix4(mesh.matrixWorld).toArray());
}
