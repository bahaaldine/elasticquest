/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  // Exclude integration tests by default (they require Docker)
  testPathIgnorePatterns: ['\\.integration\\.test\\.ts$'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
};
