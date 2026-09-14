#!/usr/bin/env python3
"""Read-only, bounded E9 source-method probe. This is not a game runner."""
import hashlib
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timezone

ROOT = Path('/workspace/scratch/0b7ad82bafe7')
OUT = ROOT / 'disco-e9-method-r2'
DB = ROOT / 'reference-materials/disco/public-dialogue-db/disco.db'
CONVERSATIONS = [239, 659, 992, 1274, 1037, 1038, 765, 759, 865, 868]
ACTORS = [72, 3, 6, 5, 11, 18]
KEYS = [(239,50),(239,33),(239,346),(992,319),(992,16),(992,50),
        (992,60),(659,174),(1274,326),(1274,329),(1274,332),
        (1037,39),(1038,363),(1038,364),(765,2),(765,25),
        (759,314),(759,316),(865,84),(865,197),(868,7),(868,16),
        (992,9),(992,61),(992,26),(992,62),(992,63),(1038,434),
        (1038,435),(1038,436),(1038,366),(759,303),(759,311),
        (759,313),(765,8),(865,77),(868,10),(659,175),(239,45)]
INPUTS = [
 'survival/CLAUDE.md', 'survival/docs/benchmarks.md',
 'survival/AI_DEVELOPMENT/BENCHMARKS/elements.json',
 'disco-material-r1/review.json', 'disco-material-r1/raw.json',
 'disco-material-r1/auxiliary-sidecar.json',
 'disco-material-r1/next-source-targets.json',
 'disco-material-r1/displayed-excerpt-manifest.json',
 'reference-materials/disco/public-dialogue-db/disco.db',
 'reference-materials/disco/public-dialogue-db/acquisition.json',
 'reference-materials/disco/public-dialogue-db/integrity.json',
 'reference-materials/disco/public-dialogue-db/schema-inspection.json',
 'reference-materials/disco/public-dialogue-db/screenshot-crosscheck.json',
 'disco-e9-method-r2/source-probe.py',
]

