Run `npx devx pr feedback $ARGUMENTS`, then read `prompts/pr-feedback-prompt.md` and work through it.

## Ship the fixes

Running this command counts as the user's explicit request to commit, push, and resolve the review threads you fixed. When the Definition of Done checks pass locally, ship the fixes.

In the steps below, `<PR>` means the PR number: the first argument in `$ARGUMENTS`. Leave out flags such as `--copilot-only`.

1. **Check the branch**: confirm the current branch matches `gh pr view <PR> --json headRefName`. If it does not, stop and ask before committing.
2. **Commit**: if the working tree has changes, stage them and commit with your suggested Conventional Commit message. Let the pre-commit and commit-msg hooks run. If a hook fails, fix the cause and commit again. Never use `--no-verify`. Do not commit generated `prompts/` output.
3. **Push**: if the branch has no upstream, run `git push -u origin HEAD`. Otherwise run `git push`. Never force-push. Do not resolve any threads until the push succeeds.
4. **Resolve fixed threads**: each task under `# Inline Review Tasks` in the prompt has a `[thread: <id>]` marker. For each task the pushed commit fully addresses, resolve its thread with:

   ```sh
   gh api graphql -F id=<thread id> -f query='
     mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }'
   ```

   Leave threads unresolved if you declined the feedback, only partly addressed it, or are unsure about it. General review notes have no thread to resolve.

5. **Report**: end your response with the PR URL as a Markdown link. Also list the threads you resolved and the ones you left open, each with the reason.
