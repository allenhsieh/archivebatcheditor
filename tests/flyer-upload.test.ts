/**
 * End-to-end integration tests for flyer upload functionality
 * These tests use the real server application
 */

import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server/index.js';

// Mock external API calls
jest.mock('node:https', () => ({
  request: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Flyer Upload E2E Tests (Real Server)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock https.request for Archive.org API calls
    const https = require('node:https');
    https.request.mockImplementation((url: string, options: any, callback?: Function) => {
      // Mock successful Archive.org response
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"success": true}');
          if (event === 'end') handler();
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => {
          if (callback) callback(mockResponse);
        }),
        setTimeout: jest.fn()
      };
      
      return mockRequest;
    });

    // Mock fetch for Archive.org API calls
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success": true}'),
      json: () => Promise.resolve({ success: true })
    });
  });

  describe('Health Check', () => {
    test('server is running and responding', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /api/batch-upload-image-stream', () => {
    test('rejects requests without required fields', async () => {
      const response = await request(app)
        .post('/api/batch-upload-image-stream')
        .expect(400);

      expect(response.body.error).toContain('No files uploaded');
    });

    test('rejects requests without itemsMetadata', async () => {
      // Create a test file
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

      try {
        const response = await request(app)
          .post('/api/batch-upload-image-stream')
          .attach('files', testImagePath)
          .expect(400);

        expect(response.body.error).toContain('itemsMetadata is required');
      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });

    test('handles successful single item upload with Server-Sent Events', async () => {
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

      const itemsMetadata = JSON.stringify([
        {
          identifier: '09.19.15_TestBand',
          metadata: {
            title: 'Test Concert',
            date: '2015-09-19',
            band: 'Test Band',
            venue: 'Test Venue'
          }
        }
      ]);

      try {
        const response = await request(app)
          .post('/api/batch-upload-image-stream')
          .attach('files', testImagePath)
          .field('itemsMetadata', itemsMetadata)
          .expect(200)
          .expect('Content-Type', /text\/event-stream/);

        // Parse Server-Sent Events from response
        const events: any[] = [];
        const sseData = response.text;
        const lines = sseData.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            try {
              const eventData = JSON.parse(lines[i].substring(6));
              events.push(eventData);
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        }

        // Verify expected SSE message sequence
        expect(events.length).toBeGreaterThanOrEqual(2); // start and complete minimum

        // Verify start event
        const startEvent = events.find(e => e.type === 'start');
        expect(startEvent).toBeDefined();
        expect(startEvent.total).toBe(1);

        // Verify complete event
        const completeEvent = events.find(e => e.type === 'complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.total).toBe(1);

        // Verify that fetch was called for Archive.org API
        expect(global.fetch).toHaveBeenCalled();

      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });

    test('handles multiple items upload sequentially', async () => {
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

      const itemsMetadata = JSON.stringify([
        {
          identifier: '09.19.15_Band1',
          metadata: { title: 'Concert 1', date: '2015-09-19' }
        },
        {
          identifier: '06.14.14_Band2', 
          metadata: { title: 'Concert 2', date: '2014-06-14' }
        }
      ]);

      try {
        const response = await request(app)
          .post('/api/batch-upload-image-stream')
          .attach('files', testImagePath)
          .field('itemsMetadata', itemsMetadata)
          .expect(200);

        const events: any[] = [];
        const sseData = response.text;
        const lines = sseData.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            try {
              const eventData = JSON.parse(lines[i].substring(6));
              events.push(eventData);
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        }

        // Verify multiple items were processed
        const startEvent = events.find(e => e.type === 'start');
        expect(startEvent.total).toBe(2);

        // Verify completion
        const completeEvent = events.find(e => e.type === 'complete');
        expect(completeEvent.total).toBe(2);

        // Verify fetch was called for each item
        expect(global.fetch).toHaveBeenCalled();

      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });

    test('handles Archive.org API errors properly', async () => {
      // Mock fetch to return error
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('<html><body>Internal Server Error</body></html>')
      });

      const testImagePath = path.join(__dirname, 'test-image.jpg');
      fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

      const itemsMetadata = JSON.stringify([
        {
          identifier: '09.19.15_ErrorTest',
          metadata: { title: 'Error Test' }
        }
      ]);

      try {
        const response = await request(app)
          .post('/api/batch-upload-image-stream')
          .attach('files', testImagePath)
          .field('itemsMetadata', itemsMetadata)
          .expect(200);

        const events: any[] = [];
        const sseData = response.text;
        const lines = sseData.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            try {
              const eventData = JSON.parse(lines[i].substring(6));
              events.push(eventData);
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        }

        // Verify error was reported properly
        const progressEvents = events.filter(e => e.type === 'progress');
        const errorEvent = progressEvents.find(e => e.status === 'error');
        expect(errorEvent).toBeDefined();
        expect(errorEvent.identifier).toBe('09.19.15_ErrorTest');

        // Verify complete event shows failure
        const completeEvent = events.find(e => e.type === 'complete');
        expect(completeEvent.failed).toBe(1);
        expect(completeEvent.successful).toBe(0);

      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });
  });

  describe('Search Endpoint', () => {
    test('search endpoint works with valid query', async () => {
      // Mock Archive.org search API response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          response: {
            docs: [
              {
                identifier: '09.19.15_TestBand',
                title: 'Test Concert Recording',
                date: '2015-09-19',
                creator: 'test@example.com'
              }
            ],
            numFound: 1
          }
        })
      });

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test band' })
        .expect(200);

      expect(response.body).toHaveProperty('response');
      expect(response.body.response).toHaveProperty('docs');
      expect(response.body.response).toHaveProperty('numFound');
      expect(Array.isArray(response.body.response.docs)).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    test('search endpoint rejects missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});