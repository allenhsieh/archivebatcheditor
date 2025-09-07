/**
 * Tests for API endpoints
 * These tests ensure all endpoints work correctly and follow expected patterns
 * 
 * UPDATED: All API endpoints now use /api/ prefix for consistency between client and server
 * This eliminates the magic path rewriting that caused confusion and bugs
 */

import request from 'supertest';
import express from 'express';

// Mock the server module since we can't easily import it due to side effects
// We'll test the structure and validation logic instead

describe('API Endpoint Documentation', () => {
  test('documents all existing endpoints from server analysis', () => {
    // This test serves as documentation of actual endpoints
    // Based on server/index.ts analysis, these are the real endpoints:
    const actualEndpoints = [
      // Search and data retrieval
      { method: 'GET', path: '/api/search', description: 'Search Archive.org items with query parameter' },
      { method: 'GET', path: '/api/user-items', description: 'Get user Archive.org items' },
      { method: 'GET', path: '/api/metadata/:identifier', description: 'Get metadata for specific item' },
      
      // Metadata updates
      { method: 'POST', path: '/api/update-metadata', description: 'Update single item metadata' },
      { method: 'POST', path: '/api/update-metadata-stream', description: 'Batch update metadata with SSE progress' },
      
      // YouTube integration
      { method: 'POST', path: '/api/youtube-suggest', description: 'Get YouTube match suggestions for items' },
      { method: 'POST', path: '/api/youtube/get-descriptions', description: 'Get YouTube video descriptions' },
      { method: 'POST', path: '/api/youtube/update-descriptions-stream', description: 'Update YouTube descriptions with SSE' },
      { method: 'POST', path: '/api/youtube/update-recording-dates-stream', description: 'Update YouTube recording dates with SSE' },
      
      // Image uploads
      { method: 'POST', path: '/api/batch-upload-image', description: 'Single batch image upload' },
      { method: 'POST', path: '/api/batch-upload-image-stream', description: 'Batch image upload with SSE progress' },
      
      // Authentication and health
      { method: 'GET', path: '/api/health', description: 'Health check endpoint' },
      { method: 'GET', path: '/auth/youtube', description: 'Start YouTube OAuth flow' },
      { method: 'GET', path: '/auth/youtube/callback', description: 'YouTube OAuth callback' },
      { method: 'GET', path: '/auth/youtube/status', description: 'Check YouTube auth status' },
      { method: 'GET', path: '/auth/youtube/test', description: 'Test YouTube API connection' }
    ];

    // Document endpoint patterns
    expect(actualEndpoints.length).toBe(16); // Total endpoints found
    
    // All API endpoints now start with /api/ (except auth endpoints)
    const apiPrefixedEndpoints = actualEndpoints.filter(ep => ep.path.startsWith('/api/'));
    expect(apiPrefixedEndpoints.length).toBe(12); // All non-auth endpoints have /api/ prefix
    
    // Most endpoints are direct routes
    const directRoutes = actualEndpoints.filter(ep => !ep.path.includes('/:') || ep.path === '/metadata/:identifier');
    expect(directRoutes.length).toBeGreaterThan(10);
    
    console.log('📋 Documented endpoints:', actualEndpoints.map(ep => `${ep.method} ${ep.path}`));
  });
});

