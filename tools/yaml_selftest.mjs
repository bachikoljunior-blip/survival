#!/usr/bin/env node
/**
 * Self-test for the operating-state parsing and schema infrastructure.
 *
 * A check that cannot fail proves nothing, so this suite is half expected-failure
 * fixtures: every rejection case below must actually be rejected, and the suite
 * exits non-zero if a malformed document is quietly accepted.
 *
 * Usage: node tools/yaml_selftest.mjs
 */

import { parseYaml, parseJsonl, YamlError } from './lib/yaml.mjs';
import { validate } from './lib/schema.mjs';

let passed = 0;
const failures = [];

const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
};

const rejects = (name, text, parser = parseYaml) => {
  let threw = null;
  try {
    parser(text);
  } catch (error) {
    threw = error;
  }
  if (threw instanceof YamlError) passed += 1;
  else if (threw) failures.push(`${name}: threw the wrong error type: ${threw}`);
  else failures.push(`${name}: MALFORMED INPUT WAS ACCEPTED`);
};

// ---------------------------------------------------------------- scalars

eq('plain scalars', parseYaml('a: 1\nb: 2.5\nc: true\nd: false\ne: null\nf: ~\ng: text'), {
  a: 1, b: 2.5, c: true, d: false, e: null, f: null, g: 'text',
});
eq('empty value is null', parseYaml('a:\nb: 1'), { a: null, b: 1 });
eq('quoted scalars', parseYaml('a: "x: y"\nb: \'it\'\'s\'\nc: "tab\\there"'), {
  a: 'x: y', b: "it's", c: 'tab\there',
});
eq('quoted numeric stays a string', parseYaml('a: "1.0"\nb: \'2026-08-01\''), { a: '1.0', b: '2026-08-01' });
eq('unquoted date-like stays a string', parseYaml('a: 2026-08-01.1'), { a: '2026-08-01.1' });
eq('hash inside a scalar', parseYaml('a: colour#3 value\nb: x # comment'), { a: 'colour#3 value', b: 'x' });
eq('hash inside quotes', parseYaml('a: "# not a comment"'), { a: '# not a comment' });
eq('colon inside a plain scalar', parseYaml('a: ratio 3:1 fixed'), { a: 'ratio 3:1 fixed' });

// ---------------------------------------------------------------- structure

eq('nested mappings', parseYaml('a:\n  b:\n    c: 1\n  d: 2\ne: 3'), { a: { b: { c: 1 }, d: 2 }, e: 3 });
eq('sequence of scalars', parseYaml('a:\n  - one\n  - two'), { a: ['one', 'two'] });
eq('sequence of mappings', parseYaml('a:\n  - id: x\n    n: 1\n  - id: y\n    n: 2'), {
  a: [{ id: 'x', n: 1 }, { id: 'y', n: 2 }],
});
eq('mapping inside a sequence item', parseYaml('a:\n  - id: x\n    sub:\n      k: v\n  - id: y'), {
  a: [{ id: 'x', sub: { k: 'v' } }, { id: 'y' }],
});
eq('sequence inside a sequence item', parseYaml('a:\n  - id: x\n    tags:\n      - p\n      - q'), {
  a: [{ id: 'x', tags: ['p', 'q'] }],
});
eq('empty sequence value', parseYaml('a: []\nb: {}'), { a: [], b: {} });
eq('flow collections', parseYaml('a: [1, two, "three: 3"]\nb: {k: v, n: 2}'), {
  a: [1, 'two', 'three: 3'], b: { k: 'v', n: 2 },
});
eq('top-level sequence', parseYaml('- a\n- b'), ['a', 'b']);
eq('comments and blank lines', parseYaml('# lead\n\na: 1\n\n# mid\nb: 2\n'), { a: 1, b: 2 });
eq('document with only comments', parseYaml('# nothing\n\n'), null);

// ---------------------------------------------------------------- block scalars

