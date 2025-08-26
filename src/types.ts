export interface ArchiveItem {
  identifier: string
  title: string
  description?: string
  creator?: string
  date?: string
  mediatype?: string
  collection?: string[]
  subject?: string[]
  [key: string]: unknown
}

export interface MetadataUpdate {
  field: string
  value: string
  operation: 'add' | 'replace' | 'remove'
}

export interface UpdateRequest {
  items: string[]
  updates: MetadataUpdate[]
}

export interface ApiResponse {
  success: boolean
  identifier?: string
  message?: string
  error?: string
}

export interface LogEntry {
  type: 'success' | 'error' | 'info'
  message: string
  identifier?: string
  timestamp: Date
}

export interface YouTubeMatch {
  videoId: string
  title: string
  url: string
  publishedAt: string
  extractedBand: string | null
  extractedVenue: string | null
  extractedDate: string | null
}

export interface YouTubeSuggestionResponse {
  success: boolean
  match?: YouTubeMatch
  suggestions?: {
    youtube: string
    band: string | null
    venue: string | null
    date: string | null
  }
  message?: string
}