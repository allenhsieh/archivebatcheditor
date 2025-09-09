/**
 * Utility functions for Archive.org batch editor
 * These functions are used throughout the server and are exported for testing
 */

/**
 * Simple delay function for rate limiting
 * @param ms Milliseconds to delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Standardize date format for Archive.org
 * Converts various date formats to YYYY-MM-DD
 */
export function standardizeDate(dateStr: string): string {
  if (!dateStr) return dateStr
  
  // Handle MM/DD/YY format (e.g., "03/12/14" -> "2014-03-12")
  const mmddyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (mmddyyMatch) {
    const [, month, day, year] = mmddyyMatch
    const fullYear = `20${year}` // Assuming 21st century
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Handle MM/DD/YYYY format (e.g., "03/12/2014" -> "2014-03-12")
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Handle DD.MM.YY format (e.g., "12.03.14" -> "2014-03-12")
  const ddmmyyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/)
  if (ddmmyyMatch) {
    const [, day, month, year] = ddmmyyMatch
    const fullYear = `20${year}` // Assuming 21st century
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Handle DD.MM.YYYY format (e.g., "12.03.2014" -> "2014-03-12")
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Handle ISO date format (e.g., "2016-02-28T00:00:00Z" -> "2016-02-28")
  const isoDateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})T/)
  if (isoDateMatch) {
    return isoDateMatch[1]
  }
  
  // Handle YYYY-MM-DD format (already correct)
  const yyyymmddMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/)
  if (yyyymmddMatch) {
    return dateStr
  }
  
  // Handle YYYY format (add 01-01)
  const yyyyMatch = dateStr.match(/^\d{4}$/)
  if (yyyyMatch) {
    return `${dateStr}-01-01`
  }
  
  console.warn(`Unrecognized date format: "${dateStr}", returning as-is`)
  return dateStr
}

/**
 * Extract band name from title using common patterns
 */
export function extractBandFromTitle(title: string): string | null {
  if (!title) return null
  
  // Common patterns for band names in Archive.org titles
  const patterns = [
    /^([^-]+?)\s*-/,  // "Band Name - Song" 
    /^([^:]+?):/,     // "Band Name: Song"
    /^([^(]+?)\s*\(/  // "Band Name (details)"
  ]
  
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match && match[1]) {
      const bandName = match[1].trim()
      // Filter out common non-band patterns
      if (bandName.length > 2 && !bandName.match(/^(live|show|concert|performance)$/i)) {
        return bandName
      }
    }
  }
  
  return null
}

/**
 * Extract venue from title using common patterns
 */
export function extractVenueFromTitle(title: string): string | null {
  if (!title) return null
  
  // Look for venue patterns
  const venuePatterns = [
    /at\s+([^,()]+)/i,     // "at Venue Name"
    /live\s+at\s+([^,()]+)/i, // "Live at Venue"  
    /@\s*([^,()]+)/        // "@ Venue"
  ]
  
  for (const pattern of venuePatterns) {
    const match = title.match(pattern)
    if (match && match[1]) {
      const venue = match[1].trim()
      if (venue.length > 2) {
        return venue
      }
    }
  }
  
  return null
}

/**
 * Extract date from title using common patterns
 */
export function extractDateFromTitle(title: string): string | null {
  if (!title) return null
  
  // Date patterns in titles
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,        // YYYY-MM-DD
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/, // MM/DD/YY or MM/DD/YYYY
    /(\d{1,2}\.\d{1,2}\.\d{2,4})/, // MM.DD.YY or MM.DD.YYYY
    /(\d{4})/                      // Just year
  ]
  
  for (const pattern of datePatterns) {
    const match = title.match(pattern)
    if (match && match[1]) {
      return standardizeDate(match[1])
    }
  }
  
  return null
}

/**
 * Check if error indicates rate limiting
 */
export function isRateLimitError(error: any): boolean {
  const message = error?.message?.toLowerCase() || ''
  const status = error?.status || error?.response?.status
  
  return status === 429 || 
         message.includes('rate limit') || 
         message.includes('too many requests') ||
         message.includes('quota exceeded')
}

/**
 * Check if error indicates YouTube quota exhaustion
 */
export function isYouTubeQuotaError(error: any): boolean {
  const message = error?.message?.toLowerCase() || ''
  const status = error?.status || error?.response?.status
  
  return status === 403 ||
         message.includes('quota') ||
         message.includes('quota_exhausted') ||
         message.includes('exceeded your quota') ||
         error?.quotaExhausted === true
}

/**
 * Build Archive.org search URL with proper parameters
 */
