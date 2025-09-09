/**
 * Tests for utility functions from server/utils.ts
 * These tests verify the actual functions used in the application
 * 
 * CRITICAL: Tests the real implementation, not duplicated code
 */

import { 
  standardizeDate, 
  extractBandFromTitle, 
  extractVenueFromTitle, 
  extractDateFromTitle,
  isRateLimitError,
  isYouTubeQuotaError,
  buildArchiveSearchUrl,
  buildArchiveMetadataUrl,
  buildYouTubeSearchUrl,
  createYouTubeUrl,
  standardizeYouTubeUrl,
  generateFlyerFilename,
  CONSTANTS
} from '../server/utils'

describe('Date Standardization', () => {
  describe('standardizeDate', () => {
    test('handles MM/DD/YY format correctly', () => {
      expect(standardizeDate('12/25/23')).toBe('2023-12-25')
      expect(standardizeDate('1/5/23')).toBe('2023-01-05')
      expect(standardizeDate('3/15/99')).toBe('2099-03-15') // Note: this function assumes 21st century
    })

    test('handles MM/DD/YYYY format correctly', () => {
      expect(standardizeDate('12/25/2023')).toBe('2023-12-25')
      expect(standardizeDate('1/5/2022')).toBe('2022-01-05')
      expect(standardizeDate('03/15/2024')).toBe('2024-03-15')
    })

    test('handles DD.MM.YY European format correctly', () => {
      expect(standardizeDate('25.12.23')).toBe('2023-12-25')
      expect(standardizeDate('5.1.23')).toBe('2023-01-05')
      expect(standardizeDate('15.03.99')).toBe('2099-03-15')
    })

    test('handles DD.MM.YYYY European format correctly', () => {
      expect(standardizeDate('25.12.2023')).toBe('2023-12-25')
      expect(standardizeDate('5.1.2022')).toBe('2022-01-05')
      expect(standardizeDate('15.03.2024')).toBe('2024-03-15')
    })

    test('handles YYYY-MM-DD format (already correct)', () => {
      expect(standardizeDate('2023-12-25')).toBe('2023-12-25')
      expect(standardizeDate('2022-01-05')).toBe('2022-01-05')
    })

    test('handles ISO date format correctly', () => {
      expect(standardizeDate('2016-02-28T00:00:00Z')).toBe('2016-02-28')
      expect(standardizeDate('2023-12-25T15:30:45.123Z')).toBe('2023-12-25')
      expect(standardizeDate('2022-01-05T08:00:00')).toBe('2022-01-05')
    })

    test('handles year-only format', () => {
      expect(standardizeDate('2023')).toBe('2023-01-01')
      expect(standardizeDate('1999')).toBe('1999-01-01')
    })

    test('handles empty or invalid dates', () => {
      expect(standardizeDate('')).toBe('')
      expect(standardizeDate('invalid-date')).toBe('invalid-date')
    })
  })
})

describe('Band Name Extraction', () => {
  describe('extractBandFromTitle', () => {
    test('extracts band name from dash format', () => {
      expect(extractBandFromTitle('Grateful Dead - Fire on the Mountain')).toBe('Grateful Dead')
      expect(extractBandFromTitle('The Beatles - Hey Jude')).toBe('The Beatles')
      expect(extractBandFromTitle('Phish - You Enjoy Myself')).toBe('Phish')
    })

    test('extracts band name from colon format', () => {
      expect(extractBandFromTitle('Led Zeppelin: Stairway to Heaven')).toBe('Led Zeppelin')
      expect(extractBandFromTitle('Pink Floyd: Comfortably Numb')).toBe('Pink Floyd')
    })

    test('extracts band name from parentheses format', () => {
      expect(extractBandFromTitle('Dead & Company (Live at MSG)')).toBe('Dead & Company')
      expect(extractBandFromTitle('Radiohead (2023 Tour)')).toBe('Radiohead')
    })

    test('filters out common non-band patterns', () => {
      expect(extractBandFromTitle('Live - Performance')).toBeNull() // "Live" is filtered out
      expect(extractBandFromTitle('AB')).toBeNull() // Too short
    })

    test('handles empty or null input', () => {
      expect(extractBandFromTitle('')).toBeNull()
      expect(extractBandFromTitle(null as any)).toBeNull()
    })

    test('handles titles without patterns', () => {
      expect(extractBandFromTitle('Just a regular title')).toBeNull()
      expect(extractBandFromTitle('No patterns here')).toBeNull()
    })
  })
})

