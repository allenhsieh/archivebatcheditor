import { useState, useCallback } from 'react'
import axios from 'axios'
import { ArchiveItem, UpdateRequest, ApiResponse, LogEntry } from '../types'

export const useArchive = () => {
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
    setLogs(prev => [...prev, { ...entry, timestamp: new Date() }])
  }, [])

  const searchItems = useCallback(async (query: string) => {
    if (!query.trim()) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const response = await axios.get(`/api/search`, {
        params: { q: query }
      })
      setItems(response.data.items || [])
      addLog({
        type: 'info',
        message: `Found ${response.data.items?.length || 0} items for query: ${query}`
      })
    } catch (error) {
      console.error('Search error:', error)
      addLog({
        type: 'error',
        message: `Search failed: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`
      })
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [addLog])

  const getUserItems = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const url = refresh ? '/api/user-items?refresh=true' : '/api/user-items'
      const response = await axios.get(url)
      setItems(response.data.items || [])
      const cacheStatus = response.data.cached ? ' (cached)' : ' (fresh)'
      addLog({
        type: 'info',
        message: `Loaded ${response.data.items?.length || 0} items from your account${cacheStatus}`
      })
    } catch (error) {
      console.error('Load items error:', error)
      addLog({
        type: 'error',
        message: `Failed to load items: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`
      })
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [addLog])

  const refreshUserItems = useCallback(() => getUserItems(true), [getUserItems])

  const updateMetadata = useCallback(async (updateData: UpdateRequest) => {
    setLoading(true)
    addLog({
      type: 'info',
      message: `Starting metadata update for ${updateData.items.length} items...`
    })

    try {
      const response = await axios.post('/api/update-metadata', updateData)
      const results: ApiResponse[] = response.data.results || []
      
      results.forEach(result => {
        addLog({
          type: result.success ? 'success' : 'error',
          message: result.success 
            ? `Updated ${result.identifier}: ${result.message || 'Success'}`
            : `Failed ${result.identifier}: ${result.error || 'Unknown error'}`,
          identifier: result.identifier
        })
      })

      const successCount = results.filter(r => r.success).length
      addLog({
        type: successCount === results.length ? 'success' : 'info',
        message: `Update complete: ${successCount}/${results.length} items updated successfully`
      })

    } catch (error) {
      console.error('Update error:', error)
      addLog({
        type: 'error',
        message: `Batch update failed: ${axios.isAxiosError(error) ? error.message : 'Unknown error'}`
      })
    } finally {
      setLoading(false)
    }
  }, [addLog])

  const toggleItemSelection = useCallback((identifier: string) => {
    setSelectedItems(prev => 
      prev.includes(identifier)
        ? prev.filter(id => id !== identifier)
        : [...prev, identifier]
    )
  }, [])

  const selectAllItems = useCallback(() => {
    setSelectedItems(items.map(item => item.identifier))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return {
    items,
    selectedItems,
    loading,
    logs,
    searchItems,
    getUserItems,
    refreshUserItems,
    updateMetadata,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    clearLogs
  }
}