/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json'],
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 25,
      functions: 24,
      lines: 30,
    },
    './src/common/security/sanitize-sensitive-data.ts': {
      statements: 75,
      branches: 35,
      functions: 90,
      lines: 75,
    },
    './src/modules/audit/audit.service.ts': {
      statements: 50,
      branches: 10,
      functions: 50,
      lines: 50,
    },
    './src/modules/auth/auth.service.ts': {
      statements: 70,
      branches: 25,
      functions: 30,
      lines: 70,
    },
    './src/modules/auth/mfa.service.ts': {
      statements: 50,
      branches: 15,
      functions: 65,
      lines: 50,
    },
    './src/modules/auth/session.service.ts': {
      statements: 50,
      branches: 8,
      functions: 50,
      lines: 50,
    },
    './src/modules/jobs/queue-recovery.service.ts': {
      statements: 55,
      branches: 10,
      functions: 35,
      lines: 55,
    },
    './src/modules/mcp/mcp-action.service.ts': {
      statements: 65,
      branches: 10,
      functions: 60,
      lines: 65,
    },
    './src/modules/reports/report.worker.ts': {
      statements: 40,
      branches: 10,
      functions: 20,
      lines: 40,
    },
    './src/modules/tickets/ticket-access.service.ts': {
      statements: 90,
      branches: 50,
      functions: 75,
      lines: 90,
    },
    './src/modules/tickets/ticket-workflow.service.ts': {
      statements: 85,
      branches: 40,
      functions: 90,
      lines: 85,
    },
  },
  testEnvironment: 'node',
};
