# AGENTS.md

## Evidence-based review, CI, and conflict investigation

GitHub status labels and summary states are metadata, not proof of the underlying reality. Never treat `outdated`, `resolved`, `dismissed`, `closed`, or similar labels as evidence that a finding is obsolete, fixed, understood, or invalid.

### Review comments and threads

- Read every relevant review thread in full and in context: the original comment, replies, inline discussion, the diff and code originally flagged, subsequent changes, and the current implementation.
- Inspect threads marked `outdated`, `resolved`, or `dismissed`. A thread can become outdated automatically after a branch update; a resolved or dismissed thread may have been dismissed without addressing the concern or may reflect a misunderstanding.
- Independently assess whether the original concern was valid. Trace the affected code and verify whether the current implementation actually addresses it.
- Do not infer that a finding is fixed or invalid from its status. Do not resolve or dismiss a finding until its underlying concern has been understood and, when confirmed, corrected and verified.

### CI logs and failures

- Read the complete relevant job logs, not only the final error, annotation, or summary. Include earlier steps and output needed to understand the run and identify the actual failure.
- Identify the first causal failure and distinguish root causes from independent failures and downstream or cascading errors. Do not mistake a consequential error for the original cause.
- Inspect the workflow definition and relevant configuration when interpreting a run. Verify the credentials, permissions, conditions, and execution paths actually used; do not infer behavior from a UI summary or an assumed environment state.
- Verify claimed corrections against the current code and configuration, then use a fresh run or an appropriate local reproduction where possible.

### Merge conflicts and branch updates

- Inspect the complete conflict details and conflict markers, both sides of each conflict, the base and head revisions, merge base, changed files, and relevant diffs. Understand the intent of both sides before resolving; never choose `ours` or `theirs` blindly.
- Do not assume that an `update branch` event, a changed conflict indicator, or an `outdated` review thread means the conflict or finding is resolved.
- After resolution, inspect the resulting diff and code to verify that both sides' intended behavior is preserved and unrelated work has not been lost. Run relevant checks.

### Evidence and conclusions

- Base conclusions on the underlying code, complete review context, full relevant logs, configuration, and reproducible checks—not on status labels alone.
- State what was directly inspected, what was verified, and what remains uncertain. Never claim a finding is fixed or a check passed without supporting evidence.