def digest(value):
    data = value.encode('utf-8')
    return {'utf8Bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def pin(rel):
    data = (ROOT / rel).read_bytes()
    return {'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

data = DB.read_bytes()
pins_before = [pin(x) for x in INPUTS]
db = sqlite3.connect('file:' + str(DB) + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('PRAGMA query_only=ON')

def rows(sql, params=()):
    return [dict(x) for x in db.execute(sql, params)]

def genuine_text(value):
    # Preserve the raw rows. This filter is ONLY for the structural text count.
    return value is not None and value.strip() not in ('', '0')

units = []
all_base = []
all_alternates = []
full_keys = {(r['conversationid'],r['id']) for r in rows('SELECT conversationid,id FROM temp_table')}
dentry_keys = {(r['conversationid'],r['id']) for r in rows('SELECT conversationid,id FROM dentries')}
for cid in CONVERSATIONS:
    nodes = rows('SELECT * FROM temp_table WHERE conversationid=? ORDER BY id', (cid,))
    alternates = rows('SELECT rowid,* FROM alternates WHERE conversationid=? ORDER BY rowid', (cid,))
    links = rows('SELECT * FROM dlinks WHERE originconversationid=?', (cid,))
    checks = rows('SELECT * FROM checks WHERE conversationid=?', (cid,))
    modifiers = rows('SELECT * FROM modifiers WHERE conversationid=?', (cid,))
    missing_full = []
    missing_dentries = []
    for link in links:
        key = (link['destinationconversationid'], link['destinationdialogueid'])
        if key not in full_keys:
            missing_full.append(link)
        if key not in dentry_keys:
            missing_dentries.append(link)
    units.append({
        'conversationId': cid,
        'rawNodes': len(nodes),
        'textNodesExcludingEmptyAndZeroSentinels': sum(genuine_text(n['dialoguetext']) for n in nodes),
        'groupNodes': sum(bool(n['isgroup']) for n in nodes),
        'directConditionNodes': sum(bool(n['conditionstring']) for n in nodes),
        'scriptNodes': sum(bool(n['userscript']) for n in nodes),
        'checks': checks,
        'modifierRows': len(modifiers),
        'alternateRows': len(alternates),
        'outgoingLinks': len(links),
        'outgoingLinksOutsideUnit': [l for l in links if l['destinationconversationid'] != cid],
        'externalIncomingLinks': rows('SELECT * FROM dlinks WHERE destinationconversationid=? AND originconversationid<>?', (cid,cid)),
        'fullTableMissingLinkTargets': len(missing_full),
        'dentriesOnlyMissingLinkTargets': len(missing_dentries),
        'sixActorTextNodeCounts': {
            str(a): sum(n['actor'] == a and genuine_text(n['dialoguetext']) for n in nodes)
            for a in ACTORS
        },
    })
    all_base.extend([cid,n['id'],n['dialoguetext']] for n in nodes)
    all_alternates.extend([a['rowid'],a['conversationid'],a['dialogueid'],a['condition'],a['alternateline']] for a in alternates)

samples = []
for key in KEYS:
    node = rows('SELECT * FROM temp_table WHERE conversationid=? AND id=?', key)[0]
    text = node.pop('dialoguetext')
    node.pop('title')  # Internal author labels must not substitute for visible prose.
    alts = rows('SELECT rowid,* FROM alternates WHERE conversationid=? AND dialogueid=? ORDER BY rowid', key)
    for alt in alts:
        alt['textIdentity'] = digest(alt.pop('alternateline'))
    samples.append({
        'key': f'{key[0]}:{key[1]}',
        'node': node,
        'textIdentity': digest(text),
        'incoming': rows('SELECT * FROM dlinks WHERE destinationconversationid=? AND destinationdialogueid=?', key),
        'outgoing': rows('SELECT * FROM dlinks WHERE originconversationid=? AND origindialogueid=?', key),
        'alternates': alts,
        'checks': rows('SELECT * FROM checks WHERE conversationid=? AND dialogueid=?', key),
        'modifiers': rows('SELECT * FROM modifiers WHERE conversationid=? AND dialogueid=?', key),
    })

# Serialization feasibility, not UI fidelity or proof of game execution.
payload = {'base':all_base, 'alternates':all_alternates}
serialized = json.dumps(payload, ensure_ascii=False, separators=(',',':')).encode('utf-8')
roundtrip = json.loads(serialized.decode('utf-8'))
assert payload == roundtrip
assert sum(u['fullTableMissingLinkTargets'] for u in units) == 0
pins_after = [pin(x) for x in INPUTS]
assert pins_before == pins_after
report = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Method inspection of ten existing character locators, not a whole-game audit, runtime trace, evaluator dossier, or quality comparison.',
    'readOnly': True,
    'databaseIdentity': {
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'gitBlobSha1': hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest(),
        'meta': rows('SELECT * FROM meta'),
        'meaning': 'Matches the existing public-repository acquisition record. Does not authenticate official game build identity or all published-game content.',
    },
    'sourcePins': pins_before,
    'inputsUnchangedAfterProbe': pins_before == pins_after,
    'actors': rows('SELECT id,name FROM actors WHERE id IN (72,3,6,5,11,18) ORDER BY id'),
    'units': units,
    'samples': samples,
    'serialization': {
        'baseRows': len(all_base),
        'alternateRows': len(all_alternates),
        'bytes': len(serialized),
        'sha256': hashlib.sha256(serialized).hexdigest(),
        'exactUtf8JsonRoundtrip': payload == roundtrip,
        'normalizationApplied': False,
        'limit': 'In-memory export of the fixed English DB fields only. No judge renderer, translation, Japanese source, punctuation-to-raster comparison, runtime event or conditional interpreter was tested.',
    },
    'correction': {
        'initialAdHocPredicate': "coalesce(dialoguetext,'')<>''",
        'problem': 'This preliminary count incorrectly included literal zero sentinels and was not used in the review.',
        'correctedPredicate': "trim(coalesce(dialoguetext,'')) NOT IN ('','0')",
        'limit': 'The corrected count describes DB fields, not rendered or played lines. Zero/group nodes remain available for branch context.',
    },
    'limits': [
        'No network, browser, server, runtime, CI, condition evaluation, or benchmark/product modification.',
        'Existing screenshot audit read as prior evidence; no new independent visual authentication in this method review.',
        'Names read from actor records and actual selected prose; internal descriptions were not accepted as evidence of a character purpose.',
        'Rowid order is a database locator, not a demonstrated alternate precedence rule.',
        'No full text packet was saved; sample hashes point into the unchanged private DB.',
    ],
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'source-probes.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({
    'output':str(OUT/'source-probes.json'),
    'rawNodes':sum(u['rawNodes'] for u in units),
    'textNodes':sum(u['textNodesExcludingEmptyAndZeroSentinels'] for u in units),
    'alternates':len(all_alternates),
    'checks':sum(len(u['checks']) for u in units),
    'dentriesOnlyMissingTargets':sum(u['dentriesOnlyMissingLinkTargets'] for u in units),
    'serialization': report['serialization'],
}, ensure_ascii=False))
