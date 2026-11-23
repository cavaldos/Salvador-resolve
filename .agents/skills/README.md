# Project UI skills

Installed 2026-11-22 (UTC) from the trusted upstream repositories below. These are agent instructions and examples, not UI components. Complete selected folders are vendored unchanged; no upstream instructions were patched.

| Local folder | Upstream | Exact fetched commit |
| --- | --- | --- |
| `frontend-design/` | https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/frontend-design | `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` |
| `webapp-testing/` | https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/webapp-testing | `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` |
| `web-design-guidelines/` | https://github.com/vercel-labs/agent-skills/tree/5a37a6329fbad3666c3207392a6a7c0110e92efb/skills/web-design-guidelines | `5a37a6329fbad3666c3207392a6a7c0110e92efb` |

## Use in Pi

Run `/reload` in the current session, then invoke `/skill:frontend-design`, `/skill:webapp-testing`, or `/skill:web-design-guidelines` with your task. Skills are also discoverable automatically by description.

Apply guidance to this project's **Preact/Tauri** context; do not assume React/Next.js infrastructure or add framework dependencies. Browser-only tests may need Tauri IPC/API mocks and cannot establish native desktop integration correctness. Project requirements take precedence over conflicting style preferences (for example sentence case versus title case).

## Review and prerequisites

All selected instructions, references, four Python files, and included license texts were reviewed before copying. No suspicious upload, credential harvesting, or dependency-installation payload was found. No downloaded script was executed, dependency installed, or application file changed during installation.

`webapp-testing` requires Python, Python Playwright, its Chromium browser and applicable OS libraries, plus a running application/dev server. These prerequisites were **not installed or runtime-tested**. Its helper deliberately uses `shell=True` for caller-supplied server commands: use trusted commands only. It checks TCP readiness rather than application health, buffers server output, and may not clean up descendant processes. Examples contain illustrative selectors, localhost URLs, and `/mnt/user-data/outputs` or `/tmp` paths; adapt them before use. Screenshots and console logs can contain sensitive application data; keep outputs local and review them before sharing.

The Vercel skill at this commit explicitly uses bundled `references/command.md` and forbids fetching rules from the network during reviews. **No live URL is fetched on use.** Its remote source is https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md; bundled SHA-256 is `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234` (verified). The network commands in its update section are manual maintenance instructions, not installation steps; re-review any future update.

## Licensing

Anthropic's Apache-2.0 license texts are retained in each selected folder as `LICENSE.txt`. Its repository-wide third-party notices concern software/fonts not included in these selected folders.

Vercel's upstream repository README declares MIT; its complete unmodified README is preserved at `licenses/vercel-agent-skills-README.md`. The fetched repository and selected folder contain no standalone license/copyright notice, and the bundled guidelines have no additional notice. No missing legal text or copyright holder has been invented; obtain clarification upstream if complete license wording is required for redistribution.

## Installation validation

Validate the three YAML frontmatters (unique lowercase-hyphen names matching folders, name ≤64 characters, description ≤1024), bundled local references and licenses, absence of escaping symlinks, byte-for-byte upstream copies, bundled guidelines hash, and syntax-only compilation of all four Python files without execution or bytecode output. Runtime browser tests and session reload/discovery are separate follow-up checks.
