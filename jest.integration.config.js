module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.integration.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};