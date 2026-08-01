# M.6 Telemetry-driven repair and tuning

## Trigger

Reliability, usability, performance, balance, or behavior can be measured and the
data serves a real criterion or defect.

## Content

Prefer local, privacy-preserving measurements such as latency, frame time,
resource use, loading time, bundle size, crashes, errors, completion, retries,
encounter duration, resource economy, success rate, and abandonment.

Do not add remote analytics or transmit user data without explicit approval.

For a tuning experiment:

1. record the relevant baseline;
2. define the target and hypothesis;
3. change one variable or a small related group;
4. run enough controlled trials to reduce obvious noise;
5. compare primary and secondary effects;
6. retain the change only when overall quality improves;
7. roll back regressions;
8. preserve the useful result.

Do not overfit to one tester, seed, device, or metric.

## Stop condition

Deactivate when the measured criterion is met or the experiment budget is spent.

## Project note

`tools/perf.mjs` measures under SwiftShader and deliberately refuses to emit an
fps figure, because that would read as a device claim. Keep that refusal.