export function buildArchiveSearchUrl(query: string, fields: string[], rows: number = 1000): string {
  const baseUrl = 'https://archive.org/advancedsearch.php'
  const searchUrl = new URL(baseUrl)
  
  searchUrl.searchParams.set('q', query)
  searchUrl.searchParams.set('fl', fields.join(','))
  searchUrl.searchParams.set('rows', rows.toString())
  searchUrl.searchParams.set('output', 'json')
  searchUrl.searchParams.set('sort', 'addeddate desc')
  
  return searchUrl.toString()
}

/**
 * Build Archive.org metadata update URL
 */
export function buildArchiveMetadataUrl(identifier: string): string {
  return `https://archive.org/metadata/${identifier}`
}

/**
 * Build YouTube search URL with proper parameters
 */
export function buildYouTubeSearchUrl(apiKey: string, channelId: string, query: string): string {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  
  searchUrl.searchParams.set('key', apiKey)
  searchUrl.searchParams.set('channelId', channelId)
  searchUrl.searchParams.set('q', query)
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', '10')
  
  return searchUrl.toString()
}

/**
 * Create YouTube video URL from video ID (short format)
 */
export function createYouTubeUrl(videoId: string): string {
  return `https://youtu.be/${videoId}`
}

/**
 * Standardize YouTube URL to short youtu.be format
 * Converts various YouTube URL formats to https://youtu.be/VIDEO_ID
 */
export function standardizeYouTubeUrl(url: string): string {
  if (!url) return url
  
  // Extract video ID from various YouTube URL formats
  const videoIdPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]+)/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/
  ]
  
  for (const pattern of videoIdPatterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://youtu.be/${match[1]}`
    }
  }
  
  // If already in youtu.be format or no match found, return as-is
  return url
}

/**
 * Generate standardized flyer filename from Archive.org item data
 * Format: {YYYY-MM-DD}-flyer_itemimage.{ext}
 * 
 * @param identifier Archive.org item identifier
 * @param title Item title (used to extract date if no explicit date)
 * @param date Explicit date field from item metadata
 * @param originalFilename Original uploaded filename (to get extension)
 * @returns Standardized filename
 */
export function generateFlyerFilename(
  identifier: string, 
  title: string, 
  date: string | undefined, 
  originalFilename: string
): string {
  // Extract file extension from original filename
  const lastDotIndex = originalFilename.lastIndexOf('.')
  const extension = lastDotIndex !== -1 ? originalFilename.slice(lastDotIndex) : '.jpg'
  
  // Try to get date from multiple sources
  let extractedDate: string | null = null
  
  // 1. Use explicit date field if provided
  if (date) {
    extractedDate = standardizeDate(date)
  }
  
  // 2. Extract date from title
  if (!extractedDate) {
    extractedDate = extractDateFromTitle(title)
  }
  
  // 3. Extract date from identifier (common Archive.org pattern like gd1977-05-08)
  if (!extractedDate) {
    extractedDate = extractDateFromTitle(identifier)
  }
  
  // 4. Fallback: extract year from identifier if it contains one
  if (!extractedDate) {
    const yearMatch = identifier.match(/\b(19|20)\d{2}\b/)
    if (yearMatch) {
      extractedDate = `${yearMatch[0]}-01-01`
    }
  }
  
  // 5. Ultimate fallback: use current year
  if (!extractedDate) {
    const currentYear = new Date().getFullYear()
    extractedDate = `${currentYear}-01-01`
    console.warn(`Could not extract date from identifier "${identifier}" or title "${title}", using ${extractedDate}`)
  }
  
  // Generate the standardized filename
  const standardizedName = `${extractedDate}-flyer_itemimage${extension}`
  
  console.log(`📝 Flyer filename: "${originalFilename}" → "${standardizedName}" (from identifier: "${identifier}")`)
  
  return standardizedName
}

/**
 * Constants used throughout the application
 */
export const CONSTANTS = {
  // API URLs
  ARCHIVE_SEARCH_API: 'https://archive.org/advancedsearch.php',
  ARCHIVE_METADATA_API: 'https://archive.org/metadata',
  YOUTUBE_API_BASE: 'https://www.googleapis.com/youtube/v3',
  
  // Rate limiting
  API_DELAY_MS: 1000,
  RETRY_DELAY_MS: 5000,
  MAX_RETRIES: 3,
  
  // Batch limits
  MAX_BATCH_SIZE: 100,
  
  // Default fields for Archive.org queries
  DEFAULT_ARCHIVE_FIELDS: [
    'identifier',
    'title', 
    'creator',
    'description',
    'date',
    'mediatype',
    'collection',
    'subject',
    'uploader',
    'youtube'
  ]
} as const