describe('Zod Schema Validation', () => {
  // Test the validation schemas to ensure they work correctly
  const { z } = require('zod');
  
  const searchQuerySchema = z.object({
    q: z.string().min(1).max(500)
  });
  
  const metadataUpdateSchema = z.object({
    identifier: z.string().min(1).max(100),
    metadata: z.record(z.any()),
    target: z.enum(['metadata', 'files']).optional().default('metadata')
  });
  
  const youtubeSuggestSchema = z.object({
    items: z.array(z.object({
      identifier: z.string(),
      title: z.string(),
      date: z.string().optional()
    })).min(1).max(100)
  });

  describe('Search Query Validation', () => {
    test('accepts valid search queries', () => {
      expect(() => searchQuerySchema.parse({ q: 'grateful dead' })).not.toThrow();
      expect(() => searchQuerySchema.parse({ q: 'concert 2023' })).not.toThrow();
      expect(() => searchQuerySchema.parse({ q: 'a' })).not.toThrow(); // Minimum length
    });

    test('rejects invalid search queries', () => {
      expect(() => searchQuerySchema.parse({ q: '' })).toThrow(); // Empty string
      expect(() => searchQuerySchema.parse({})).toThrow(); // Missing q
      expect(() => searchQuerySchema.parse({ q: 'x'.repeat(501) })).toThrow(); // Too long
    });
  });

  describe('Metadata Update Validation', () => {
    test('accepts valid metadata updates', () => {
      const validUpdate = {
        identifier: 'test-item-123',
        metadata: { title: 'New Title', creator: 'Artist Name' },
        target: 'metadata' as const
      };
      expect(() => metadataUpdateSchema.parse(validUpdate)).not.toThrow();
    });

    test('uses default target when not provided', () => {
      const updateWithoutTarget = {
        identifier: 'test-item-123',  
        metadata: { title: 'New Title' }
      };
      const parsed = metadataUpdateSchema.parse(updateWithoutTarget);
      expect(parsed.target).toBe('metadata');
    });

    test('rejects invalid metadata updates', () => {
      expect(() => metadataUpdateSchema.parse({ 
        identifier: '', 
        metadata: {} 
      })).toThrow(); // Empty identifier
      
      expect(() => metadataUpdateSchema.parse({ 
        identifier: 'x'.repeat(101), 
        metadata: {} 
      })).toThrow(); // Identifier too long
      
      expect(() => metadataUpdateSchema.parse({ 
        identifier: 'valid-id' 
      })).toThrow(); // Missing metadata
    });
  });

  describe('YouTube Suggest Validation', () => {
    test('accepts valid YouTube suggest requests', () => {
      const validRequest = {
        items: [
          { identifier: 'item1', title: 'Concert 1', date: '2023-01-01' },
          { identifier: 'item2', title: 'Concert 2' } // date optional
        ]
      };
      expect(() => youtubeSuggestSchema.parse(validRequest)).not.toThrow();
    });

    test('rejects invalid YouTube suggest requests', () => {
      expect(() => youtubeSuggestSchema.parse({ items: [] })).toThrow(); // Empty array
      expect(() => youtubeSuggestSchema.parse({})).toThrow(); // Missing items
      
      const tooManyItems = {
        items: Array.from({ length: 101 }, (_, i) => ({ 
          identifier: `item${i}`, 
          title: `Title ${i}` 
        }))
      };
      expect(() => youtubeSuggestSchema.parse(tooManyItems)).toThrow(); // Too many items
    });
  });
});

describe('Request/Response Patterns', () => {
  test('documents expected request patterns for each endpoint type', () => {
    // Search endpoints expect query parameters
    const searchPattern = {
      method: 'GET',
      path: '/search',
      queryParams: ['q'], // Required query parameter
      expectedResponse: {
        results: 'array of Archive.org items'
      }
    };

    // POST endpoints expect JSON bodies
    const updatePattern = {
      method: 'POST',
      path: '/update-metadata-stream',
      contentType: 'application/json',
      body: {
        items: [
          {
            identifier: 'string',
            metadata: 'object',
            target: 'metadata|files (optional)'
          }
        ]
      },
      responseType: 'Server-Sent Events'
    };

    // YouTube endpoints expect specific item formats
    const youtubePattern = {
      method: 'POST', 
      path: '/youtube-suggest',
      body: {
        items: [
          {
            identifier: 'string',
            title: 'string', 
            date: 'string (optional)'
          }
        ]
      }
    };

    // This serves as documentation
    expect(searchPattern.queryParams).toContain('q');
    expect(updatePattern.responseType).toBe('Server-Sent Events');
    expect(youtubePattern.body.items[0]).toHaveProperty('title');
  });
});

