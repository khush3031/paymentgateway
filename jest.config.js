module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.js', '!src/app.js', '!src/selfTest.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
  clearMocks: true
};
