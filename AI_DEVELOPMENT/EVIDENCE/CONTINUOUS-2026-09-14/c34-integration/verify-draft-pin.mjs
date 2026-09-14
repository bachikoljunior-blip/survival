import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {IOS_AUDIO_PIN,verifyIosAudioBuild} from './pin-fixture/tools/ios_audio_capture.mjs';
import {verifyRequiredSafariAudio} from './pin-fixture/tools/gates/f3_safari_audio.mjs';
const root=new URL('./pin-fixture/',import.meta.url).pathname;
const original=new URL('../c33-audio-product-prepared/original/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const report=readFileSync(new URL('report.json',original));
assert.equal(hash(report),IOS_AUDIO_PIN.preparationReportSha256);
assert.equal(JSON.parse(report).sourceCommit,IOS_AUDIO_PIN.preparedFromCommit);
assert.equal(hash(readFileSync(new URL('cinderline.1.0.0.js',original))),IOS_AUDIO_PIN.bundleSha256);
const preflight=verifyIosAudioBuild(root);
const dist=root+'dist/cinderline.1.0.0.js',newBytes=readFileSync(dist);
writeFileSync(dist,readFileSync(new URL('../main-integration-c31/pin-fixture/cinderline.1.0.0.js',import.meta.url)));
try { assert.throws(()=>verifyIosAudioBuild(root),/build pin mismatch/); }
finally {writeFileSync(dist,newBytes);}
writeFileSync(dist,readFileSync(new URL('../c32-audio-product-prepared/original/cinderline.1.0.0.js',import.meta.url)));
try {assert.throws(()=>verifyIosAudioBuild(root),/build pin mismatch/);}
finally {writeFileSync(dist,newBytes);}
const reportPath=root+'test-results/ios-safari/report.json',old=readFileSync(reportPath);
const environment={CINDERLINE_IOS_AUDIO_CAPTURE:'1',GITHUB_SHA:IOS_AUDIO_PIN.preparedFromCommit,GITHUB_RUN_ID:'34860188513',GITHUB_RUN_ATTEMPT:'1'};
assert.throws(()=>verifyRequiredSafariAudio(root,environment),/three original Safari scenes/);
// Explicit negative fixture: rename only the old scene so the provenance
// boundary is exercised independently. This is never saved as actual evidence.
const fixture=JSON.parse(old);fixture.audioCapture.clips[1].name='cut-gas-air';
writeFileSync(reportPath,JSON.stringify(fixture));
try {assert.throws(()=>verifyRequiredSafariAudio(root,environment),/provenance mismatch: preparedFromCommit/);}
finally {writeFileSync(reportPath,old);}
const result={scope:'Adoption 514f prepared lineage and preflight; no new browser or recording',pin:IOS_AUDIO_PIN,preflight,old81cDistRejected:true,old239DistRejected:true,oldC29OriginalRejected:true,renamedOldFixtureStillRejectedByProvenance:true,actualNewCapture:0};
writeFileSync(new URL('draft-pin-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
