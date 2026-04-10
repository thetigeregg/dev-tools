export default {
  projectName: 'dev-tools',
  packageDirs: [
    '.',
    'packages/cli',
    'packages/prettier-config',
    'packages/commitlint-config',
    'packages/lint-staged-config',
    'packages/ncu-config',
  ],
  worktree: {
    adapterModule: './tools/devx/worktree-adapter.mjs',
  },
  pr: {
    baseRef: 'origin/main',
    reviewOutputFile: 'prompts/pr-review-prompt.md',
    agentOutputFile: 'prompts/pr-agent-prompt.md',
    excludedDiffPaths: [':(glob,exclude)**/package-lock.json', ':(glob,exclude)**/dist/**'],
    ciWorkflowName: 'CI',
    coverageArtifactName: 'coverage-reports',
    verifyCommands: ['npm test', 'npm run smoke'],
  },
};
