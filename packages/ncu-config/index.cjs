module.exports = {
  target: (name) => {
    if (name.startsWith('@types/node')) {
      return 'minor';
    }

    return 'latest';
  },
  reject: (name) => name === 'typescript',
};
