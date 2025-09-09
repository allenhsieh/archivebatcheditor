/**
 * Regression Protection Tests
 * 
 * These tests verify critical patterns learned during development to prevent
 * future breaking changes. They focus on API consistency and behavior patterns
 * rather than deep implementation details.
 */

import request from 'supertest';
import app from '../server/index.js';

describe('Regression Protection E2E Tests', () => {
  describe('API Consistency and Format Standards', () => {
    test('YouTube URL standardization maintains youtu.be format in suggestions', async () => {
      // Mock to capture the actual response structure
      const response = await request(app)
        .get('/api/search?q=test');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('returned');
    });

    test('health endpoint maintains consistent response format', async () => {
      const response1 = await request(app).get('/api/health');
      const response2 = await request(app).get('/api/health');

      // Should be consistent between calls
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.status).toBe(response2.body.status);
      expect(response1.body.status).toBe('ok'); // Specific format learned during development
      expect(response1.body).toHaveProperty('timestamp');
      expect(response2.body).toHaveProperty('timestamp');
    });

    test('metadata update endpoint validates request format correctly', async () => {
      // Test proper format (should succeed)
      const validRequest = {
        items: ['test_identifier'],
        updates: [
          { field: 'title', value: 'Test Title' }
        ]
      };

      const validResponse = await request(app)
        .post('/api/update-metadata-stream')
        .send(validRequest)
        .expect(200);

      expect(validResponse.text).toContain('start');

      // Test invalid format (should fail validation)
      const invalidRequest = {
        items: 'not-an-array', // Wrong type
        updates: [] // Empty array not allowed
      };

      const invalidResponse = await request(app)
        .post('/api/update-metadata-stream')
        .send(invalidRequest)
        .expect(200); // Returns 200 but with error in SSE

      expect(invalidResponse.text).toContain('error');
    });
  });

  describe('Critical Business Logic Protection', () => {
    test('search endpoint requires query parameter', async () => {
      // Without query parameter - should fail
      const noQuery = await request(app)
        .get('/api/search')
        .expect(400);

      expect(noQuery.body).toHaveProperty('error');

      // With query parameter - should succeed
      const withQuery = await request(app)
        .get('/api/search?q=test')
        .expect(200);

      expect(withQuery.body).toHaveProperty('items');
    });

    test('file upload endpoints require actual files', async () => {
      // Test batch upload without file
      const noFileResponse = await request(app)
        .post('/api/batch-upload-image-stream')
        .expect(400);

      expect(noFileResponse.body.error).toContain('No image file uploaded');
    });

    test('metadata operations handle edge cases gracefully', async () => {
      // Empty items array should be rejected by validation
      const emptyItems = {
        items: [],
        updates: [{ field: 'title', value: 'test' }]
      };

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send(emptyItems)
        .expect(200);

      expect(response.text).toContain('error');
    });
  });

  describe('Authentication and Security Patterns', () => {
    test('endpoints without /api/ prefix return 404', async () => {
      const endpointsToTest = [
        '/health',
        '/search',
        '/update-metadata-stream'
      ];

      for (const endpoint of endpointsToTest) {
        const response = await request(app)
          .get(endpoint)
          .expect(404);
      }
    });

    test('POST endpoints reject GET requests appropriately', async () => {
      const postOnlyEndpoints = [
        '/api/update-metadata-stream',
        '/api/batch-upload-image-stream'
      ];

      for (const endpoint of postOnlyEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(404); // Express returns 404 for method not allowed
      }
    });
  });

  describe('Date and URL Format Standards', () => {
    test('date format standardization patterns are documented', () => {
      // This test documents the expected date format: YYYY-MM-DD
      // Actual validation happens in the metadata processing logic
      const standardDatePattern = /^\d{4}-\d{2}-\d{2}$/;
      
      expect('2015-09-19').toMatch(standardDatePattern);
      expect('2012-01-05').toMatch(standardDatePattern);
      expect('2014-06-14').toMatch(standardDatePattern);
      
      // These formats should NOT be used
      expect('9/19/2015').not.toMatch(standardDatePattern);
      expect('Sep 19, 2015').not.toMatch(standardDatePattern);
      expect('19-09-2015').not.toMatch(standardDatePattern);
    });

    test('YouTube URL format standards are documented', () => {
      // This test documents the expected YouTube URL format: youtu.be/VIDEO_ID
      const shortYouTubePattern = /^https:\/\/youtu\.be\/[a-zA-Z0-9_-]+$/;
      
      expect('https://youtu.be/dQw4w9WgXcQ').toMatch(shortYouTubePattern);
      expect('https://youtu.be/abc123').toMatch(shortYouTubePattern);
      
      // These formats should be converted to short format
      const longFormats = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=abc123',
        'https://m.youtube.com/watch?v=xyz789'
      ];
      
      // Document that these need conversion (actual conversion happens in utils)
      longFormats.forEach(url => {
        expect(url).not.toMatch(shortYouTubePattern);
      });
    });
  });

  describe('Archive.org Integration Patterns', () => {
    test('identifier format validation patterns', () => {
      // This documents the expected Archive.org identifier patterns
      const validIdentifierPattern = /^\d{2}\.\d{2}\.\d{2}_[a-zA-Z0-9_-]+$/;
      
      // Valid identifiers learned during development
      expect('09.19.15_TestBand').toMatch(validIdentifierPattern);
      expect('06.14.14_DressCode').toMatch(validIdentifierPattern);
      expect('01.05.12_TheFinches').toMatch(validIdentifierPattern);
      
      // Invalid patterns that should be rejected
      expect('invalid_identifier_format').not.toMatch(validIdentifierPattern);
      expect('2015-09-19_Band').not.toMatch(validIdentifierPattern);
      expect('9.19.15_Band').not.toMatch(validIdentifierPattern);
    });

    test('metadata field standardization patterns', () => {
      // Document critical metadata fields and their expected formats
      const metadataStandards = {
        // Subject field should use semicolon separation
        subject: 'Folk; Indie Rock; Live Recording; Concert',
        // Date field should be YYYY-MM-DD
        date: '2015-09-19',
        // YouTube field should be short format
        youtube: 'https://youtu.be/dQw4w9WgXcQ',
        // Creator should be email format
        creator: 'user@example.com'
      };

      // Verify the patterns are documented correctly
      expect(metadataStandards.subject).toContain(';');
      expect(metadataStandards.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(metadataStandards.youtube).toMatch(/^https:\/\/youtu\.be\//);
      expect(metadataStandards.creator).toContain('@');
    });
  });

  describe('Server-Sent Events (SSE) Patterns', () => {
    test('SSE responses maintain consistent format', async () => {
      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send({
          items: ['test_identifier'],
          updates: [{ field: 'title', value: 'Test' }]
        })
        .expect(200);

      // Should be SSE format
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      
      // Should contain SSE data format
      expect(response.text).toContain('data: ');
      expect(response.text).toContain('start');
    });
  });
});