import * as THREE from 'three';

// Opaque depth silhouettes need positions and winding, not a separate draw
// for every facade material. Keep the original meshes for the colour pass,
// and submit the same world-space surfaces in two shadow-only batches.
// Static positions are cached; animated bodies and held props are refreshed.
export class ShadowBatches {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    this.owned = new Map();
    this.static = makeBatch('world-shadow');
    this.dynamic = makeBatch('actor-shadow');
    scene.add(this.static.mesh, this.dynamic.mesh);
    this.stats = {};
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      for (const [object] of this.owned) object.castShadow = true;
      this.owned.clear();
      this.static.mesh.visible = this.dynamic.mesh.visible = false;
    }
  }

  update(light, camera) {
    if (!this.enabled) return;
    const started = performance.now();
    this.scene.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);
    const frustum = light.shadow.getFrustum();
    const alive = new Set();
    const stationary = [], moving = [];
    let unsupported = 0;
    this.scene.traverse(object => {
      if (!object.isMesh || object === this.static.mesh || object === this.dynamic.mesh) return;
      alive.add(object);
      if (!object.castShadow && !this.owned.has(object)) return;
      if (!supported(object)) {
        if (this.owned.delete(object)) object.castShadow = true;
        if (visible(object) && object.layers.test(camera.layers)) unsupported++;
        return;
      }
      let record = this.owned.get(object);
      if (!record) this.owned.set(object, record = {});
      object.castShadow = false;
      if (!visible(object) || !object.material.visible || !object.layers.test(camera.layers)) return;
      if (object.frustumCulled && !frustum.intersectsObject(object)) return;
      const animated = object.isSkinnedMesh || object.morphTargetInfluences?.length || actorChild(object);
      const signature = animated ? null : cacheKey(object);
      if (animated || signature !== record.signature) {
        record.pack = packPositions(object, record.pack);
        record.signature = signature;
      }
      (animated ? moving : stationary).push(record.pack);
    });
    // Actors and doors can be removed by the story. Do not retain their
    // disposed geometry or resurrect them in a shadow after removal.
    for (const [object] of this.owned) {
      if (!alive.has(object)) { object.castShadow = true; this.owned.delete(object); }
    }
    fillBatch(this.static, stationary);
    fillBatch(this.dynamic, moving);
    this.stats = {
      staticSources: stationary.length, dynamicSources: moving.length,
      staticTriangles: this.static.count / 3, dynamicTriangles: this.dynamic.count / 3,
      unsupportedSources: unsupported, prepareMs: performance.now() - started,
    };
  }

  dispose() {
    this.setEnabled(false);
    for (const batch of [this.static, this.dynamic]) {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose(); batch.mesh.material.dispose();
    }
  }
}

