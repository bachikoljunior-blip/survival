/** Independent parser for actual r3 output. No formatter import or text regeneration.
 * Full input/output prose is read only from RUNNER_TEMP; public results are counts/hashes/status codes.
 * Text spans are consumed at exact original UTF-16 lengths after validating UTF-8 round trips.
 * Null routing rows require their marker and remain in graph/node counts, not authored string counts.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const FLAG_NAMES = ['state_dependent','conditional_routing','check_authored','player_option'];
function must(ok, code) { if (!ok) { const e = new Error(code); e.auditCode = code; throw e; } }
function effectiveFlags(node) {
  return FLAG_NAMES.map(key => { must(node[key] === undefined || typeof node[key] === 'boolean', 'SOURCE_FLAG_TYPE'); return !!node[key]; });
}
function specs(node) {
  const out = [];
  if (node.text !== null) out.push(['text','text',node.text]);
  for (const key of ['mood','tag','locked_reason']) if (node[key] !== undefined) out.push([key,key,node[key]]);
  must(Array.isArray(node.alternates), 'SOURCE_ALTERNATES');
  const variants = new Set();
  for (const alt of node.alternates) {
    const variant = String(alt.variant);
    must(!variants.has(variant), 'SOURCE_ALT_DUPLICATE'); variants.add(variant);
    must(typeof alt.state_dependent === 'boolean', 'SOURCE_ALT_FLAG_TYPE');
    out.push(['alternate.' + variant,'alternate',alt.text]);
  }
  for (const [, , value] of out) must(typeof value === 'string', 'SOURCE_FIELD_TYPE');
  return out;
}
function ledger() {
  return { counts:{subjects:0,units:0,nodes:0,fields:0,text:0,mood:0,tag:0,locked_reason:0,alternate:0,null_routing:0,continuations:0,entry_refs:0,state_true:[0,0,0,0]}, fields:[], graph:[] };
}
function field(log, group, unit, node, spec, value, hash, bytes) {
  const [name, kind] = spec;
  log.counts.fields++; log.counts[kind]++;
  log.fields.push({key:JSON.stringify([group,unit,node,name]),bytes:bytes(value),sha256:hash(value)});
}
function nodeRecord(log, group, unit, id, speaker, flags, alternatives, continuations, isNull) {
  log.counts.nodes++; log.counts.null_routing += +isNull; log.counts.continuations += continuations.length;
  flags.forEach((value,i) => log.counts.state_true[i] += +value);
  log.graph.push({key:JSON.stringify(['node',group,unit,id]),speaker,flags,alternatives,continuations,null_routing:isNull});
}
function canonical(rows) { return JSON.stringify([...rows].sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); }
function auditDocument(reader, document, label, hash, bytes) {
  const expected = ledger(), observed = ledger();
  // Build only expected field/graph records, never an expected formatted document.
  reader.subjects.forEach((group, gi) => {
    expected.counts.subjects++;
    expected.graph.push({key:JSON.stringify(['subject',gi]),subject:group.subject});
    const unitIds = new Set();
    for (const unit of group.units) {
      must(!unitIds.has(unit.id), 'SOURCE_UNIT_DUPLICATE'); unitIds.add(unit.id);
      expected.counts.units++; expected.counts.entry_refs += unit.entry.length;
      expected.graph.push({key:JSON.stringify(['unit',gi,unit.id]),entry:unit.entry,boundary:unit.boundary_note});
      const ids = new Set(unit.nodes.map(n => n.id));
      must(ids.size === unit.nodes.length && unit.entry.every(id => ids.has(id)), 'SOURCE_NODE_OR_ENTRY');
      for (const node of unit.nodes) {
        for (const spec of specs(node)) field(expected,gi,unit.id,node.id,spec,spec[2],hash,bytes);
        must(node.continuations.every(id => ids.has(id) || id === 'end of unit' || id === 'outside selected unit'), 'SOURCE_CONTINUATION');
        nodeRecord(expected,gi,unit.id,node.id,node.speaker,effectiveFlags(node),
          node.alternates.map(a => [String(a.variant),a.state_dependent]),node.continuations,node.text === null);
      }
    }
  });
  let position = 0, spans = 0, parentOptionPairs = 0;
  const line = () => { const end = document.indexOf('\n',position); must(end >= 0,'LINE_TERMINATOR'); const text = document.slice(position,end); position=end+1; return text; };
  const exactLine = text => must(line() === text,'WRAPPER_LINE');
  const value = wanted => {
    must(typeof wanted === 'string','SOURCE_WRAPPER_TYPE');
    const actual = document.slice(position,position+wanted.length);
    position += wanted.length;
    must(actual === wanted,'FIELD_TEXT');
    must(document[position] === '\n','FIELD_TERMINATOR'); position++; spans++;
    return actual;
  };
  exactLine('MATERIAL ' + label); exactLine(''); value(reader.notice); exactLine('');
  reader.subjects.forEach((group, gi) => {
    const heading=line(); must(heading.startsWith('SUBJECT: '),'SUBJECT_HEADER');
    const subject=heading.slice('SUBJECT: '.length); must(subject === group.subject,'SUBJECT_VALUE'); exactLine('');
    observed.counts.subjects++; observed.graph.push({key:JSON.stringify(['subject',gi]),subject});
    for (const unit of group.units) {
      const unitLine=line(); must(unitLine === 'UNIT ' + unit.id,'UNIT_HEADER');
      const entryLine=line(); must(entryLine.startsWith('ENTRIES: '),'ENTRY_HEADER');
      const entryText=entryLine.slice('ENTRIES: '.length), entries=entryText === '' ? [] : entryText.split(', ');
      const boundary=value(unit.boundary_note); exactLine('');
      observed.counts.units++; observed.counts.entry_refs += entries.length;
      observed.graph.push({key:JSON.stringify(['unit',gi,unit.id]),entry:entries,boundary});
      const sourceNodes=new Map(unit.nodes.map(n => [n.id,n])), visited=new Map();
      for (let number=0; number<unit.nodes.length; number++) {
        const nodeLine=line(), match=/^NODE (.+) \| SPEAKER: (.*)$/.exec(nodeLine);
        must(!!match,'NODE_HEADER');
        const [,id,speaker]=match, node=sourceNodes.get(id);
        must(!!node && !visited.has(id),'NODE_MISSING_EXTRA_DUPLICATE'); visited.set(id,number);
        const required=new Map(specs(node).map(spec => [spec[0],spec])), seen=new Set(), alternatives=[];
        let flags=FLAG_NAMES.map(() => false), flagsSeen=false, nullSeen=false, destinations=null;
        const readField=name => {
          const spec=required.get(name); must(!!spec && !seen.has(name),'FIELD_MISSING_EXTRA_DUPLICATE');
          const actual=value(spec[2]); seen.add(name); field(observed,gi,unit.id,id,spec,actual,hash,bytes);
        };
        while (destinations === null) {
          const header=line();
          if (header.startsWith('CONTINUATIONS: ')) {
            const body=header.slice('CONTINUATIONS: '.length);
            destinations=body === '[none authored]' ? [] : body.split(', ');
          } else if (header.startsWith('AUTHORED FLAGS: ')) {
            must(!flagsSeen,'FLAGS_DUPLICATE'); flagsSeen=true;
            const names=header.slice('AUTHORED FLAGS: '.length).split(', ');
            must(new Set(names).size === names.length && names.every(n => FLAG_NAMES.includes(n)), 'FLAGS_UNKNOWN');
            flags=FLAG_NAMES.map(n => names.includes(n));
          } else if (header === '[Routing node: no spoken text supplied.]') {
            must(node.text === null && !nullSeen,'NULL_ROUTING_MARKER'); nullSeen=true;
          } else if (header === 'TEXT:') readField('text');
          else if (header === 'DISPLAYED MOOD:') readField('mood');
          else if (header === 'OPTION TAG:') readField('tag');
          else if (header === 'LOCKED OPTION REASON:') readField('locked_reason');
          else {
            const alt=/^ALTERNATIVE (.+) \| state_dependent: (true|false)$/.exec(header);
            must(!!alt,'UNMAPPED_OUTPUT');
            readField('alternate.' + alt[1]); alternatives.push([alt[1],alt[2] === 'true']);
          }
        }
        exactLine('');
        must(seen.size === required.size && [...required.keys()].every(key => seen.has(key)), 'FIELD_OMISSION');
        must(nullSeen === (node.text === null),'NULL_ROUTING_OMISSION');
        nodeRecord(observed,gi,unit.id,id,speaker,flags,alternatives,destinations,nullSeen);
      }
      // This is display-context order, not an assertion that numbered nodes execute in order.
      for (const node of unit.nodes) {
        const parent=/^(.*)C[0-9]+$/.exec(node.id);
        if (node.player_option && parent && sourceNodes.has(parent[1])) {
          must(visited.get(parent[1]) < visited.get(node.id),'OPTION_BEFORE_PROMPT'); parentOptionPairs++;
        }
      }
    }
  });
  must(position === document.length,'UNMAPPED_TRAILING_OUTPUT');
  must(canonical(expected.fields) === canonical(observed.fields),'FIELD_LEDGER');
  must(canonical(expected.graph) === canonical(observed.graph),'GRAPH_LEDGER');
  must(JSON.stringify(expected.counts) === JSON.stringify(observed.counts),'COUNT_LEDGER');
  return {
    expected_counts:expected.counts, observed_counts:observed.counts,
    expected_field_ledger_sha256:hash(canonical(expected.fields)), observed_field_ledger_sha256:hash(canonical(observed.fields)),
    expected_graph_ledger_sha256:hash(canonical(expected.graph)), observed_graph_ledger_sha256:hash(canonical(observed.graph)),
    exact_value_spans:spans, parent_before_option_pairs:parentOptionPairs,
    consumed_output_utf8_bytes:bytes(document.slice(0,position)), unconsumed_output_utf8_bytes:bytes(document.slice(position))
  };
}

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const reportPath=join(repo,'test-results/e9-readable-r3/field-audit.json');
const report={schema_version:1,status:'FAIL',scope:'Exact authored-text spans and parsed graph metadata; no game execution or quality judgment.',cases:[]};
const digest=raw => createHash('sha256').update(raw).digest('hex');
const byteSize=text => Buffer.byteLength(text,'utf8');
let failed=false;
try {
  must(!!process.env.RUNNER_TEMP,'RUNNER_TEMP_MISSING');
  const base=join(process.env.RUNNER_TEMP,'survival-e9-reader-recovery-r2');
  const cases=[
    ['A',join(base,'disco-e9-reader-r2/reader.json'),join(base,'readable-r3/A-readable.txt'),'d2991116649fee9756aae5aa7a9f13d78cef7ff9b1519c9f7f2cc6babf293b0e'],
    ['B',join(base,'readable-r3/candidate-reader.json'),join(base,'readable-r3/B-readable.txt'),'884e64313242d0345a44f577d03129df812640d2b38eb98f943c1daf8601e39b']
  ];
  for (const [label,inputPath,textPath,expectedHash] of cases) {
    const result={label,status:'FAIL'};
    try {
      const input=readFileSync(inputPath), output=readFileSync(textPath);
      result.input_bytes=input.length; result.output_bytes=output.length;
      result.input_sha256=digest(input); result.output_sha256=digest(output);
      must(result.input_sha256 === expectedHash,'READER_PIN');
      const inputText=input.toString('utf8'), document=output.toString('utf8');
      must(Buffer.from(inputText,'utf8').equals(input) && Buffer.from(document,'utf8').equals(output),'UTF8_ROUNDTRIP');
      Object.assign(result,auditDocument(JSON.parse(inputText),document,label,digest,byteSize));
      result.status='PASS';
    } catch (error) {
      failed=true; result.error_code=error.auditCode || 'READ_PARSE_OR_UNEXPECTED';
    }
    report.cases.push(result);
  }
  report.status=failed ? 'FAIL' : 'PASS';
} catch (error) {
  failed=true; report.error_code=error.auditCode || 'PREPARATION';
}
try {
  mkdirSync(dirname(reportPath),{recursive:true});
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('[e9-field-audit] '+JSON.stringify(report));
} catch {
  failed=true;
  console.log('[e9-field-audit] {"status":"FAIL","error_code":"REPORT_WRITE"}');
}
process.exitCode=failed ? 1 : 0;
