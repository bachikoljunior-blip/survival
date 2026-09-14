import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const reportUrl=new URL('../original/report.json',import.meta.url);
const report=JSON.parse(fs.readFileSync(reportUrl,'utf8'));
const transport=report.audioCapture.transport;
assert.equal(transport.largeReplyRoute,'existing loopback DIST server; same-origin POST after recorder completion');
assert.equal(transport.uploadChunkBytes,131072);
assert.equal(transport.operationTimeoutMs,120000);
assert.equal(transport.maxTransferChars,50331648);
assert.equal(transport.uploads.length,4);
for(const receipt of transport.uploads){
  assert.equal(receipt.status,'received');assert.equal(receipt.chunkBytes,131072);
  assert.equal(receipt.maxTransferChars,50331648);
  assert(receipt.chars>0&&receipt.chars<=50331648);
  assert.equal(receipt.chunks,Math.ceil(receipt.receivedBytes/131072));
  assert(receipt.elapsedMs>0&&receipt.elapsedMs<120000);
  assert.match(receipt.sha256,/^[0-9a-f]{64}$/);
  assert.equal(receipt.error,undefined);assert.equal(receipt.evaluationFailure,undefined);
}
assert.deepEqual(transport.uploads.map(x=>x.id),[8,12,16,1]);
const snapshot=structuredClone(report.safariFrameWork);
delete snapshot.provenance;
const json=JSON.stringify(snapshot);
const bytes=Buffer.from(json,'utf8');
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const matches=transport.uploads.filter(x=>x.sha256===sha256);
assert.equal(matches.length,1);
const receipt=matches[0];
assert.equal(receipt.id,1);assert.equal(receipt.chars,json.length);
assert.equal(receipt.receivedBytes,bytes.length);
assert.equal(bytes.length,8030267);
assert.equal(sha256,'44b170955d63a590d7fac1f4752cfd0458be50208b7fe4b53e103bd6d6bbc99b');
const result={status:'verified',transport,profileSnapshot:{chars:json.length,bytes:bytes.length,sha256,
  provenanceRemovedOnly:true,matchingReceipt:receipt,receiptPayloadIdentityIndependentlyReconstructed:true},
  clipUploadPayloadHashesIndependentlyReconstructed:false,
  scope:'Four host receipts are internally consistent and received. Only profile snapshot JSON bytes can be reconstructed from this full report; media-bearing upload payloads were not acquired. Receipt elapsed is receiver interval, not complete browser operation or recording time.'};
fs.writeFileSync(new URL('upload-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,profileBytes:bytes.length,profileSha256:sha256,receiptElapsedMs:receipt.elapsedMs}));