eq('literal block', parseYaml('a: |\n  one\n  two\nb: 1'), { a: 'one\ntwo\n', b: 1 });
eq('literal block stripped', parseYaml('a: |-\n  one\n  two\nb: 1'), { a: 'one\ntwo', b: 1 });
eq('folded block', parseYaml('a: >-\n  one\n  two\n\n  four\nb: 1'), { a: 'one two\nfour', b: 1 });
eq('block scalar keeps indentation', parseYaml('a: |-\n  one\n    deeper\n  back'), { a: 'one\n  deeper\nback' });
eq('block scalar in a sequence item', parseYaml('a:\n  - id: x\n    note: |-\n      line one\n      line two'), {
  a: [{ id: 'x', note: 'line one\nline two' }],
});

// ---------------------------------------------------------------- rejections

rejects('tab indentation', 'a:\n\tb: 1');
rejects('duplicate mapping key', 'a: 1\na: 2');
rejects('duplicate key in a sequence item', 'x:\n  - a: 1\n    a: 2');
rejects('inconsistent indentation', 'a: 1\n  b: 2');
rejects('missing colon', 'a: 1\njust text');
rejects('unterminated double quote', 'a: "open');
rejects('unterminated single quote', "a: 'open");
rejects('unterminated flow sequence', 'a: [1, 2');
rejects('unterminated flow mapping', 'a: {k: v');
rejects('document not starting at column 0', '  a: 1');
rejects('sequence where a key was expected', 'a: 1\n- b');
rejects('flow mapping entry without a colon', 'a: {k}');
rejects('bad escape', 'a: "\\q"');
rejects('invalid ledger line', '{"ok": 1}\nnot json', parseJsonl);

// ---------------------------------------------------------------- jsonl

eq('jsonl parses and numbers lines', parseJsonl('{"a":1}\n\n{"b":2}\n'), [
  { value: { a: 1 }, line: 1 },
  { value: { b: 2 }, line: 3 },
]);

// ---------------------------------------------------------------- schema

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status'],
  properties: {
    id: { type: 'string', pattern: '^[A-Z][A-Z0-9-]*$' },
    status: { enum: ['ready', 'active', 'verified'] },
    count: { type: 'integer', minimum: 0 },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    note: { type: 'string', nullable: true },
    child: { $ref: '#/definitions/child' },
  },
  definitions: { child: { type: 'object', required: ['k'], properties: { k: { type: 'string' } } } },
};

eq('schema accepts a valid record', validate({ id: 'GB-H1', status: 'active' }, SCHEMA), []);
eq('schema accepts a null nullable', validate({ id: 'A', status: 'ready', note: null }, SCHEMA), []);
eq('schema resolves $ref', validate({ id: 'A', status: 'ready', child: { k: 'v' } }, SCHEMA), []);
eq('schema rejects a missing required key', validate({ id: 'A' }, SCHEMA).length, 1);
eq('schema rejects a bad enum', validate({ id: 'A', status: 'done' }, SCHEMA).length, 1);
eq('schema rejects a bad pattern', validate({ id: 'lower', status: 'ready' }, SCHEMA).length, 1);
eq('schema rejects an unexpected property', validate({ id: 'A', status: 'ready', extra: 1 }, SCHEMA).length, 1);
eq('schema rejects the wrong type', validate({ id: 'A', status: 'ready', count: 'x' }, SCHEMA).length, 1);
eq('schema rejects a negative minimum', validate({ id: 'A', status: 'ready', count: -1 }, SCHEMA).length, 1);
eq('schema rejects duplicate array items', validate({ id: 'A', status: 'ready', tags: ['x', 'x'] }, SCHEMA).length, 1);
eq('schema rejects a bad $ref child', validate({ id: 'A', status: 'ready', child: { k: 1 } }, SCHEMA).length, 1);
eq('schema rejects an unresolvable $ref', validate(1, { $ref: '#/definitions/missing' }).length, 1);

// ---------------------------------------------------------------- report

if (failures.length) {
  console.error('Operating-state infrastructure self-test FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n  ${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`Operating-state infrastructure self-test OK — ${passed} checks`);
