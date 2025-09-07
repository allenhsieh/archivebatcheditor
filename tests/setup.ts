// Test setup file
// This file runs before all tests to set up the testing environment

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.ARCHIVE_ACCESS_KEY = 'test-access-key';
process.env.ARCHIVE_SECRET_KEY = 'test-secret-key';  
process.env.ARCHIVE_EMAIL = 'test@example.com';
process.env.YOUTUBE_API_KEY = 'test-youtube-key';
process.env.YOUTUBE_CHANNEL_ID = 'UCtest12345';

// Set a test port to avoid conflicts
process.env.PORT = '3333';

// Increase Jest timeout for API tests
jest.setTimeout(10000);

// Mock console.log/warn in tests to reduce noise
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});