# test-wrong events (reported by makers, for the test writer; planner rules if disputed)

From N4 (opus-5-5, 16:41), each verified by the maker by hand:
1. T-SUR-04: compares raw verify text with a baseline that has the atlas-tests worktree path baked in; mask the project path.
2. T-SUR-10 and T-REG-01 (--list row): the strip replaces the Threat-model block with "\n" instead of ""; SPEC says the block is a blank line plus two lines.
3. T-SUR-11, T-FS-01, T-FS-02, T-FS-03, T-FS-05: the build timestamp inside JSON briefs (`meta`/brief header in --json) is not masked, so two runs always differ (also true on the old code).
4. T-FS-04 and T-HON-01 and T-THR-15: look for the disclaimer / forbidden phrases in RAW JSON text; the disclaimer contains "ATLAS compliant" in quotes, which JSON escapes. Parse JSON first; check the parsed `atlas.disclaimer` exactly and run the forbidden-phrase scan on parsed string values with the disclaimer sentence removed.
5. T-REG-04: compares classify() with the old result without removing the new additive ATLAS fields.
6. T-RT-04: assumes DS3 (smart-home voice assistant) resolves as is-agentic; in this tree it resolves to accepts-user-input, is-multimodal, uses-llm.
7. T-SUR-09: still uses the old 1,000-character brief growth cap; SPEC is now 1,500.

From N5 (opus-5-5, 16:41):
8. T-REG-01 (reg-help): the root `--help` description for `threats` wraps to 3 lines; the test strips only the first. Owner of the decision: fix the test (keep the disclaimer wording in help).
9. T-REL-01, E2E-01, E2E-05: expect 2.2.0; release is 3.0.0.

From E0:
10. Pre-existing bug (not a test bug): `aigis audit --traits TS1 --json` crashes on a missing EU checklist file on the old code too; baseline recorded the crash. Affects T-NV-06. Tracked for IMPROVEMENTS / fix candidate.
