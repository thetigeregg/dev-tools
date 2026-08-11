module.exports = {
  target: (name) => {
    if (name.startsWith('@types/node')) {
      return 'minor';
    }

    // npm 12 blocks dependency lifecycle scripts by default and hardens
    // unknown-flag/git-dependency handling — hold at 11.x (packageManager
    // field) until that's verified against CI. See packages/ncu-config/README.md.
    if (name === 'npm') {
      return 'minor';
    }

    return 'latest';
  },
};
