Run `npx devx pr prep`, then read `prompts/pr-prep-prompt.md` and work through it.

## Ship the branch

Running this command counts as the user's explicit request to commit, push, and open the PR. Once prep, the changeset check, and the Go/No-Go gate are done, ship the branch. If unresolved blockers remain, stop after the PR summary and ask before pushing.

1. **Commit**: if the working tree has changes, stage them and commit with your suggested Conventional Commit message. Let the pre-commit and commit-msg hooks run. If a hook fails, fix the cause and commit again. Never use `--no-verify`. Do not commit generated `prompts/` output.
2. **Push**: if the branch has no upstream, run `git push -u origin HEAD`. Otherwise run `git push`. Never force-push.
3. **Create the PR**: if `gh pr view` finds an open PR for the branch, do not create a duplicate. Report its URL and leave its title and body as they are unless the user asks you to change them. Otherwise, write the filled PR template body to a temp file and run `gh pr create --base <base branch> --title "<suggested PR title>" --body-file <file>`. Take the base branch from `pr.baseRef` in `devx.config.mjs` without the remote prefix (default `main`).
4. **Link**: end your response with the PR URL as a Markdown link.