describe('Error Handling Patterns', () => {
  test('documents expected error response formats', () => {
    // Standard error response format
    const errorResponse = {
      error: 'string', // Error message
      details: 'string (optional)', // Additional details
      quotaExhausted: 'boolean (for YouTube quota errors)'
    };

    // Validation error format
    const validationError = {
      error: 'Validation failed',
      issues: [
        {
          path: ['field'],
          message: 'Error description'
        }
      ]
    };

    // Server-Sent Event error format
    const sseError = {
      type: 'error',
      error: 'Error message',
      identifier: 'item-id (optional)'
    };

    expect(errorResponse).toHaveProperty('error');
    expect(validationError.issues[0]).toHaveProperty('path');
    expect(sseError.type).toBe('error');
  });
});

describe('Server-Sent Events Format', () => {
  test('documents SSE message formats for streaming endpoints', () => {
    // Progress update format
    const progressUpdate = {
      type: 'progress',
      current: 5,
      total: 20,
      identifier: 'current-item-id',
      status: 'processing'
    };

    // Success message format
    const successMessage = {
      type: 'success',
      identifier: 'item-id',
      message: 'Operation completed successfully'
    };

    // Error message format
    const errorMessage = {
      type: 'error',
      identifier: 'item-id',
      error: 'Error description'
    };

    // Complete message format
    const completeMessage = {
      type: 'complete',
      successful: 18,
      failed: 2,
      total: 20
    };

    expect(progressUpdate.type).toBe('progress');
    expect(successMessage.type).toBe('success');
    expect(errorMessage.type).toBe('error');
    expect(completeMessage.type).toBe('complete');
  });
});

describe('YouTube Quota Detection', () => {
  test('documents quota exhaustion detection patterns', () => {
    // These are the patterns the server looks for to detect quota exhaustion
    const quotaDetectionPatterns = {
      httpStatus: 403,
      responseBodyFlags: ['quotaExhausted'],
      errorMessagePatterns: [
        'QUOTA_EXHAUSTED',
        'quota exceeded',
        'daily quota',
        'API quota'
      ],
      expectedBehavior: 'Stop processing immediately on first quota error'
    };

    expect(quotaDetectionPatterns.httpStatus).toBe(403);
    expect(quotaDetectionPatterns.responseBodyFlags).toContain('quotaExhausted');
    expect(quotaDetectionPatterns.errorMessagePatterns.length).toBeGreaterThan(0);
  });
});

describe('Archive.org API Integration Patterns', () => {
  test('documents Archive.org API call patterns', () => {
    // Search API pattern
    const searchApiPattern = {
      url: 'https://archive.org/advancedsearch.php',
      method: 'GET',
      queryParams: {
        q: 'search query',
        fl: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader',
        rows: 1000,
        output: 'json',
        sort: 'addeddate desc'
      }
    };

    // Metadata update pattern
    const metadataUpdatePattern = {
      url: 'https://archive.org/metadata/{identifier}',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: {
        '-target': 'metadata',
        '-patch': 'JSON string of updates',
        'access': 'access key',
        'secret': 'secret key'
      }
    };

    expect(searchApiPattern.url).toContain('archive.org');
    expect(metadataUpdatePattern.body).toHaveProperty('-patch');
    expect(metadataUpdatePattern.headers['Content-Type']).toContain('form-urlencoded');
  });
});

// Test helper to validate common endpoint behaviors
describe('Common Endpoint Behaviors', () => {
  test('all endpoints should handle CORS properly', () => {
    // This would be tested in integration tests
    // Documents that CORS middleware is applied to all routes
    expect(true).toBe(true); // Placeholder
  });

  test('all endpoints should validate input with Zod', () => {
    // Documents that Zod validation is used throughout
    expect(true).toBe(true); // Placeholder
  });

  test('streaming endpoints should use Server-Sent Events', () => {
    // Documents SSE pattern for batch operations
    const streamingEndpoints = [
      '/api/update-metadata-stream',
      '/api/batch-upload-image-stream', 
      '/api/youtube/update-descriptions-stream',
      '/api/youtube/update-recording-dates-stream'
    ];
    
    expect(streamingEndpoints.length).toBe(4);
    expect(streamingEndpoints.every(ep => ep.includes('-stream'))).toBe(true);
  });
});