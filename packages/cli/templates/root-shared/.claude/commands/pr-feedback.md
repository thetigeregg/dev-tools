Run `npx devx pr feedback $ARGUMENTS`, then read `prompts/pr-feedback-prompt.md` and work through it.

## Ship the fixes

Running this command counts as the user's explicit request to commit, push, and resolve the review threads you fixed. When the Definition of Done checks pass locally, ship the fixes:

1. **Check the branch**: confirm the current branch matches `gh pr view $ARGUMENTS --json headRefName`. If it does not, stop and ask before committing.
2. **Commit**: if the working tree has changes, stage them and commit with your suggested Conventional Commit message. Let the pre-commit and commit-msg hooks run. If a hook fails, fix the cause and commit again. Never use `--no-verify`. Do not commit generated `prompts/` output.
3. **Push**: if the branch has no upstream, run `git push -u origin HEAD`. Otherwise run `git push`. Never force-push. Do not resolve any threads until the push succeeds.
4. **Resolve fixed threads**: get the PR's review thread IDs with:

   ```sh
   gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=$ARGUMENTS -f query='
     query($owner:String!, $repo:String!, $pr:Int!) {
       repository(owner:$owner, name:$repo) {
         pullRequest(number:$pr) {
           reviewThreads(first:100) {
             nodes { id isResolved path line comments(last:1) { nodes { author { login } body } } }
           }
         }
       }
     }'
   ```

   Match unresolved threads to the review comments you fixed using the path, line, author, and comment body. Resolve each fixed thread with:

   ```sh
   gh api graphql -F id=<thread id> -f query='
     mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }'
   ```

   Only resolve threads whose feedback the pushed commit fully addresses. Leave threads unresolved if you declined the feedback, only partly addressed it, or are unsure about it. General PR comments and review summaries have no thread to resolve.

5. **Report**: end your response with the PR URL as a Markdown link. Also list the threads you resolved and the ones you left open, each with the reason.
