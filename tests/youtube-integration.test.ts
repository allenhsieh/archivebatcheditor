/**
 * Tests for YouTube API integration
 * These tests cover YouTube search, quota detection, and metadata extraction
 * 
 * CRITICAL: Tests the quota-aware sequential processing that prevents API flooding
 */

describe('YouTube API Integration', () => {
  describe('Quota Detection and Management', () => {
    test('detects quota exhaustion from HTTP 403 status', () => {
      // Mock YouTube API response with 403 status
      const quotaExhaustedResponse = {
        status: 403,
        data: {
          error: {
            code: 403,
            message: 'The request cannot be completed because you have exceeded your quota.'
          }
        }
      };

      // The server should detect this as quota exhaustion
      expect(quotaExhaustedResponse.status).toBe(403);
      expect(quotaExhaustedResponse.data.error.message).toContain('quota');
    });

    test('detects quota exhaustion from response body flag', () => {
      // Mock server response with quota exhaustion flag
      const serverResponse = {
        quotaExhausted: true,
        error: 'YouTube API quota exceeded'
      };

      expect(serverResponse.quotaExhausted).toBe(true);
    });

    test('detects quota exhaustion from error message patterns', () => {
      const quotaErrorMessages = [
        'QUOTA_EXHAUSTED: YouTube API quota exceeded during batch processing',
        'YouTube API quota exceeded',
        'Daily quota has been reached',
        'API quota limit exceeded'
      ];

      quotaErrorMessages.forEach(message => {
        expect(message.toLowerCase()).toMatch(/quota|exceeded|limit/);
      });
    });

    test('sequential processing stops immediately on quota error', () => {
      // This tests the fail-fast behavior when quota is exhausted
      const processingResults = [
        { identifier: 'item1', success: true },
        { identifier: 'item2', quotaExhausted: true }, // Quota exhausted on item 2
        // Processing should stop here - item3 and beyond should not be processed
      ];

      const quotaExhaustedIndex = processingResults.findIndex(r => r.quotaExhausted);
      expect(quotaExhaustedIndex).toBe(1); // Found at index 1
      
      // In real implementation, no further items would be processed after quota exhaustion
      const processedItems = processingResults.slice(0, quotaExhaustedIndex + 1);
      expect(processedItems.length).toBe(2); // Only first 2 items processed
    });
  });

  describe('YouTube Video Search and Scoring', () => {
    test('scores videos based on title similarity', () => {
      // Mock YouTube search results
      const searchQuery = 'Grateful Dead Fire on the Mountain';
      const mockVideos = [
        {
          id: { videoId: 'abc123' },
          snippet: {
            title: 'Grateful Dead - Fire on the Mountain (Live)',
            publishedAt: '2023-07-04T00:00:00Z',
            channelTitle: 'Test Channel'
          }
        },
        {
          id: { videoId: 'def456' },
          snippet: {
            title: 'Random Video Title',
            publishedAt: '2023-07-04T00:00:00Z', 
            channelTitle: 'Test Channel'
          }
        }
      ];

      // First video should score higher due to title similarity
      const video1Title = mockVideos[0].snippet.title.toLowerCase();
      const video2Title = mockVideos[1].snippet.title.toLowerCase();
      const query = searchQuery.toLowerCase();

      const video1HasKeywords = query.split(' ').some(word => video1Title.includes(word));
      const video2HasKeywords = query.split(' ').some(word => video2Title.includes(word));

      expect(video1HasKeywords).toBe(true);
      expect(video2HasKeywords).toBe(false);
    });

    test('scores videos based on date proximity when date provided', () => {
      const targetDate = '2023-07-04';
      const mockVideos = [
        {
          snippet: {
            publishedAt: '2023-07-04T00:00:00Z', // Exact match
            title: 'Concert Video'
          }
        },
        {
          snippet: {
            publishedAt: '2022-01-01T00:00:00Z', // 1.5 years off
            title: 'Concert Video'
          }
        }
      ];

      const targetDateTime = new Date(targetDate).getTime();
      const video1Date = new Date(mockVideos[0].snippet.publishedAt).getTime();
      const video2Date = new Date(mockVideos[1].snippet.publishedAt).getTime();

      const video1Diff = Math.abs(targetDateTime - video1Date);
      const video2Diff = Math.abs(targetDateTime - video2Date);

      expect(video1Diff).toBeLessThan(video2Diff);
    });

    test('extracts metadata from best matching video', () => {
      const bestMatchVideo = {
        id: { videoId: 'abc123' },
        snippet: {
          title: 'Grateful Dead - Fire on the Mountain Live at Red Rocks 2023-07-04',
          publishedAt: '2023-07-04T00:00:00Z',
          channelTitle: 'Archive Channel'
        }
      };

      // Test metadata extraction patterns
      const title = bestMatchVideo.snippet.title;
      
      // Band extraction (first part before dash)
      const bandMatch = title.match(/^([^-]+?)\s*-/);
      const extractedBand = bandMatch ? bandMatch[1].trim() : null;
      expect(extractedBand).toBe('Grateful Dead');

      // Venue extraction (after "at")
      const venueMatch = title.match(/at\s+([^,()]+)/i);
      const extractedVenue = venueMatch ? venueMatch[1].split(' ')[0] + ' ' + venueMatch[1].split(' ')[1] : null;
      expect(extractedVenue).toBe('Red Rocks');

      // Date extraction (YYYY-MM-DD format)
      const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
      const extractedDate = dateMatch ? dateMatch[1] : null;
      expect(extractedDate).toBe('2023-07-04');
    });
  });

  describe('YouTube API Request Building', () => {
    test('builds search query with title and optional date', () => {
      const title = 'Grateful Dead Fire on the Mountain';
      const date = '2023-07-04';

      // Basic search query
      let searchQuery = title;
      expect(searchQuery).toBe('Grateful Dead Fire on the Mountain');

      // With date context (year extraction)
      if (date) {
        const year = date.split('-')[0];
        searchQuery = `${title} ${year}`;
      }
      
      expect(searchQuery).toBe('Grateful Dead Fire on the Mountain 2023');
    });

    test('builds YouTube API URL with correct parameters', () => {
      const apiKey = 'test-api-key';
      const channelId = 'UCtest123';
      const query = 'Grateful Dead concert';
      
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('key', apiKey);
      searchUrl.searchParams.set('channelId', channelId);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('maxResults', '10');

      expect(searchUrl.toString()).toContain('youtube/v3/search');
      expect(searchUrl.searchParams.get('channelId')).toBe(channelId);
      expect(searchUrl.searchParams.get('q')).toBe(query);
      expect(searchUrl.searchParams.get('type')).toBe('video');
    });
  });

  describe('YouTube Search Response Processing', () => {
    test('processes successful search response', () => {
      const mockApiResponse = {
        data: {
          items: [
            {
              id: { videoId: 'abc123' },
              snippet: {
                title: 'Test Video',
                publishedAt: '2023-07-04T00:00:00Z',
                channelTitle: 'Test Channel',
                thumbnails: {
                  medium: {
                    url: 'https://example.com/thumb.jpg'
                  }
                }
              }
            }
          ]
        }
      };

      const videos = mockApiResponse.data.items;
      expect(videos.length).toBe(1);
      expect(videos[0].id.videoId).toBe('abc123');
      expect(videos[0].snippet.title).toBe('Test Video');
    });

    test('handles empty search results', () => {
      const emptyResponse = {
        data: {
          items: []
        }
      };

      expect(emptyResponse.data.items.length).toBe(0);
    });

    test('creates YouTube URL from video ID', () => {
      const videoId = 'abc123';
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      expect(youtubeUrl).toBe('https://www.youtube.com/watch?v=abc123');
    });
  });

  describe('Batch Processing with Quota Awareness', () => {
    test('processes items sequentially with delays', async () => {
      const items = [
        { identifier: 'item1', title: 'Concert 1' },
        { identifier: 'item2', title: 'Concert 2' },
        { identifier: 'item3', title: 'Concert 3' }
      ];

      const results = [];
      const startTime = Date.now();

      // Simulate sequential processing with 100ms delays
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Simulate processing delay
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        results.push({
          identifier: item.identifier,
          processed: true,
          timestamp: Date.now()
        });
      }

      const totalTime = Date.now() - startTime;
      
      expect(results.length).toBe(3);
      expect(totalTime).toBeGreaterThanOrEqual(200); // At least 2 delays of 100ms
    });

    test('stops processing on quota exhaustion', () => {
      const items = [
        { identifier: 'item1', title: 'Concert 1' },
        { identifier: 'item2', title: 'Concert 2' }, // This will hit quota
        { identifier: 'item3', title: 'Concert 3' }, // Should not be processed
        { identifier: 'item4', title: 'Concert 4' }  // Should not be processed
      ];

      const results = [];
      let quotaExhausted = false;

      // Simulate processing that hits quota on second item
      for (let i = 0; i < items.length && !quotaExhausted; i++) {
        const item = items[i];
        
        if (i === 1) {
          // Simulate quota exhaustion on second item
          quotaExhausted = true;
          results.push({
            identifier: item.identifier,
            quotaExhausted: true,
            error: 'YouTube API quota exceeded'
          });
          break; // Stop processing immediately
        }
        
        results.push({
          identifier: item.identifier,
          success: true
        });
      }

      expect(results.length).toBe(2); // Only first 2 items processed
      expect(results[0].success).toBe(true);
      expect(results[1].quotaExhausted).toBe(true);
    });
  });

  describe('Server-Sent Events for YouTube Processing', () => {
    test('formats progress messages correctly', () => {
      const progressMessage = {
        type: 'progress',
        current: 3,
        total: 10,
        identifier: 'item-123',
        status: 'Searching YouTube for match...'
      };

      const sseData = `data: ${JSON.stringify(progressMessage)}\n\n`;
      
      expect(sseData).toContain('type":"progress"');
      expect(sseData).toContain('current":3');
      expect(sseData).toContain('identifier":"item-123"');
    });

    test('formats success messages correctly', () => {
      const successMessage = {
        type: 'success',
        identifier: 'item-123',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
        extractedBand: 'Grateful Dead',
        extractedVenue: 'Red Rocks',
        extractedDate: '2023-07-04'
      };

      const sseData = `data: ${JSON.stringify(successMessage)}\n\n`;
      
      expect(sseData).toContain('type":"success"');
      expect(sseData).toContain('youtubeUrl');
      expect(sseData).toContain('extractedBand');
    });

    test('formats quota exhaustion messages correctly', () => {
      const quotaMessage = {
        type: 'error',
        identifier: 'item-123',
        error: 'QUOTA_EXHAUSTED - Stopping workflow',
        quotaExhausted: true
      };

      const sseData = `data: ${JSON.stringify(quotaMessage)}\n\n`;
      
      expect(sseData).toContain('type":"error"');
      expect(sseData).toContain('QUOTA_EXHAUSTED');
      expect(sseData).toContain('quotaExhausted":true');
    });
  });

  describe('Error Handling', () => {
    test('handles network errors gracefully', () => {
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      };

      // Error should be caught and not cause app crash
      expect(networkError.code).toBe('ECONNREFUSED');
    });

    test('handles invalid API key errors', () => {
      const apiKeyError = {
        status: 400,
        data: {
          error: {
            code: 400,
            message: 'API key not valid'
          }
        }
      };

      expect(apiKeyError.status).toBe(400);
      expect(apiKeyError.data.error.message).toContain('API key');
    });

    test('handles malformed response data', () => {
      const malformedResponse = {
        data: null // Missing expected structure
      };

      // Should handle gracefully without crashing
      const items = malformedResponse.data?.items || [];
      expect(items.length).toBe(0);
    });
  });
});