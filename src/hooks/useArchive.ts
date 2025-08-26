// Import React hooks and TypeScript types we need
import { useState, useCallback } from 'react'  // React hooks for managing state and callbacks
import { ArchiveItem, UpdateRequest, ApiResponse, LogEntry } from '../types' // TypeScript type definitions

// Define the possible status states for each item during processing
type ItemStatus = 'idle' | 'processing' | 'success' | 'error' | 'skipped'

// This is a "custom hook" - a React pattern for sharing stateful logic between components
// Think of it as a collection of related state and functions that work together
export const useArchive = () => {
  // STATE: All the data our app needs to remember
  const [items, setItems] = useState<ArchiveItem[]>([])           // All Archive.org items we've loaded
  const [selectedItems, setSelectedItems] = useState<string[]>([]) // Which items user has selected for editing
  const [loading, setLoading] = useState(false)                   // Whether we're currently loading data
  const [logs, setLogs] = useState<LogEntry[]>([])                // Activity log to show user what happened
  const [itemStatuses, setItemStatuses] = useState<Record<string, ItemStatus>>({}) // Track processing status for each item

  // Helper function to add entries to the activity log
  // useCallback prevents this function from being recreated on every render (performance optimization)
  const addLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
    // Add a new log entry with the current timestamp
    // ...prev keeps all existing logs, then we add the new one
    setLogs(prev => [...prev, { ...entry, timestamp: new Date() }])
  }, [])  // Empty dependency array = this function never changes

  // FUNCTION: Search for Archive.org items publicly (anyone can use this)
  const searchItems = useCallback(async (query: string) => {
    // If user didn't enter anything, clear the results
    if (!query.trim()) {
      setItems([])  // Empty array = no results to show
      return        // Exit early
    }

    setLoading(true)  // Show loading spinner to user
    try {
      // Call our backend API to search Archive.org
      // URLSearchParams safely encodes the query (handles special characters)
      const response = await fetch(`/api/search?${new URLSearchParams({ q: query })}`)
      
      // Check if the request was successful (status 200-299)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      // Convert the response from JSON text to a JavaScript object
      const data = await response.json()
      setItems(data.items || [])  // Update our items state with the results
      // Add a success message to the activity log
      addLog({
        type: 'info',  // This is an informational message (not error or success)
        message: `Found ${data.items?.length || 0} items for query: ${query}`
      })
    } catch (error) {
      // If anything went wrong, log it and show user an error message
      console.error('Search error:', error)  // Log to browser console for debugging
      addLog({
        type: 'error',  // This is an error message
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      setItems([])  // Clear any old results
    } finally {
      // This runs whether the request succeeded or failed
      setLoading(false)  // Hide loading spinner
    }
  }, [addLog])  // This function depends on addLog, so recreate it if addLog changes

  // FUNCTION: Get all items uploaded by the authenticated user
  // This is different from search because it requires your Archive.org credentials
  const getUserItems = useCallback(async (refresh = false) => {
    setLoading(true)  // Show loading spinner
    try {
      // Build the API URL - add ?refresh=true if user wants fresh data
      const url = refresh ? '/api/user-items?refresh=true' : '/api/user-items'
      const response = await fetch(url)  // Call our backend API
      // Check if the request was successful
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      // Parse the JSON response
      const data = await response.json()
      setItems(data.items || [])  // Update our items with user's uploads
      
      // Show user whether this data came from cache or was freshly loaded
      const cacheStatus = data.cached ? ' (cached)' : ' (fresh)'
      
      // Log success message with cache status
      addLog({
        type: 'info',
        message: `Loaded ${data.items?.length || 0} items from your account${cacheStatus}`
      })
    } catch (error) {
      // Handle any errors that occurred
      console.error('Load items error:', error)
      addLog({
        type: 'error',
        message: `Failed to load items: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      setItems([])  // Clear any old results
    } finally {
      // Always hide the loading spinner, whether successful or not
      setLoading(false)
    }
  }, [addLog])  // Recreate this function if addLog changes

  // HELPER FUNCTION: Refresh user items (bypasses cache)
  // This is just a shortcut for getUserItems(true)
  const refreshUserItems = useCallback(() => getUserItems(true), [getUserItems])

  // FUNCTION: Update metadata for selected Archive.org items  
  // This is the main feature - batch editing metadata fields
  const updateMetadata = useCallback(async (updateData: UpdateRequest) => {
    setLoading(true)  // Show loading spinner
    
    // Reset all item statuses to idle
    const initialStatuses: Record<string, ItemStatus> = {}
    updateData.items.forEach(id => {
      initialStatuses[id] = 'idle'
    })
    setItemStatuses(initialStatuses)
    
    // Log that we're starting the update process
    addLog({
      type: 'info',
      message: `Starting metadata update for ${updateData.items.length} items...`
    })

    try {
      // Send the update request to our backend API
      const response = await fetch('/api/update-metadata', {
        method: 'POST',                               // POST request (we're sending data)
        headers: {
          'Content-Type': 'application/json',         // Tell server we're sending JSON
        },
        body: JSON.stringify(updateData),             // Convert our data to JSON string
      })
      
      // Check if the request was successful
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      // Parse the response to get results for each item
      const data = await response.json()
      const results: ApiResponse[] = data.results || []  // Array of results (one per item updated)
      
      // Log the result for each individual item and update their visual status
      results.forEach((result, index) => {
        const progress = result.progress || `${index + 1}/${results.length}`
        
        // Determine the visual status based on the result
        let status: ItemStatus = 'error'
        if (result.success) {
          if (result.updated === 0 && result.skipped && result.skipped > 0) {
            status = 'skipped'  // All fields were skipped
          } else {
            status = 'success'  // At least some fields were updated
          }
        }
        
        // Update the visual status for this item
        if (result.identifier) {
          setItemStatuses(prev => ({ ...prev, [result.identifier!]: status }))
        }
        
        addLog({
          type: result.success ? 'success' : 'error',  // Green for success, red for error
          message: result.success 
            ? `[${progress}] ✅ Updated ${result.identifier}: ${result.message || 'Success'}`
            : `[${progress}] ❌ Failed ${result.identifier}: ${result.error || 'Unknown error'}`,
          identifier: result.identifier  // Include the item ID for reference
        })
      })

      // Count how many items were successfully updated
      const successCount = results.filter(r => r.success).length
      
      // Add a comprehensive summary message
      const successRate = Math.round((successCount / results.length) * 100)
      addLog({
        type: successCount === results.length ? 'success' : 'info',  // Success if all worked, info if some failed
        message: `🎉 Batch update completed! ${successCount}/${results.length} items successful (${successRate}%)`
      })
      
      // If there were failures, add a note about them
      if (successCount < results.length) {
        const failureCount = results.length - successCount
        addLog({
          type: 'info',
          message: `📋 ${failureCount} item(s) failed - check individual results above for details`
        })
      }

    } catch (error) {
      // Handle any errors during the update process
      console.error('Update error:', error)
      addLog({
        type: 'error',
        message: `Batch update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      // Always hide loading spinner when done
      setLoading(false)
    }
  }, [addLog])  // Recreate this function if addLog changes

  // HELPER FUNCTION: Toggle whether an item is selected
  // Used when user clicks checkboxes next to items
  const toggleItemSelection = useCallback((identifier: string) => {
    setSelectedItems(prev => 
      prev.includes(identifier)                   // If item is already selected...
        ? prev.filter(id => id !== identifier)   // ...remove it from selection
        : [...prev, identifier]                  // ...otherwise add it to selection
    )
  }, [])

  // HELPER FUNCTION: Select all currently loaded items
  // Used for "Select All" checkbox
  const selectAllItems = useCallback(() => {
    setSelectedItems(items.map(item => item.identifier))  // Get all item IDs and set as selected
  }, [items])  // Recreate if items list changes

  // HELPER FUNCTION: Deselect all items
  // Used for "Clear Selection" button
  const clearSelection = useCallback(() => {
    setSelectedItems([])  // Empty array = nothing selected
  }, [])

  // HELPER FUNCTION: Clear the activity log
  // Used for "Clear Logs" button
  const clearLogs = useCallback(() => {
    setLogs([])  // Empty array = no log entries
  }, [])
  
  // HELPER FUNCTION: Clear all item statuses
  // Used to reset visual indicators
  const clearItemStatuses = useCallback(() => {
    setItemStatuses({})
  }, [])

  // RETURN: All the state and functions that components can use
  // This is what gets "hooked into" when components call useArchive()
  return {
    // STATE (data that components can read)
    items,              // Array of Archive.org items
    selectedItems,      // Array of selected item IDs
    loading,            // Boolean: are we loading something?
    logs,               // Array of activity log entries
    itemStatuses,       // Object mapping item IDs to their processing status
    
    // FUNCTIONS (actions that components can trigger)
    searchItems,        // Search Archive.org publicly
    getUserItems,       // Load user's own items
    refreshUserItems,   // Force refresh user's items
    updateMetadata,     // Update metadata on selected items
    toggleItemSelection,// Select/deselect individual items
    selectAllItems,     // Select all loaded items
    clearSelection,     // Deselect all items
    clearLogs,          // Clear the activity log
    clearItemStatuses   // Clear all item status indicators
  }
}