function visible(object) {
  for (let p = object; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function actorChild(object) {
  for (let p = object.parent; p; p = p.parent) if (p.name.startsWith('actor:')) return true;
  return false;
}

function supported(object) {
  const m = object.material, g = object.geometry;
  // Retain the original renderer path for silhouettes requiring material
  // sampling, custom depth shaders or per-group materials. Never omit them.
  return g?.attributes.position && !Array.isArray(m) && m
    && !object.isBatchedMesh && !object.morphTexture && !object.customDepthMaterial
    && !m.alphaTest && !m.alphaHash && !m.displacementMap && !m.wireframe
    && !m.clippingPlanes?.length;
}

function cacheKey(object) {
  const g = object.geometry, m = object.material;
  return [g.id, g.attributes.position.version, g.index?.version,
    g.drawRange.start, g.drawRange.count, m.side, m.shadowSide,
    object.count, object.instanceMatrix?.version, ...object.matrixWorld.elements].join(',');
}

function packPositions(object, previous) {
  const g = object.geometry, material = object.material;
  const planarIndex = !object.isSkinnedMesh && !object.morphTargetInfluences?.length
    && g.drawRange.start===0 && g.drawRange.count>=(g.index?.count??Infinity)
    ? g.userData.shadowIndex : null;
  const vertices = g.attributes.position.count;
  const instances = object.isInstancedMesh ? object.count : 1;
  const available = planarIndex ? planarIndex.length : g.index ? g.index.count : vertices;
  const start = planarIndex ? 0 : g.drawRange.start;
  const end = Math.min(available, start + g.drawRange.count);
  const count = Math.floor(Math.max(0, end - start) / 3) * 3;
  const shadowSide = material.shadowSide ??
    (material.side === THREE.FrontSide ? THREE.BackSide : material.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
  const both = shadowSide === THREE.DoubleSide;
  const vertexFloats=vertices*instances*3, indexCount=count*instances*(both?2:1);
  const position=previous?.position.length===vertexFloats ? previous.position : new Float32Array(vertexFloats);
  const index=previous?.index.length===indexCount ? previous.index : new Uint32Array(indexCount);
  const v = _vertex, matrix = _matrix, instance = _instance;
  let next = 0;
  for (let n = 0; n < instances; n++) {
    matrix.copy(object.matrixWorld);
    if (object.isInstancedMesh) { object.getMatrixAt(n, instance); matrix.multiply(instance); }
    const offset = n * vertices;
    for (let i = 0; i < vertices; i++) {
      object.getVertexPosition(i, v).applyMatrix4(matrix).toArray(position, (offset + i) * 3);
    }
    // The normal draw flips frontFace for a negative object transform. The
    // batch has identity transform, so preserve that choice in its indices.
    const reverse = (shadowSide === THREE.FrontSide) !== (object.matrixWorld.determinant() < 0);
    for (let i = start; i < start + count; i += 3) {
      const a = offset + (planarIndex ? planarIndex[i] : g.index ? g.index.getX(i) : i);
      const b = offset + (planarIndex ? planarIndex[i+1] : g.index ? g.index.getX(i + 1) : i + 1);
      const c = offset + (planarIndex ? planarIndex[i+2] : g.index ? g.index.getX(i + 2) : i + 2);
      index[next++] = a; index[next++] = reverse ? c : b; index[next++] = reverse ? b : c;
      if (both) { index[next++] = a; index[next++] = reverse ? b : c; index[next++] = reverse ? c : b; }
    }
  }
  const pack=previous||{};
  Object.assign(pack,{position,index,revision:(pack.revision||0)+1});
  return pack;
}

function makeBatch(name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  material.shadowSide = THREE.BackSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // Source meshes were tested against the light frustum.
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.raycast = () => {}; // The proxy cannot intercept gameplay or inspection picks.
  const batch = { mesh, count: 0, packs: [], versions: [] };
  // These hooks run before renderBufferDirect reads drawRange. No colour
  // triangles are submitted. Three may still count the zero-length draw call;
  // keep that small overhead in the measured submission budget.
  mesh.onBeforeRender = () => geometry.setDrawRange(0, 0);
  mesh.onBeforeShadow = () => geometry.setDrawRange(0, batch.count);
  return batch;
}

function fillBatch(batch, packs) {
  batch.mesh.visible = packs.length > 0;
  if (packs.length === batch.packs.length && packs.every((p, i) => p === batch.packs[i] && p.revision===batch.versions[i])) return;
  batch.packs = packs;
  batch.versions.length=packs.length;
  for(let i=0;i<packs.length;i++) batch.versions[i]=packs[i].revision;
  const vertexFloats = packs.reduce((n, p) => n + p.position.length, 0);
  const indexCount = packs.reduce((n, p) => n + p.index.length, 0);
  const geometry = batch.mesh.geometry;
  let positions = geometry.attributes.position, indices = geometry.index;
  if (positions.array.length < vertexFloats || indices.array.length < indexCount) {
    // Replacing uploaded buffers on the same geometry requires disposing its
    // old renderer allocations first. Keep modest spare capacity for motion.
    geometry.dispose();
    positions = new THREE.BufferAttribute(new Float32Array(Math.ceil(vertexFloats * 1.2 / 3) * 3), 3);
    indices = new THREE.BufferAttribute(new Uint32Array(Math.ceil(indexCount * 1.2 / 3) * 3), 1);
    positions.setUsage(THREE.DynamicDrawUsage); indices.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions); geometry.setIndex(indices);
  }
  let vertexOffset = 0, indexOffset = 0;
  for (const pack of packs) {
    positions.array.set(pack.position, vertexOffset * 3);
    for (let i = 0; i < pack.index.length; i++) indices.array[indexOffset++] = pack.index[i] + vertexOffset;
    vertexOffset += pack.position.length / 3;
  }
  positions.needsUpdate = true; indices.needsUpdate = true;
  batch.count = indexCount;
  geometry.setDrawRange(0, 0);
}

const _vertex=new THREE.Vector3(), _matrix=new THREE.Matrix4(), _instance=new THREE.Matrix4();
