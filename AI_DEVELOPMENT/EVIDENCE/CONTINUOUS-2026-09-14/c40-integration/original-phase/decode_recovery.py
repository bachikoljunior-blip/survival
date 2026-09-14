#!/usr/bin/env python3
"""Decode only the fixed C39 recovery of two original failed C38 files."""
from pathlib import Path
import base64,hashlib,importlib.util,json,math,re,zlib
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('fixed_helper',ROOT/'source/tools/recover-ios-phase-c38.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
def need(ok,message):
    if not ok:raise ValueError(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
    log=(ROOT/'transport/job-original.log').read_bytes();records=[]
    pattern=re.compile(r'\[ios-phase-recovery-(meta|chunk|end)\] (\{.*\})$')
    for number,line in enumerate(log.decode('utf8').splitlines(),1):
        match=pattern.search(line)
        if match:records.append((number,match[1],helper.strict_json(match[2].encode())))
    expected={'report.json.gz':33554432,'appium.log.gz':8388608}
    streams={};active=None;manifest=None;identity=None
    fixed={'schemaVersion':1,'fileCount':2,'gzipTotalLimitBytes':8388608,'rawTotalLimitBytes':41943040,
        'artifactId':10364986195,'artifactZipBytes':25105480,
        'artifactZipDigest':'sha256:661474f9320966960edf4794c0fdabe4d8f456ec6166efd1dbace592cef6d372',
        'originalRunId':34884725972,'originalRunAttempt':1,'originalHead':'61e8f8c595bde13634fe709f979816011df165d0',
        'recoveryCommit':'dff2d683d0a9821c79d84848bf93cb45b8920494','recoveryRunId':'34891306829','recoveryRunAttempt':1,
        'recoveryHelperSha256':'efbf6600efb7c332ca21e2b07b6b879c748ed5a27227608178cfa7b74c35135f','complete':True}
    need(sha((ROOT/'source/tools/recover-ios-phase-c38.py').read_bytes())==fixed['recoveryHelperSha256'],'actual helper mismatch')
    for number,kind,value in records:
        if kind=='meta':
            need(active is None and value.get('file') in expected and value['file'] not in streams,'duplicate/interleaved/unknown stream')
            for key,want in fixed.items():need(value.get(key)==want,'wrong recovery identity: '+key)
            need(isinstance(value.get('files'),list) and [x.get('file') for x in value['files']]==list(expected),'wrong shared member manifest')
            if manifest is None:manifest=value['files']
            else:need(manifest==value['files'],'shared member manifests differ')
            entry=next(x for x in manifest if x['file']==value['file'])
            for key,want in entry.items():need(value.get(key)==want,'member metadata differs: '+key)
            need(value.get('encoding')=='gzip' and value.get('rawFile')==value['file'][:-3],'wrong original member mapping')
            need(type(value['bytes']) is int and 0<value['bytes']<=8388608,'gzip bound')
            need(type(value['rawBytes']) is int and 0<value['rawBytes']<=expected[value['file']],'raw bound')
            need(value['rawLimitBytes']==expected[value['file']] and value['total']==math.ceil(value['bytes']/3000),'raw bound/chunk total differs')
            common={key:val for key,val in value.items() if key not in entry}
            if identity is None:identity=common
            else:need(common==identity,'shared recovery identity differs')
            active={'meta':value,'parts':[],'metaLine':number}
        elif kind=='chunk':
            need(active is not None,'chunk outside stream');m=active['meta'];index=len(active['parts'])
            need(value.get('file')==m['file'] and type(value.get('index')) is int and value['index']==index
                 and type(value.get('offset')) is int and value['offset']==index*3000 and value.get('total')==m['total'],'chunk index/offset/identity mismatch')
            part=base64.b64decode(value['base64'],validate=True)
            need(len(part)==min(3000,m['bytes']-index*3000),'chunk bytes mismatch');active['parts'].append(part)
        else:
            need(active is not None and active['meta']==value,'end boundary differs')
            m=active['meta'];need(len(active['parts'])==m['total'],'missing chunks')
            packed=b''.join(active['parts']);need(len(packed)==m['bytes'] and sha(packed)==m['sha256'],'gzip bytes/SHA differ')
            decoder=zlib.decompressobj(31);raw=decoder.decompress(packed,m['rawBytes']+1)
            need(len(raw)==m['rawBytes'] and decoder.eof and not decoder.unconsumed_tail and not decoder.unused_data,'gzip EOF/trailing/bound mismatch')
            need(sha(raw)==m['rawSha256'] and f'{zlib.crc32(raw):08x}'==m['originalMemberCrc32'],'raw SHA/member CRC mismatch')
            raw.decode('utf8',errors='strict')
            streams[m['file']]={'meta':m,'gzip':packed,'raw':raw,'metaLine':active['metaLine'],'endLine':number};active=None
    need(active is None and set(streams)==set(expected),'missing complete original member')
    need(sum(len(x['gzip']) for x in streams.values())==identity['gzipTotalBytes']<=8388608,'shared gzip budget mismatch')
    need(sum(len(x['raw']) for x in streams.values())==identity['rawTotalBytes']<=41943040,'shared raw budget mismatch')
    report=helper.strict_json(streams['report.json.gz']['raw']);diagnostic=helper.verify_original(report)
    need(diagnostic==identity['originalDiagnostic'],'preserved diagnostic differs')
    target=ROOT/'original';target.mkdir(exist_ok=True)
    entries=[]
    for file,item in streams.items():
        raw_path=target/item['meta']['rawFile'];packed_path=target/file
        need(not raw_path.exists() or raw_path.read_bytes()==item['raw'],'refuse replacing a different original')
        need(not packed_path.exists() or packed_path.read_bytes()==item['gzip'],'refuse replacing a different original gzip')
        raw_path.write_bytes(item['raw']);packed_path.write_bytes(item['gzip'])
        entries.append({**item['meta'],'metaLine':item['metaLine'],'endLine':item['endLine']})
    receipt={'status':'both original files fully recovered','recoveryJob':104134403420,'originalFailurePreserved':diagnostic,
        'fullRawReportBytesRecovered':True,'missingPhaseRowsRecovered':False,'rawZipDownloadedLocally':False,
        'zipDigestScope':'Actual verified helper checked fixed archive digest in successful CI; local verification covers exported gzip/raw bytes and original member CRC.',
        'log':{'bytes':len(log),'sha256':sha(log)},'metaCount':2,'endCount':2,'chunkCount':sum(x['total'] for x in manifest),'files':entries}
    (ROOT/'recovered-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'status':receipt['status'],'log':receipt['log'],'chunks':receipt['chunkCount'],'files':[{'rawFile':x['rawFile'],'rawBytes':x['rawBytes'],'rawSha256':x['rawSha256'],'gzipBytes':x['bytes']} for x in entries]}))
if __name__=='__main__':main()
