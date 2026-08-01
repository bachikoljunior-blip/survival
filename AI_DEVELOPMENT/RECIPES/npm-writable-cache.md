# Recipe — install locked dependencies with a writable npm cache

- **Version:** 1.0
- **Purpose:** run `npm ci` in an environment whose default npm cache path is not writable.
- **Last verified:** 2026-08-01 at `193f408`, Node v22.22.2 / npm 10.9.7.

## Applicability

Use when `npm ci` or `npm install` fails while creating or writing `/root/.npm` (or another default
cache), typically in a container that runs as a user without a writable home.

**Do not** use it to diagnose a genuine dependency problem. If the failure names a package,
a registry response, a lockfile mismatch or an engine constraint, this recipe does not apply —
misapplying it hides the real cause behind an environment workaround.

## Inputs and dependencies

A writable scratch directory, and `package-lock.json` present and in sync with `package.json`.

## Usage

```sh
export NPM_CONFIG_CACHE=/path/to/writable/npm-cache
export NPM_CONFIG_LOGS_DIR=/path/to/writable/npm-logs
npm ci
```

If a previous attempt left a partial tree, move it aside rather than deleting it, so the failed
state stays inspectable:

```sh
mv node_modules /tmp/node_modules-failed-$(date +%Y%m%d-%H%M%S)
```

## Verification

```sh
npm ci                                  # exits 0
ls node_modules | wc -l                 # 5: @esbuild, esbuild, playwright, playwright-core, three
npm run build                           # exits 0, writes dist/cinderline.<version>.js
```

## Limitations and known failure modes

- Fixes only the cache location. It does not fix a network-blocked registry, a lockfile mismatch,
  or a platform-incompatible optional dependency.
- The chosen cache directory is not shared between runs in an ephemeral container, so each fresh
  container pays a full download.
- Do not commit the cache path into `package.json`, `.npmrc` or CI configuration. It is a property
  of one environment, not of the project.

## Example and evidence

First occurrence and recovery: `AI_DEVELOPMENT/FAILURES.md` → `OF-001` (2026-07-31), where the
default cache was unwritable and a partial `node_modules` tree was preserved before retrying.

Re-verified 2026-08-01 during the protocol migration: `npm ci` with both variables redirected
installed the five locked packages and exited 0, and `npm run build` then produced the 1.3 MB
production bundle in 732 ms.

The reusable rule, restated from `OF-001`: **an environment failure is not a repository defect.**
Do not "fix" the project in response to one.