describe('Venue Extraction', () => {
  describe('extractVenueFromTitle', () => {
    test('extracts venue from "at" pattern', () => {
      expect(extractVenueFromTitle('Grateful Dead at The Fillmore')).toBe('The Fillmore')
      expect(extractVenueFromTitle('Concert at Madison Square Garden')).toBe('Madison Square Garden')
    })

    test('extracts venue from "live at" pattern', () => {
      expect(extractVenueFromTitle('Live at Red Rocks')).toBe('Red Rocks')
      expect(extractVenueFromTitle('Phish Live at Berkeley')).toBe('Berkeley')
    })

    test('extracts venue from @ symbol pattern', () => {
      expect(extractVenueFromTitle('Dead & Company @ The Greek Theatre')).toBe('The Greek Theatre')
      expect(extractVenueFromTitle('Show @ Shoreline Amphitheatre')).toBe('Shoreline Amphitheatre')
    })

    test('handles venues with commas or parentheses', () => {
      expect(extractVenueFromTitle('Concert at The Fillmore, SF')).toBe('The Fillmore') // Stops at comma
      expect(extractVenueFromTitle('Live at Red Rocks (CO)')).toBe('Red Rocks') // Stops at parentheses
    })

    test('filters out very short venue names', () => {
      expect(extractVenueFromTitle('Show at XY')).toBeNull() // Too short
    })

    test('handles empty or null input', () => {
      expect(extractVenueFromTitle('')).toBeNull()
      expect(extractVenueFromTitle(null as any)).toBeNull()
    })

    test('handles titles without venue patterns', () => {
      expect(extractVenueFromTitle('Just a regular title')).toBeNull()
      expect(extractVenueFromTitle('Band Name - Song Title')).toBeNull()
    })
  })
})

describe('Date Extraction from Title', () => {
  describe('extractDateFromTitle', () => {
    test('extracts YYYY-MM-DD dates from titles', () => {
      expect(extractDateFromTitle('Grateful Dead 2023-12-25 Christmas Show')).toBe('2023-12-25')
      expect(extractDateFromTitle('Concert 1999-05-15 Spring Tour')).toBe('1999-05-15')
    })

    test('extracts MM/DD/YY dates and standardizes them', () => {
      expect(extractDateFromTitle('Show 12/25/23 Holiday Concert')).toBe('2023-12-25')
      expect(extractDateFromTitle('Tour 5/15/23 Spring Shows')).toBe('2023-05-15')
    })

    test('extracts MM/DD/YYYY dates and standardizes them', () => {
      expect(extractDateFromTitle('Concert 12/25/2023 Christmas')).toBe('2023-12-25')
      expect(extractDateFromTitle('Show 5/15/2022 Spring')).toBe('2022-05-15')
    })

    test('extracts year-only dates', () => {
      expect(extractDateFromTitle('Concert 2023 Holiday')).toBe('2023-01-01')
    })

    test('handles empty or null input', () => {
      expect(extractDateFromTitle('')).toBeNull()
      expect(extractDateFromTitle(null as any)).toBeNull()
    })

    test('handles titles without date patterns', () => {
      expect(extractDateFromTitle('Just a regular title')).toBeNull()
      expect(extractDateFromTitle('Band Name - Song Title')).toBeNull()
    })

    test('extracts first date found when multiple dates present', () => {
      expect(extractDateFromTitle('Tour 2023-12-25 and 2023-12-26')).toBe('2023-12-25')
    })
  })
})

