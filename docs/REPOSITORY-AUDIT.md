# Repository source audit scope

The repository scanner analyzes supported source and configuration files in a
public repository at one immutable Git commit. It inventories the repository,
reads blobs by SHA and records successful reads separately from excluded and
failed files. It does not execute repository code or follow submodules, symlinks
or Git LFS pointers. Private repository access requires a separate customer-bound
authorization design; the shared application credential is not used for it.

## Completion evidence

The dashboard may show **Source coverage complete** only when:

- the inventory is complete and identifies a valid commit SHA;
- at least one eligible file was successfully decoded and analyzed;
- all eligible files were scanned, without failed reads or analysis failures;
- inventoried files equal eligible files plus explicitly excluded files;
- no inventory, execution or output limit interrupted the run.

This is completion of the stated source-check scope, not proof that no
vulnerabilities exist. It is not a penetration test, runtime authorization test,
dependency audit, infrastructure audit or compliance certification. Unsupported
formats and generated/dependency directories appear as exclusions in the report.
Tests are included because real secrets can occur in test code.

## Findings and recommendations

Static patterns produce review candidates, with confidence and disposition.
JavaScript regular-expression matching is distinguished from command execution;
comments, documentation and detection text are not treated as executable code.
Recognizable credential patterns are still checked in comments. Credential-like
values are redacted from evidence. Explicit dummy test credentials are
informational; recognizable provider credentials are not dismissed merely
because they appear in a test file.

The rules are lexical heuristics, not a complete parser or data-flow engine.
They can miss vulnerabilities and can still produce false positives. In
particular, generic secret assignment detection does not cover every JSON/YAML
key structure. A candidate's severity does not establish exploitability.
Control references are guidance, and compliance remains **Not assessed**.

## Resource protection and incomplete reports

There is no 60-file sampling limit. Processing is bounded to protect the shared
service: 20,000 inventory entries, 512 KiB per source file, 64 MiB source bytes,
four concurrent reads, a cooperative 120-second scan budget, and bounded
inventory metadata and finding output. Exact limits are included in
`scan_coverage.limits`. A file can also exceed the 1,000-candidate per-file output
limit. Any reached limit produces explicit incomplete coverage. A network read
or individual analysis operation can finish after the cooperative time budget;
the result still cannot claim complete coverage.

The report lists exclusion/failure reasons and preserves successful partial
results. It does not silently substitute a sample for a complete result.

## Paid full-audit release gate

Do not advertise unlimited repository audits or charge on the assumption that
an incomplete result is complete. Larger repositories need a durable queued
worker with checkpoints, resumable inventory/analysis, per-customer budgets and
stored reports. Current deep reports remain in process memory and do not survive
a backend restart. The commercial entitlement/credit flow and a renewed cost
benchmark are separate prerequisites for a paid full-audit offer.
