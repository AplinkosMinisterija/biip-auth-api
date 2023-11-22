module.exports = {
  setupFiles: ['./test/helpers/setup.js'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/*.spec.(ts|js)'],
  testTimeout: 60000,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};
