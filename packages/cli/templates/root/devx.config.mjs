export default {
  projectName: 'my-project',
  branchPrefix: 'feat/',
  baseBranch: 'main',
  worktreeRoot: 'worktrees',
  packageDirs: ['.'],
  env: {
    exampleFile: '.env.example',
    localFile: '.env',
  },
  pr: {
    baseRef: 'origin/main',
    reviewOutputFile: '.pr-review-prompt.md',
    agentOutputFile: '.pr-agent-prompt.md',
    excludedDiffPaths: [':(glob,exclude)**/package-lock.json', ':(glob,exclude)**/dist/**'],
    ciWorkflowName: 'CI',
    coverageArtifactName: 'coverage-reports',
    verifyCommands: ['npm run lint', 'npm test'],
  },
};