describe('Error Detection Functions', () => {
  describe('isRateLimitError', () => {
    test('detects rate limit from HTTP status', () => {
      expect(isRateLimitError({ status: 429 })).toBe(true)
      expect(isRateLimitError({ response: { status: 429 } })).toBe(true)
    })

    test('detects rate limit from error messages', () => {
      expect(isRateLimitError({ message: 'Rate limit exceeded' })).toBe(true)
      expect(isRateLimitError({ message: 'Too many requests' })).toBe(true)
      expect(isRateLimitError({ message: 'Quota exceeded' })).toBe(true)
    })

    test('handles non-rate-limit errors', () => {
      expect(isRateLimitError({ status: 404 })).toBe(false)
      expect(isRateLimitError({ message: 'Not found' })).toBe(false)
      expect(isRateLimitError({})).toBe(false)
    })
  })

  describe('isYouTubeQuotaError', () => {
    test('detects quota error from HTTP 403 status', () => {
      expect(isYouTubeQuotaError({ status: 403 })).toBe(true)
    })

    test('detects quota error from message patterns', () => {
      expect(isYouTubeQuotaError({ message: 'quota exceeded' })).toBe(true)
      expect(isYouTubeQuotaError({ message: 'QUOTA_EXHAUSTED' })).toBe(true)
      expect(isYouTubeQuotaError({ message: 'exceeded your quota' })).toBe(true)
    })

    test('detects quota error from response flag', () => {
      expect(isYouTubeQuotaError({ quotaExhausted: true })).toBe(true)
    })

    test('handles non-quota errors', () => {
      expect(isYouTubeQuotaError({ status: 404 })).toBe(false)
      expect(isYouTubeQuotaError({ message: 'Not found' })).toBe(false)
      expect(isYouTubeQuotaError({})).toBe(false)
    })
  })
})

