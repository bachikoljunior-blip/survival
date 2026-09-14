import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, Box, LAYER } from '../src/world/collision.js';

test('each box face returns its outward normal from positive and negative ray directions', () => {
  const world=new CollisionWorld();world.add(new Box(0,0,0,2,2,2,0,LAYER.SOLID));
  for(const [origin,direction,point,normal] of [
    [[4,1,0],[-1,0,0],[1,1,0],[1,0,0]],
    [[-4,1,0],[1,0,0],[-1,1,0],[-1,0,0]],
    [[0,4,0],[0,-1,0],[0,2,0],[0,1,0]],
    [[0,-2,0],[0,1,0],[0,0,0],[0,-1,0]],
    [[0,1,4],[0,0,-1],[0,1,1],[0,0,1]],
    [[0,1,-4],[0,0,1],[0,1,-1],[0,0,-1]],
  ]) {
    const hit=world.raycast(...origin,...direction,8);
    assert.ok(hit);assert.deepEqual([hit.x,hit.y,hit.z],point);
    for(const [a,b] of [[hit.nx,normal[0]],[hit.ny,normal[1]],[hit.nz,normal[2]]]) assert.ok(Math.abs(a-b)<1e-9);
    assert.ok(hit.nx*direction[0]+hit.ny*direction[1]+hit.nz*direction[2]<0);
  }
});

test('rotated side normals remain perpendicular and oppose entry rays', () => {
  const theta=0.61,c=Math.cos(theta),s=Math.sin(theta),world=new CollisionWorld();
  world.add(new Box(3,0,-2,2,2,2,theta,LAYER.SOLID));
  for(const sign of [-1,1]) {
    const hit=world.raycast(3+sign*4*c,1,-2+sign*4*s,-sign*c,0,-sign*s,8);
    assert.ok(hit);assert.ok(Math.abs(hit.t-3)<1e-9);
    assert.ok(Math.abs(hit.nx-sign*c)<1e-9);assert.ok(Math.abs(hit.nz-sign*s)<1e-9);
  }
});

test('a roof below a downward probe reports a top face without changing the hit height', () => {
  const world=new CollisionWorld();world.add(new Box(0,9,0,10,1,10,0,LAYER.PLATFORM,'roof'));
  const hit=world.raycast(0,10.15,0,0,-1,0,0.3,LAYER.SOLID|LAYER.PLATFORM);
  assert.equal(hit.y,10);assert.equal(hit.ny,1);
  assert.equal(world.raycast(6,10.15,0,0,-1,0,0.3,LAYER.SOLID|LAYER.PLATFORM),null);
});
