/** Explicit single-run original-report export for the source frame-work diagnosis.
 * Emits the original bytes, including failures. Never records or changes media. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function exportFrameWorkReport(root, env=process.env, emit=console.log) {
  if (env.CINDERLINE_IOS_FRAME_WORK_CAPTURE !== '1' || env.GITHUB_EVENT_NAME !== 'push'
    || env.GITHUB_REF !== 'refs/heads/claude/repo-instructions-constraints-r0070m'
    || env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_WORKFLOW !== 'Floor gates')
    throw new Error('Original diagnostic export is limited to the selected first source Floor run');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || ''))
    throw new Error('Actual source revision and run are required');
  const path='test-results/ios-safari/report.json', bytes=readFileSync(join(root,path));
  if (bytes.length < 1 || bytes.length > 8*1024*1024) throw new Error('Original diagnostic report exceeds bounded export capacity');
  const report=JSON.parse(bytes.toString('utf8')), provenance=report.audioCapture?.provenance;
  const expected={runCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
    helperSha256:sha(readFileSync(join(root,'tools/ios_audio_capture.mjs'))),
    transferHelperSha256:sha(readFileSync(join(root,'tools/ios_audio_transfer.mjs'))),
    harnessSha256:sha(readFileSync(join(root,'tools/test-ios-safari.mjs'))),
    frameWorkProbeSha256:sha(readFileSync(join(root,'tools/frame_work_probe.mjs')))};
  for (const [key,value] of Object.entries(expected)) if(provenance?.[key]!==value)
    throw new Error('Original diagnostic source/run mismatch: '+key);
  if (report.safariFrameWork && Object.entries(expected).some(([key,value])=>report.safariFrameWork.provenance?.[key]!==value))
    throw new Error('Frame-work provenance differs from the original report');
  const meta={file:path,bytes:bytes.length,sha256:sha(bytes),...expected,
    diagnosticStatus:report.status,frameWorkPresent:Boolean(report.safariFrameWork),
    totalChunks:Math.ceil(bytes.length/3000),complete:true};
  // All identity, size and provenance checks finish before the first byte emits.
  emit('[ios-frame-work-meta] '+JSON.stringify(meta));
  for(let offset=0,index=0;offset<bytes.length;offset+=3000,index++)
    emit('[ios-frame-work-chunk] '+JSON.stringify({file:path,offset,index,total:meta.totalChunks,
      base64:bytes.subarray(offset,offset+3000).toString('base64')}));
  emit('[ios-frame-work-end] '+JSON.stringify(meta));
  return meta;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  exportFrameWorkReport(resolve(fileURLToPath(new URL('..',import.meta.url))));