describe('URL Building Functions', () => {
  describe('buildArchiveSearchUrl', () => {
    test('builds correct Archive.org search URL', () => {
      const url = buildArchiveSearchUrl('test query', ['identifier', 'title'], 50)
      
      expect(url).toContain('archive.org/advancedsearch.php')
      expect(url).toContain('q=test+query')
      expect(url).toContain('fl=identifier%2Ctitle')
      expect(url).toContain('rows=50')
      expect(url).toContain('output=json')
      expect(url).toContain('sort=addeddate+desc')
    })
  })

  describe('buildArchiveMetadataUrl', () => {
    test('builds correct metadata URL', () => {
      const url = buildArchiveMetadataUrl('test-item-123')
      expect(url).toBe('https://archive.org/metadata/test-item-123')
    })
  })

  describe('buildYouTubeSearchUrl', () => {
    test('builds correct YouTube search URL', () => {
      const url = buildYouTubeSearchUrl('api-key', 'channel-id', 'search query')
      
      expect(url).toContain('youtube/v3/search')
      expect(url).toContain('key=api-key')
      expect(url).toContain('channelId=channel-id')
      expect(url).toContain('q=search+query')
      expect(url).toContain('part=snippet')
      expect(url).toContain('type=video')
      expect(url).toContain('maxResults=10')
    })
  })

  describe('createYouTubeUrl', () => {
    test('creates correct YouTube video URL (short format)', () => {
      expect(createYouTubeUrl('abc123')).toBe('https://youtu.be/abc123')
    })
  })

  describe('generateFlyerFilename', () => {
    test('generates filename from explicit date', () => {
      const filename = generateFlyerFilename(
        'test-item-123',
        'Concert Title',
        '2023-07-04',
        'random_filename.jpg'
      )
      expect(filename).toBe('2023-07-04-flyer_itemimage.jpg')
    })

    test('generates filename from title date extraction', () => {
      const filename = generateFlyerFilename(
        'test-item-123', 
        'Concert 2023-12-25 Holiday Show',
        undefined,
        'myfile.png'
      )
      expect(filename).toBe('2023-12-25-flyer_itemimage.png')
    })

    test('generates filename from identifier date extraction', () => {
      const filename = generateFlyerFilename(
        'gd1977-05-08.sbd.miller',
        'Some Title',
        undefined,
        'photo.jpeg'
      )
      expect(filename).toBe('1977-05-08-flyer_itemimage.jpeg')
    })

    test('generates filename from identifier year extraction', () => {
      const filename = generateFlyerFilename(
        'deadshow1995-something',
        'No Date In Title',
        undefined,
        'image.gif'
      )
      expect(filename).toBe('1995-01-01-flyer_itemimage.gif')
    })

    test('handles file without extension', () => {
      const filename = generateFlyerFilename(
        'test-item-123',
        'Concert 2023-07-04',
        undefined,
        'filename_no_extension'
      )
      expect(filename).toBe('2023-07-04-flyer_itemimage.jpg') // Default .jpg extension
    })

    test('preserves original file extension', () => {
      const extensions = ['.jpg', '.png', '.gif', '.webp', '.bmp']
      extensions.forEach(ext => {
        const filename = generateFlyerFilename(
          'test-item-123',
          'Concert 2023-07-04', 
          undefined,
          `originalname${ext}`
        )
        expect(filename).toBe(`2023-07-04-flyer_itemimage${ext}`)
      })
    })

    test('uses fallback year when no date found anywhere', () => {
      const currentYear = new Date().getFullYear()
      const filename = generateFlyerFilename(
        'no-date-item',
        'No Date Anywhere',
        undefined,
        'file.jpg'
      )
      expect(filename).toBe(`${currentYear}-01-01-flyer_itemimage.jpg`)
    })

    test('handles malformed date inputs gracefully', () => {
      const filename = generateFlyerFilename(
        'test-item-123',
        'Title with 13/45/2023 invalid date',
        '13/45/2023',
        'file.jpg'
      )
      // Should still process through standardizeDate
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}-flyer_itemimage\.jpg/)
    })
  })
})

