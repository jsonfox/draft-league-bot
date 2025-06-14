// Jest setup file to configure global test environment
// This file runs before each test file

// Disable logging during tests to prevent console output
// Temporarily enabled for debugging
// process.env.DISABLE_LOGGING = "true";

// Suppress console.log/warn/error during tests unless explicitly needed
const originalConsole = global.console;

beforeEach(() => {
  // You can uncomment these lines if you want to suppress all console output
  // global.console = {
  //   ...originalConsole,
  //   log: jest.fn(),
  //   warn: jest.fn(),
  //   error: jest.fn(),
  // };
});

afterEach(() => {
  // Restore console after each test
  global.console = originalConsole;
});
