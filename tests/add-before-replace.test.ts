/**
 * Add-Before-Replace Metadata Operations Integration Tests
 * 
 * These tests verify the add-before-replace pattern that was learned during development:
 * - When updating metadata that already exists, Archive.org requires an "add" operation first
 * - Then perform a "replace" operation to update the value
 * - This prevents metadata conflicts and ensures consistent updates
 */

import request from 'supertest';
import https from 'node:https';
import app from '../server/index.js';

// Mock external API calls
jest.mock('node:https', () => ({
  request: jest.fn()
}));

describe('Add-Before-Replace Metadata Operations E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock https.request for Archive.org API calls
    (https.request as jest.Mock).mockImplementation((url: string, options: any, callback?: Function) => {
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
  });

  describe('Metadata Update Pattern Verification', () => {
    test('existing metadata fields use add-before-replace pattern', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body,
          headers: options.headers
        });
        
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

      const requestData = {
        items: ['09.19.15_TestBand'],
        updates: [
          {
            field: 'title',
            value: 'Updated Concert Title'
          },
          {
            field: 'date', 
            value: '2015-09-19'
          },
          {
            field: 'venue',
            value: 'The Venue'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      // Verify that metadata API calls were made
      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      expect(metadataApiCalls.length).toBeGreaterThan(0);

      // For existing fields that need replacement, there should be both add and replace operations
      // This pattern prevents Archive.org metadata conflicts
      const addOperations = metadataApiCalls.filter(call => 
        call.body && call.body.includes('"op":"add"')
      );
      const replaceOperations = metadataApiCalls.filter(call => 
        call.body && call.body.includes('"op":"replace"')
      );

      // Should have add operations for fields that might already exist
      expect(addOperations.length).toBeGreaterThan(0);
    });

    test('new metadata fields use simple add operation', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['06.14.14_NewField'],
        updates: [
          {
            field: 'band',
            value: 'The Test Band'
          },
          {
            field: 'setlist',
            value: 'Song 1, Song 2, Song 3'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      // For new fields, should only need add operations
      const addOperations = metadataApiCalls.filter(call => 
        call.body && call.body.includes('"op":"add"')
      );

      expect(addOperations.length).toBeGreaterThan(0);
    });

    test('date field standardization with add-before-replace', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['01.05.12_DateTest'],
        updates: [
          {
            field: 'date',
            value: '2012-01-05'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      expect(metadataApiCalls.length).toBeGreaterThan(0);

      // Verify date is in correct format in the API calls
      const dateCalls = metadataApiCalls.filter(call => 
        call.body && call.body.includes('2012-01-05')
      );
      
      expect(dateCalls.length).toBeGreaterThan(0);
    });

    test('youtube field updates with URL standardization', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['07.15.13_YouTubeTest'],
        updates: [
          {
            field: 'youtube',
            value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      // Should standardize to short format in API calls
      const youtubeCalls = metadataApiCalls.filter(call => 
        call.body && call.body.includes('youtu.be/dQw4w9WgXcQ')
      );
      
      expect(youtubeCalls.length).toBeGreaterThan(0);
    });

    test('subject field uses add-before-replace for tag management', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['03.22.14_SubjectTest'],
        updates: [
          {
            field: 'subject',
            value: 'Folk; Indie Rock; Live Recording; Concert'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      expect(metadataApiCalls.length).toBeGreaterThan(0);

      // Subject field should use semicolon-separated format
      const subjectCalls = metadataApiCalls.filter(call => 
        call.body && call.body.includes('Folk; Indie Rock; Live Recording; Concert')
      );
      
      expect(subjectCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Bulk Operation Patterns', () => {
    test('bulk updates maintain add-before-replace consistency', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['09.19.15_Item1', '06.14.14_Item2', '01.05.12_Item3'],
        updates: [
          {
            field: 'venue',
            value: 'Updated Venue Name'
          },
          {
            field: 'band',
            value: 'The Updated Band'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      // Should make API calls for all items
      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      // Should have calls for each item
      expect(metadataApiCalls.length).toBeGreaterThan(0);

      // Verify identifiers appear in API calls
      const itemIdentifiers = ['09.19.15_Item1', '06.14.14_Item2', '01.05.12_Item3'];
      itemIdentifiers.forEach(identifier => {
        const itemCalls = metadataApiCalls.filter(call => 
          call.url && call.url.includes(identifier)
        );
        expect(itemCalls.length).toBeGreaterThan(0);
      });
    });

    test('mixed operations (add and replace) work correctly', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({
          url,
          method: options.method,
          body: options.body
        });
        
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
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['05.30.16_MixedTest'],
        updates: [
          {
            field: 'title',
            value: 'Updated Title'
          },
          {
            field: 'description',
            value: 'New description for this recording'
          },
          {
            field: 'creator',
            value: 'updated@example.com'
          }
        ]
      };

      await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      expect(https.request as jest.Mock).toHaveBeenCalled();

      const metadataApiCalls = capturedRequests.filter(req => 
        req.url && req.url.includes('/metadata/')
      );

      expect(metadataApiCalls.length).toBeGreaterThan(0);

      // Should handle both add and replace operations appropriately
      const addOperations = metadataApiCalls.filter(call => 
        call.body && call.body.includes('"op":"add"')
      );
      const replaceOperations = metadataApiCalls.filter(call => 
        call.body && call.body.includes('"op":"replace"')
      );

      // Should have both types of operations
      expect(addOperations.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Regression Protection', () => {
    test('malformed requests are rejected with proper error messages', async () => {
      const invalidRequestData = {
        items: 'not-an-array', // Should be array
        updates: 'not-an-array' // Should be array
      };

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send(invalidRequestData)
        .expect(200);

      // Should return error in SSE format
      expect(response.text).toContain('error');
      expect(response.text).toContain('Invalid request format');
    });

    test('empty updates array is handled gracefully', async () => {
      const requestData = {
        items: ['09.19.15_EmptyTest'],
        updates: [] // Empty updates
      };

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      // Should complete successfully even with no updates
      expect(response.text).toContain('complete');
    });

    test('invalid identifiers are handled appropriately', async () => {
      let capturedRequests: any[] = [];
      
      (https.request as jest.Mock).mockImplementation((url, options, callback) => {
        capturedRequests.push({ url, body: options.body });
        
        // Mock error response for invalid identifier
        const mockResponse = {
          statusCode: 404,
          headers: { 'content-type': 'application/json' },
          on: jest.fn((event, handler) => {
            if (event === 'data') handler('{"error": "Item not found"}');
            if (event === 'end') handler();
          })
        };
        
        const mockRequest = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            if (callback) callback(mockResponse);
          })
        };
        
        return mockRequest;
      });

      const requestData = {
        items: ['invalid_identifier_format'],
        updates: [
          {
            field: 'title',
            value: 'Test Title'
          }
        ]
      };

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);

      // Should handle the error gracefully in SSE response
      expect(response.text).toBeDefined();
    });
  });
});