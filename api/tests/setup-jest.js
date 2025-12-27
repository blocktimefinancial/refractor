/**
 * Jest Test Setup
 *
 * Configures the test environment for all test files.
 * Sets up mocks, environment variables, and global utilities.
 */

// Set test environment
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error"; // Reduce noise during tests

// Mock logger to prevent console output during tests
jest.mock("../utils/logger", () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
    child: jest.fn(() => mockLogger),
    forComponent: jest.fn(() => mockLogger),
    forRequest: jest.fn(() => mockLogger),
  };
  return mockLogger;
});

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Allow any pending timers to clear
  await new Promise((resolve) => setTimeout(resolve, 100));
});
