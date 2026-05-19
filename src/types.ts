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
  progress?: string
  skipped?: number
  updated?: number
}

export interface LogEntry {
  type: 'success' | 'error' | 'info' | 'skipped'
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
  quotaExhausted?: boolean
  quotaStatus?: {
    used: number
    limit: number
    remaining: number
    percentage: number
  }
}

// JSON Patch operation interface for metadata updates
export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove'
  path: string
  value: string
}

// Archive.org metadata write API response — documented at https://archive.org/developers/md-write.html
export interface ArchiveApiResult {
  success: boolean
  // Error response fields
  error?: string
  // Success response fields
  task_id?: number
  log?: string
}

// Enhanced error type for API responses
export interface ApiError extends Error {
  response?: {
    status: number
    result?: ArchiveApiResult
  }
  status?: number
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'response' in error
}