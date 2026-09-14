#!/usr/bin/env python3
"""Check DB links only; absence of a path is not proof of dead game content."""
from collections import defaultdict
from pathlib import Path
import hashlib
import json
import sqlite3

root = Path('/workspace/scratch/0b7ad82bafe7')
path = root/'reference-materials/disco/public-dialogue-db/disco.db'
db = sqlite3.connect('file:'+str(path)+'?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('PRAGMA query_only=ON')
units = []
for cid in [239,659,992,1274,1037,1038,765,759,865,868]:
    nodes = {r['id']:dict(r) for r in db.execute('SELECT * FROM temp_table WHERE conversationid=?',(cid,))}
    edges = defaultdict(list)
    for row in db.execute('SELECT origindialogueid,destinationdialogueid FROM dlinks WHERE originconversationid=? AND destinationconversationid=?',(cid,cid)):
        edges[row[0]].append(row[1])
    roots = {0}|{r[0] for r in db.execute('SELECT destinationdialogueid FROM dlinks WHERE destinationconversationid=? AND originconversationid<>?',(cid,cid))}
    seen = set()
    todo = list(roots)
    while todo:
        nid = todo.pop()
        if nid in seen:
            continue
        seen.add(nid)
        todo.extend(edges[nid])
    unresolved = []
    for nid,node in nodes.items():
        if nid in seen or node['dialoguetext'].strip() in ('','0'):
            continue
        incoming = [dict(r) for r in db.execute('SELECT * FROM dlinks WHERE destinationconversationid=? AND destinationdialogueid=?',(cid,nid))]
        outgoing = [dict(r) for r in db.execute('SELECT * FROM dlinks WHERE originconversationid=? AND origindialogueid=?',(cid,nid))]
        unresolved.append({
            'key':f'{cid}:{nid}', 'actor':node['actor'],
            'textSha256':hashlib.sha256(node['dialoguetext'].encode()).hexdigest(),
            'textUtf8Bytes':len(node['dialoguetext'].encode()),
            'conditionstring':node['conditionstring'],
            'hasalts':node['hasalts'], 'incoming':incoming, 'outgoing':outgoing,
        })
    units.append({'conversationId':cid, 'knownTopologicalRoots':sorted(roots), 'unresolvedTextNodes':unresolved})
report = {
    'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
    'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'scope':'Ten existing E9 conversation locators; all conditions intentionally ignored in graph traversal.',
    'readOnly':True,
    'units':units,
    'unresolvedTextNodes':sum(len(u['unresolvedTextNodes']) for u in units),
    'conclusion':'Four prose nodes lack a dlinks path from node 0 or listed external graph entrypoints. This is not proof that the game cannot call a node directly, nor proof of cut content. Connected nodes are not thereby proven runtime reachable.',
    'limit':'No game dispatcher, save state, condition interpreter, or actual played scene inspected.',
}
(root/'disco-e9-method-r2/context-probes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'unresolvedTextNodes':report['unresolvedTextNodes'],'output':'disco-e9-method-r2/context-probes.json'}))
