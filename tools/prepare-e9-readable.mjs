/** Restore the authored candidate graph, then format both fixed readers.
 * Full reference prose remains under RUNNER_TEMP and is not exported. */
import { readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = join(process.env.RUNNER_TEMP, 'survival-e9-reader-recovery-r2');
const referenceDir = join(temporary, 'disco-e9-reader-r2');
const candidateDir = join(temporary, 'candidate-reader-r1');
const formattedDir = join(temporary, 'readable-r3');
const reportPath = join(repo, 'test-results/e9-readable-r3/report.json');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const report = { schema_version: 1, status: 'started', scope: 'Restored authored graphs and a newly reconstructed readable presentation. This does not recover the missing old formatter, prove gameplay, establish source blindness, or judge E9.', checks: [], outputs: [] };
function check(name, passed) {
  report.checks.push({ name, passed: !!passed });
  if (!passed) throw Error(name);
}
function put(path, text) { writeFileSync(path, text); return { bytes: Buffer.byteLength(text), sha256: sha(text) }; }
function format(reader, label) {
  const lines = [label, '', reader.notice, ''];
  const fields = [], structure = [];
  const addField = (unit, node, field, value) => {
    if (value === null || value === undefined) return;
    if (typeof value !== 'string') throw Error('Expected authored string');
    fields.push({ unit, node, field, bytes: Buffer.byteLength(value), sha256: sha(value) });
    lines.push(value);
  };
  for (const group of reader.subjects) {
    lines.push('SUBJECT: ' + group.subject, '');
    for (const unit of group.units) {
      lines.push('UNIT ' + unit.id, 'ENTRIES: ' + unit.entry.join(', '), unit.boundary_note, '');
      const ids = new Set(unit.nodes.map(n => n.id));
      check(label + ' ' + unit.id + ' has unique nodes and valid entry points', ids.size === unit.nodes.length && unit.entry.every(id => ids.has(id)));
      // Put each parent before its authored option nodes; keep every ID/edge intact.
      const displayNodes = [...unit.nodes].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
      for (const node of displayNodes) {
        const flags = ['state_dependent', 'conditional_routing', 'check_authored', 'player_option'].filter(key => node[key]);
        lines.push('NODE ' + node.id + ' | SPEAKER: ' + node.speaker);
        if (flags.length) lines.push('AUTHORED FLAGS: ' + flags.join(', '));
        if (node.mood !== undefined) { lines.push('DISPLAYED MOOD:'); addField(unit.id, node.id, 'mood', node.mood); }
        if (node.text === null) lines.push('[Routing node: no spoken text supplied.]');
        else { lines.push('TEXT:'); addField(unit.id, node.id, 'text', node.text); }
        if (node.tag !== undefined) { lines.push('OPTION TAG:'); addField(unit.id, node.id, 'tag', node.tag); }
        if (node.locked_reason !== undefined) { lines.push('LOCKED OPTION REASON:'); addField(unit.id, node.id, 'locked_reason', node.locked_reason); }
        for (const alt of node.alternates) {
          lines.push('ALTERNATIVE ' + alt.variant + ' | state_dependent: ' + !!alt.state_dependent);
          addField(unit.id, node.id, 'alternate.' + alt.variant, alt.text);
        }
        const destinations = node.continuations;
        if (!destinations.every(id => ids.has(id) || id === 'outside selected unit' || id === 'end of unit')) throw Error('Unresolved internal continuation');
        lines.push('CONTINUATIONS: ' + (destinations.length ? destinations.join(', ') : '[none authored]'), '');
        structure.push({ unit: unit.id, node: node.id, flags, alternatives: node.alternates.map(a => a.variant), continuations: destinations });
      }
    }
  }
  return { text: lines.join('\n') + '\n', fields, structure };
}
try {
  const recovery = json(join(repo, 'AI_DEVELOPMENT/EVIDENCE/CONTINUOUS-2026-09-14/disco-e9-method-r2/candidate-reader-recovery.json'));
  const referenceRaw = readFileSync(join(referenceDir, 'reader.json'));
  check('reference reader restored to original pinned r2', sha(referenceRaw) === 'd2991116649fee9756aae5aa7a9f13d78cef7ff9b1519c9f7f2cc6babf293b0e');
  check('story source is the independently checked original', sha(readFileSync(join(repo, 'src/content/story.js'))) === '76023ad5a9fba4716393b555f3562573fd179c3fb3c4c9d560fda8522a22e07c');
  const source = recovery.recovered_r1.source;
  check('recovered candidate generator matches its recorded bytes', sha(source) === '953eea8ecd4d08c695e45b7bd466a7240b4b89ee50142d63b597b94ae587350c' && Buffer.byteLength(source) === 4319);
  mkdirSync(candidateDir);
  symlinkSync(repo, join(temporary, 'survival'), 'dir');
  writeFileSync(join(candidateDir, 'candidate.mjs'), source);
  writeFileSync(join(candidateDir, 'reader.json'), JSON.stringify({ notice: recovery.recovered_r1.shared_notice.text }) + '\n');
  const generated = execFileSync(process.execPath, [join(candidateDir, 'candidate.mjs')], { cwd: temporary, encoding: 'utf8', timeout: 120000 });
  report.candidate_process_stdout = { bytes: Buffer.byteLength(generated), sha256: sha(generated) };
  const pins = recovery.recovered_r1.original_output_pins;
  for (const [file, key] of [['candidate-reader.json', 'candidate_reader'], ['candidate-field-pins.json', 'candidate_field_pins'], ['candidate-private-source-audit.json', 'candidate_private_source_audit']]) {
    const raw = readFileSync(join(candidateDir, file)), pin = pins[key];
    check('original r1 ' + file + ' is byte-identical', raw.length === pin.bytes && sha(raw) === pin.sha256);
    report.outputs.push({ role: 'restored original candidate r1', file, bytes: raw.length, sha256: sha(raw) });
  }
  const candidate = json(join(candidateDir, 'candidate-reader.json'));
  const u11 = candidate.subjects.find(group => group.units.some(unit => unit.id === 'U11'));
  const u12 = candidate.subjects.find(group => group.units.some(unit => unit.id === 'U12'));
  check('the two previously observed headers are present', u11?.subject === 'GARAGE' && u12?.subject === '');
  u11.subject = 'OSTROWSKI'; u12.subject = 'REN';
  const candidateR2 = JSON.stringify(candidate, null, 2) + '\n';
  check('exact known r2 reader recovered by the two observed header changes', sha(candidateR2) === '884e64313242d0345a44f577d03129df812640d2b38eb98f943c1daf8601e39b');
  mkdirSync(formattedDir);
  report.outputs.push({ role: 'restored candidate r2', file: 'candidate-reader.json', ...put(join(formattedDir, 'candidate-reader.json'), candidateR2) });
  const reference = JSON.parse(referenceRaw);
  check('both sides carry the exact same authored-graph notice', reference.notice === candidate.notice);
  for (const [label, reader] of [['A', reference], ['B', candidate]]) {
    const result = format(reader, 'MATERIAL ' + label);
    const name = label + '-readable.txt';
    report.outputs.push({ role: label + ' readable authored graph', file: name, ...put(join(formattedDir, name), result.text), words: result.text.trim().split(/\s+/).length, authored_fields: result.fields.length, nodes: result.structure.length });
    writeFileSync(join(formattedDir, label + '-private-field-audit.json'), JSON.stringify({ fields: result.fields, structure: result.structure }, null, 2) + '\n');
    report.outputs.push({ role: label + ' field and structural pins', file: label + '-private-field-audit.json', bytes: readFileSync(join(formattedDir, label + '-private-field-audit.json')).length, sha256: sha(readFileSync(join(formattedDir, label + '-private-field-audit.json'))) });
  }
  report.status = 'original candidate r1/r2 restored and new readable r3 generated; independent formatting review pending';
  report.prose_policy = 'Full reference/candidate reading material stays under RUNNER_TEMP. Public logs/artifacts contain only this report and reproducible scripts/pins.';
  report.not_claimed = ['original missing formatter recovered', 'new r3 equals previous r2 readable bytes', 'source-blindness', 'played transcript', 'E9 satisfied'];
} catch (error) {
  report.status = 'preparation failed; no comparison';
  report.error_class = error.name;
  report.last_failed_check = report.checks.find(check => !check.passed)?.name || 'execution';
  process.exitCode = 1;
} finally {
  try {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log('[e9-readable-report] ' + JSON.stringify(report));
  } catch {
    process.exitCode = 1;
  }
}
