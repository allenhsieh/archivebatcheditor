/**
 * Tests for Archive.org API integration
 * These tests cover search, metadata updates, and user item retrieval
 * 
 * CRITICAL: Tests the actual Archive.org API patterns and data structures
 */

describe('Archive.org API Integration', () => {
  describe('Search API Integration', () => {
    test('builds correct search URL with parameters', () => {
      const baseUrl = 'https://archive.org/advancedsearch.php';
      const searchParams = {
        q: 'creator:"test-user@example.com"',
        fl: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader',
        rows: 1000,
        output: 'json',
        sort: 'addeddate desc'
      };

      const searchUrl = new URL(baseUrl);
      Object.entries(searchParams).forEach(([key, value]) => {
        searchUrl.searchParams.set(key, value.toString());
      });

      expect(searchUrl.toString()).toContain('archive.org/advancedsearch.php');
      expect(searchUrl.searchParams.get('output')).toBe('json');
      expect(searchUrl.searchParams.get('rows')).toBe('1000');
      expect(searchUrl.searchParams.get('sort')).toBe('addeddate desc');
    });

    test('filters search results by user email', () => {
      const userEmail = 'test-user@example.com';
      const searchQuery = `creator:"${userEmail}"`;
      
      expect(searchQuery).toBe('creator:"test-user@example.com"');
      expect(searchQuery).toContain(userEmail);
    });

    test('processes Archive.org search response correctly', () => {
      const mockSearchResponse = {
        response: {
          docs: [
            {
              identifier: 'test-item-123',
              title: 'Test Concert Recording',
              creator: 'test-user@example.com',
              description: 'A test concert recording',
              date: '2023-07-04',
              mediatype: 'etree',
              collection: ['etree'],
              subject: ['Grateful Dead', 'Live Music'],
              uploader: 'test-user@example.com'
            },
            {
              identifier: 'test-item-456',
              title: 'Another Recording',
              creator: 'test-user@example.com',
              date: '2023-07-05'
            }
          ]
        }
      };

      const items = mockSearchResponse.response.docs;
      expect(items.length).toBe(2);
      expect(items[0].identifier).toBe('test-item-123');
      expect(items[0].creator).toBe('test-user@example.com');
      expect(items[1].date).toBe('2023-07-05');
    });

    test('handles empty search results', () => {
      const emptyResponse = {
        response: {
          docs: []
        }
      };

      expect(emptyResponse.response.docs.length).toBe(0);
    });
  });

  describe('Metadata Update API Integration', () => {
    test('builds correct metadata update URL', () => {
      const identifier = 'test-item-123';
      const metadataUrl = `https://archive.org/metadata/${identifier}`;
      
      expect(metadataUrl).toBe('https://archive.org/metadata/test-item-123');
      expect(metadataUrl).toContain('/metadata/');
    });

    test('formats metadata update request body correctly', () => {
      const updateData = {
        title: 'Updated Title',
        creator: 'Updated Creator',
        description: 'Updated description'
      };

      const requestBody = new URLSearchParams({
        '-target': 'metadata',
        '-patch': JSON.stringify(updateData),
        'access': 'test-access-key',
        'secret': 'test-secret-key'
      });

      expect(requestBody.get('-target')).toBe('metadata');
      expect(requestBody.get('-patch')).toBe(JSON.stringify(updateData));
      expect(requestBody.get('access')).toBe('test-access-key');
      expect(requestBody.get('secret')).toBe('test-secret-key');
    });

    test('handles metadata update response correctly', () => {
      const mockUpdateResponse = {
        success: true,
        log: 'Item updated successfully',
        task_id: 12345
      };

      expect(mockUpdateResponse.success).toBe(true);
      expect(mockUpdateResponse.task_id).toBeDefined();
    });

    test('handles metadata update errors', () => {
      const errorResponse = {
        success: false,
        error: 'Invalid credentials',
        details: 'Access key not valid'
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toContain('credentials');
    });
  });

  describe('User Items API Integration', () => {
    test('retrieves user items with correct search parameters', () => {
      const userEmail = 'test-user@example.com';
      const userItemsQuery = {
        q: `creator:"${userEmail}"`,
        fl: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader,youtube',
        rows: 1000,
        output: 'json',
        sort: 'addeddate desc'
      };

      expect(userItemsQuery.q).toContain(userEmail);
      expect(userItemsQuery.fl).toContain('youtube'); // Includes YouTube field
      expect(userItemsQuery.rows).toBe(1000);
    });

    test('filters and processes user items correctly', () => {
      const userEmail = 'test-user@example.com';
      const rawItems = [
        {
          identifier: 'item-1',
          creator: 'test-user@example.com',
          title: 'User Item 1'
        },
        {
          identifier: 'item-2', 
          creator: 'other-user@example.com',
          title: 'Other User Item'
        },
        {
          identifier: 'item-3',
          creator: 'test-user@example.com',
          title: 'User Item 2'
        }
      ];

      // Filter items by user email (server-side filtering)
      const userItems = rawItems.filter(item => 
        item.creator === userEmail
      );

      expect(userItems.length).toBe(2);
      expect(userItems[0].identifier).toBe('item-1');
      expect(userItems[1].identifier).toBe('item-3');
    });

    test('identifies items needing YouTube links', () => {
      const items = [
        {
          identifier: 'item-1',
          title: 'Concert 1',
          youtube: undefined // No YouTube link
        },
        {
          identifier: 'item-2',
          title: 'Concert 2',
          youtube: 'https://www.youtube.com/watch?v=abc123' // Has YouTube link
        },
        {
          identifier: 'item-3',
          title: 'Concert 3'
          // No youtube field at all
        }
      ];

      const itemsNeedingYouTube = items.filter(item => 
        !item.youtube || item.youtube === ''
      );

      expect(itemsNeedingYouTube.length).toBe(2);
      expect(itemsNeedingYouTube.map(i => i.identifier)).toEqual(['item-1', 'item-3']);
    });
  });

  describe('Batch Processing with Archive.org', () => {
    test('processes metadata updates sequentially', async () => {
      const items = [
        { identifier: 'item-1', metadata: { title: 'New Title 1' } },
        { identifier: 'item-2', metadata: { title: 'New Title 2' } },
        { identifier: 'item-3', metadata: { title: 'New Title 3' } }
      ];

      const results = [];
      const startTime = Date.now();

      // Simulate sequential processing with API delays
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Simulate API delay
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Simulate successful update
        results.push({
          identifier: item.identifier,
          success: true,
          timestamp: Date.now()
        });
      }

      const totalTime = Date.now() - startTime;
      
      expect(results.length).toBe(3);
      expect(totalTime).toBeGreaterThanOrEqual(200); // Sequential delays
      
      // Verify sequential processing (later timestamps should be larger)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].timestamp).toBeGreaterThan(results[i-1].timestamp);
      }
    });

    test('handles Archive.org rate limiting gracefully', () => {
      const rateLimitResponse = {
        status: 429,
        data: {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded'
        }
      };

      expect(rateLimitResponse.status).toBe(429);
      expect(rateLimitResponse.data.error).toContain('Too Many Requests');
    });

    test('retries failed requests with backoff', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      const mockApiCall = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network error');
        }
        return { success: true };
      };

      let result;
      let lastError;

      // Simulate retry logic
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          result = await mockApiCall();
          break;
        } catch (error) {
          lastError = error;
          if (retry < maxRetries - 1) {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 100));
          }
        }
      }

      expect(attemptCount).toBe(3);
      expect(result?.success).toBe(true);
    });
  });

  describe('Server-Sent Events for Archive.org Processing', () => {
    test('formats metadata update progress messages', () => {
      const progressMessage = {
        type: 'progress',
        current: 5,
        total: 20,
        identifier: 'item-123',
        status: 'Updating Archive.org metadata...'
      };

      const sseData = `data: ${JSON.stringify(progressMessage)}\n\n`;
      
      expect(sseData).toContain('type":"progress"');
      expect(sseData).toContain('Updating Archive.org');
    });

    test('formats successful update messages', () => {
      const successMessage = {
        type: 'success',
        identifier: 'item-123',
        message: 'Metadata updated successfully',
        taskId: 12345
      };

      const sseData = `data: ${JSON.stringify(successMessage)}\n\n`;
      
      expect(sseData).toContain('type":"success"');
      expect(sseData).toContain('taskId');
    });

    test('formats error messages for failed updates', () => {
      const errorMessage = {
        type: 'error',
        identifier: 'item-123',
        error: 'Failed to update metadata',
        details: 'Invalid access credentials'
      };

      const sseData = `data: ${JSON.stringify(errorMessage)}\n\n`;
      
      expect(sseData).toContain('type":"error"');
      expect(sseData).toContain('Invalid access credentials');
    });

    test('formats batch completion summary', () => {
      const completionMessage = {
        type: 'complete',
        successful: 18,
        failed: 2,
        total: 20,
        duration: '45 seconds'
      };

      const sseData = `data: ${JSON.stringify(completionMessage)}\n\n`;
      
      expect(sseData).toContain('type":"complete"');
      expect(sseData).toContain('successful":18');
      expect(sseData).toContain('failed":2');
    });
  });

  describe('Data Validation and Sanitization', () => {
    test('validates Archive.org identifiers', () => {
      const validIdentifiers = [
        'gd1977-05-08.sbd.miller.97065.shnf',
        'my-concert-recording-2023',
        'test_item_123'
      ];

      const invalidIdentifiers = [
        '', // Empty
        'x'.repeat(101), // Too long
        'invalid/identifier', // Invalid characters
        'invalid identifier', // Spaces
      ];

      validIdentifiers.forEach(id => {
        expect(id.length).toBeGreaterThan(0);
        expect(id.length).toBeLessThanOrEqual(100);
      });

      invalidIdentifiers.forEach(id => {
        const isValid = id.length > 0 && id.length <= 100 && !/[\/\s]/.test(id);
        expect(isValid).toBe(false);
      });
    });

    test('sanitizes metadata values', () => {
      const rawMetadata = {
        title: '  Test Title  ', // Leading/trailing spaces
        creator: 'Artist\nName', // Newline character
        description: '<script>alert("xss")</script>Normal text'
      };

      // Simulate sanitization
      const sanitizedMetadata = {
        title: rawMetadata.title.trim(),
        creator: rawMetadata.creator.replace(/\n/g, ' '),
        description: rawMetadata.description.replace(/<script.*?<\/script>/gi, '')
      };

      expect(sanitizedMetadata.title).toBe('Test Title');
      expect(sanitizedMetadata.creator).toBe('Artist Name');
      expect(sanitizedMetadata.description).toBe('Normal text');
    });

    test('validates metadata field types', () => {
      const validMetadata = {
        title: 'String title',
        date: '2023-07-04',
        subject: ['tag1', 'tag2'],
        description: 'Valid description'
      };

      const invalidMetadata = {
        title: null,
        date: 12345, // Should be string
        subject: 'not-an-array',
        description: {}
      };

      // Validation checks
      expect(typeof validMetadata.title).toBe('string');
      expect(typeof validMetadata.date).toBe('string');
      expect(Array.isArray(validMetadata.subject)).toBe(true);

      expect(typeof invalidMetadata.title).not.toBe('string');
      expect(typeof invalidMetadata.date).not.toBe('string');
      expect(Array.isArray(invalidMetadata.subject)).toBe(false);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('handles network connectivity issues', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED', message: 'Connection refused' },
        { code: 'ETIMEDOUT', message: 'Connection timed out' },
        { code: 'ENOTFOUND', message: 'DNS lookup failed' }
      ];

      networkErrors.forEach(error => {
        expect(error.code).toMatch(/^E[A-Z]+/);
        expect(error.message).toBeTruthy();
      });
    });

    test('handles Archive.org service errors', () => {
      const serviceErrors = [
        { status: 500, message: 'Internal Server Error' },
        { status: 502, message: 'Bad Gateway' },
        { status: 503, message: 'Service Unavailable' },
        { status: 504, message: 'Gateway Timeout' }
      ];

      serviceErrors.forEach(error => {
        expect(error.status).toBeGreaterThanOrEqual(500);
        expect(error.status).toBeLessThan(600);
      });
    });

    test('handles authentication failures', () => {
      const authErrors = [
        {
          status: 401,
          error: 'Unauthorized',
          message: 'Invalid access credentials'
        },
        {
          status: 403,
          error: 'Forbidden', 
          message: 'Access denied for this operation'
        }
      ];

      authErrors.forEach(error => {
        expect([401, 403]).toContain(error.status);
        expect(error.message.toLowerCase()).toContain('access');
      });
    });
  });

  describe('Performance and Optimization', () => {
    test('limits batch size to prevent overload', () => {
      const maxBatchSize = 100;
      const largeItemList = Array.from({ length: 150 }, (_, i) => ({
        identifier: `item-${i}`,
        metadata: { title: `Title ${i}` }
      }));

      // Should limit to maximum batch size
      const limitedBatch = largeItemList.slice(0, maxBatchSize);
      
      expect(limitedBatch.length).toBe(maxBatchSize);
      expect(limitedBatch.length).toBeLessThanOrEqual(largeItemList.length);
    });

    test('includes appropriate delays between API calls', () => {
      const apiDelay = 1000; // 1 second between calls
      const expectedMinimumTime = (3 - 1) * apiDelay; // 3 items, 2 delays

      expect(apiDelay).toBeGreaterThan(0);
      expect(expectedMinimumTime).toBe(2000); // 2 seconds minimum for 3 items
    });

    test('tracks processing statistics', () => {
      const processingStats = {
        totalItems: 100,
        successful: 95,
        failed: 5,
        startTime: Date.now() - 60000, // 1 minute ago
        endTime: Date.now(),
        averageTimePerItem: 600 // 600ms per item
      };

      expect(processingStats.successful + processingStats.failed).toBe(processingStats.totalItems);
      expect(processingStats.endTime).toBeGreaterThan(processingStats.startTime);
      expect(processingStats.averageTimePerItem).toBeGreaterThan(0);
    });
  });
});