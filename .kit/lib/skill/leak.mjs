/**
 * leak.mjs — what must not travel when a skill leaves the repository it was learned in.
 *
 * Sharing is the optional step, not the reward. A skill may stay project-local forever and
 * `game2/.claude/skills/round` is the proof that this is a normal outcome: it names KAGEROU,
 * names its two reference titles, and points at `ROUND.md`. It is a good skill and it must
 * never be promoted.
 *
 * The failure being prevented is specific. `game2/HANDOFF.md` carries measured constants —
 * a 0.68 frame floor, a hero p99.9 of 235, a `(950,460 200x110)` canopy box — that are true
 * of one camera in one game. Carried into a shared skill they become instructions to a project
 * that never had that camera, arriving with the authority of a verified kit module. That is
 * worse than no skill: it is a wrong number with a good provenance.
 *
 * `lib/state/secrets.mjs` scans for credentials, in two directions, because a name and a value
 * are different tells. This is the same idea for a different class of thing that should not
 * cross a boundary.
 */

/** Names that identify one project. Extend per promotion; these five repositories are seeded. */
export const DEFAULT_PROJECT_TERMS = [
  'KAGEROU', '陽炎', 'CINDERLINE', 'game2', 'Gptgame', 'survival',
  'Ghost of Tsushima', 'SEKIRO', 'Genshin Impact',
];

const STRUCTURAL = [
  { name: 'absolute path', re: /(?:^|\s)\/(?:home|Users|root|var|opt)\/[\w./-]+/g },
  { name: 'repository path', re: /\b(?:src|shots|docs|dist)\/[\w./-]+\.\w+/g },
  { name: 'commit sha', re: /\b[0-9a-f]{7,40}\b/g },
  { name: 'round id', re: /\br\d+v\d+\b/gi },
  { name: 'host url', re: /https?:\/\/[\w.-]+\.[a-z]{2,}[\w/?#=.-]*/gi },
  { name: 'fixed pixel box', re: /\(\s*\d{2,}\s*,\s*\d{2,}\s+\d+x\d+\s*\)/g },
];

/**
 * @param {string} text        The candidate SKILL.md body.
 * @param {object} [options]
 * @param {string[]} [options.terms]   Project nouns to refuse.
 * @param {string[]} [options.allow]   Exact strings that are legitimately shared (e.g. `.kit/lib/...`).
 * @returns {Array<{kind: string, match: string, line: number}>} findings, empty when it may travel
 */
export function scanForProjectLeak(text, { terms = DEFAULT_PROJECT_TERMS, allow = [] } = {}) {
  const findings = [];
  const lines = String(text).split('\n');
  const allowed = (m) => allow.some((a) => m.includes(a) || a.includes(m));

  lines.forEach((line, i) => {
    // Fenced-code lines are exempt from nothing. A shared skill's example command is exactly
    // where a project path travels unnoticed, which is why the allow list is explicit.
    for (const term of terms) {
      const at = line.toLowerCase().indexOf(term.toLowerCase());
      if (at >= 0 && !allowed(term)) findings.push({ kind: 'project name', match: term, line: i + 1 });
    }
    for (const { name, re } of STRUCTURAL) {
      for (const m of line.matchAll(re)) {
        if (!allowed(m[0])) findings.push({ kind: name, match: m[0].trim(), line: i + 1 });
      }
    }
  });
  return findings;
}

/**
 * The full promotion bar: shareable only when two repositories independently found it so.
 *
 * "Two repositories" means two pieces of evidence produced by different work, not one record
 * copied across. `game2` F-001 and `survival` OF-001 are the real thing — the same environment
 * defect, found separately, fixed differently (a `--cache` flag against `NPM_CONFIG_CACHE`),
 * which is what makes the shared rule trustworthy rather than merely repeated.
 *
 * @param {object} input
 * @param {string} input.text
 * @param {Array<{repo: string, ref: string, mechanism?: string}>} input.evidence
 * @param {object} [input.evaluation]  The candidate's evaluation record.
 * @param {string[]} [input.evaluatedIn] Repositories the case set was run in.
 * @returns {string[]} failures, empty when it may be promoted
 */
export function checkPromotion({ text, evidence = [], evaluation, evaluatedIn = [] }, options = {}) {
  const failures = [];
  const repos = new Set(evidence.map((e) => e.repo));
  if (repos.size < 2) {
    failures.push(`P1: evidence from ${repos.size} repository/ies; promotion needs 2 independent ones (staying project-local is a valid outcome)`);
  }
  const mechanisms = new Set(evidence.map((e) => e.mechanism).filter(Boolean));
  if (repos.size >= 2 && mechanisms.size < 2) {
    failures.push('P2: the same mechanism in both repositories — that is one case observed twice, not two implementations agreeing');
  }
  if (evaluatedIn.length < 2) {
    failures.push(`P3: the case set was run in ${evaluatedIn.length} repository/ies; the should_not_fire cases must be re-run in the second`);
  }
  if (!evaluation || evaluation.verdict !== 'adopt') {
    failures.push('P4: no adopting evaluation to promote');
  }
  const leaks = scanForProjectLeak(text, options);
  for (const l of leaks) failures.push(`P5: ${l.kind} '${l.match}' on line ${l.line} would travel to another project`);
  return failures;
}