describe('standardizeYouTubeUrl', () => {
  test('converts youtube.com/watch?v= format to youtu.be', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('converts youtube.com/watch?v= format with additional params', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PLxyz'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('converts youtube.com/embed/ format to youtu.be', () => {
    const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('converts youtube.com/v/ format to youtu.be', () => {
    const url = 'https://www.youtube.com/v/dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('preserves youtu.be format when already correct', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('handles http:// protocol in youtube.com URLs', () => {
    const url = 'http://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('handles youtube.com without www', () => {
    const url = 'https://youtube.com/watch?v=dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('handles m.youtube.com mobile URLs', () => {
    const url = 'https://m.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/dQw4w9WgXcQ')
  })

  test('handles video IDs with underscores and hyphens', () => {
    const url = 'https://www.youtube.com/watch?v=abc_123-xyz'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtu.be/abc_123-xyz')
  })

  test('returns original URL for non-YouTube URLs', () => {
    const url = 'https://example.com/video?v=abc123'
    expect(standardizeYouTubeUrl(url)).toBe('https://example.com/video?v=abc123')
  })

  test('returns original URL for malformed YouTube URLs', () => {
    const url = 'https://youtube.com/notavideo'
    expect(standardizeYouTubeUrl(url)).toBe('https://youtube.com/notavideo')
  })

  test('handles empty string input', () => {
    expect(standardizeYouTubeUrl('')).toBe('')
  })

  test('handles null/undefined input gracefully', () => {
    expect(standardizeYouTubeUrl(null as any)).toBe(null)
    expect(standardizeYouTubeUrl(undefined as any)).toBe(undefined)
  })

  test('regression test: ensures consistency with createYouTubeUrl format', () => {
    const videoId = 'dQw4w9WgXcQ'
    const longUrl = 'https://www.youtube.com/watch?v=' + videoId
    const standardized = standardizeYouTubeUrl(longUrl)
    const created = createYouTubeUrl(videoId)
    expect(standardized).toBe(created)
  })
})

describe('Constants', () => {
  test('CONSTANTS object contains expected values', () => {
    expect(CONSTANTS.ARCHIVE_SEARCH_API).toBe('https://archive.org/advancedsearch.php')
    expect(CONSTANTS.ARCHIVE_METADATA_API).toBe('https://archive.org/metadata')
    expect(CONSTANTS.YOUTUBE_API_BASE).toBe('https://www.googleapis.com/youtube/v3')
    
    expect(CONSTANTS.API_DELAY_MS).toBe(1000)
    expect(CONSTANTS.MAX_BATCH_SIZE).toBe(100)
    expect(CONSTANTS.MAX_RETRIES).toBe(3)
    
    expect(CONSTANTS.DEFAULT_ARCHIVE_FIELDS).toContain('identifier')
    expect(CONSTANTS.DEFAULT_ARCHIVE_FIELDS).toContain('youtube')
    expect(CONSTANTS.DEFAULT_ARCHIVE_FIELDS.length).toBeGreaterThan(5)
  })
})

describe('Integration Tests - Real Archive.org Patterns', () => {
  test('handles Archive.org identifier-based titles', () => {
    const title = 'gd1977-05-08.sbd.miller.97065.shnf'
    
    // This format extracts the first part before dash as band
    expect(extractBandFromTitle(title)).toBe('gd1977')
    expect(extractVenueFromTitle(title)).toBeNull()
    expect(extractDateFromTitle(title)).toBe('1977-05-08') // Date format extracted
  })

  test('handles modern concert title format', () => {
    const title = 'Grateful Dead - Fire on the Mountain Live at Red Rocks 07/15/2023'
    
    expect(extractBandFromTitle(title)).toBe('Grateful Dead')
    expect(extractVenueFromTitle(title)).toBe('Red Rocks 07/15/2023') // Gets venue + trailing text
    expect(extractDateFromTitle(title)).toBe('2023-07-15') // Standardized format
  })

  test('handles @ venue format (no band extraction)', () => {
    const title = 'Dead & Company @ Shoreline Amphitheatre 07/15/2023'
    
    // @ symbol doesn't match dash/colon patterns, so no band extracted
    expect(extractBandFromTitle(title)).toBeNull()
    expect(extractVenueFromTitle(title)).toBe('Shoreline Amphitheatre 07/15/2023')
    expect(extractDateFromTitle(title)).toBe('2023-07-15')
  })
})

describe('Anti-Hallucination Tests - Critical Patterns', () => {
  test('verifies actual function behavior vs expected patterns', () => {
    // Test that functions return actual results, not assumed results
    const testTitle = 'Test Band - Song at Venue 12/25/2023'
    
    const band = extractBandFromTitle(testTitle)
    const venue = extractVenueFromTitle(testTitle)
    const date = extractDateFromTitle(testTitle)
    
    // These tests verify the actual behavior of the real functions
    expect(band).toBe('Test Band')
    expect(venue).toBe('Venue 12/25/2023') // Venue extraction includes trailing text
    expect(date).toBe('2023-12-25') // Date extraction and standardization works
  })

  test('verifies date standardization edge cases', () => {
    // These verify the actual logic in the real function
    expect(standardizeDate('1/1/99')).toBe('2099-01-01') // Function assumes 21st century
    expect(standardizeDate('31.12.23')).toBe('2023-12-31') // European DD.MM format
    expect(standardizeDate('2023')).toBe('2023-01-01') // Year only gets 01-01 appended
  })
})