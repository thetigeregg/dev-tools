export default {
  projectName: 'dev-tools',
  packageDirs: [
    '.',
    'packages/cli',
    'packages/prettier-config',
    'packages/commitlint-config',
    'packages/ncu-config',
  ],
  pr: {
    baseRef: 'origin/main',
    summaryOutputFile: '.pr-summary-prompt.md',
    agentOutputFile: '.pr-agent-prompt.md',
    excludedDiffPaths: [
      ':(glob,exclude)**/package-lock.json',
      ':(glob,exclude)**/dist/**',
    ],
    ciWorkflowName: 'CI',
    coverageArtifactName: 'coverage-reports',
    verifyCommands: ['npm test', 'npm run smoke'],
  },
};
