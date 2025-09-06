import { useEffect } from 'react'
import { useArchive } from './hooks/useArchive'
import { SearchSection } from './components/SearchSection'
import { ItemSelector } from './components/ItemSelector'
import { MetadataEditor } from './components/MetadataEditor'
import { LogViewer } from './components/LogViewer'

function App() {
  const {
    items,
    selectedItems,
    loading,
    logs,
    itemStatuses,
    quotaStatus,  // Add quota status
    searchItems,
    getUserItems,
    refreshUserItems,
    updateMetadata,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    clearLogs,
    fetchQuotaStatus,  // Add fetch function
    addLog,  // Add logging function
    toggleDebugLogging  // Add debug toggle function
  } = useArchive()

  // Fetch quota status when app loads and periodically update it
  useEffect(() => {
    fetchQuotaStatus() // Initial load
    const interval = setInterval(fetchQuotaStatus, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [fetchQuotaStatus])

  return (
    <div className="container">
      <header style={{ marginBottom: '30px' }}>
        <h1>Archive.org Batch Metadata Editor</h1>
        <p style={{ opacity: 0.8 }}>
          Search and batch edit metadata for your Archive.org items
        </p>
      </header>

      {/* YouTube API Quota Status */}
      {quotaStatus && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>🎵 YouTube API Quota Status</strong>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {quotaStatus.used.toLocaleString()} / {quotaStatus.limit.toLocaleString()} units ({quotaStatus.percentage}%)
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: '#e9ecef', 
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${quotaStatus.percentage}%`, 
              height: '100%', 
              backgroundColor: quotaStatus.percentage > 90 ? '#dc3545' : quotaStatus.percentage > 70 ? '#ffc107' : '#28a745',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            {quotaStatus.remaining > 0 
              ? `${quotaStatus.remaining} units remaining (≈${Math.floor(quotaStatus.remaining / 100)} YouTube searches)`
              : '⚠️ Quota exceeded - searches will fail until tomorrow'
            }
          </div>
        </div>
      )}

      <SearchSection
        onSearch={searchItems}
        onLoadUserItems={() => getUserItems()}
        onRefreshUserItems={refreshUserItems}
        loading={loading}
      />

      <ItemSelector
        items={items}
        selectedItems={selectedItems}
        itemStatuses={itemStatuses}  // Pass the item statuses
        onToggleItem={toggleItemSelection}
        onSelectAll={selectAllItems}
        onClearSelection={clearSelection}
      />

      <MetadataEditor
        selectedItems={selectedItems}
        items={items}
        onUpdate={updateMetadata}
        loading={loading}
        addLog={addLog}
        onLoadUserItems={getUserItems}
        onSelectAllItems={selectAllItems}
      />

      <LogViewer
        logs={logs}
        onClearLogs={clearLogs}
        onToggleDebugLogging={toggleDebugLogging}
      />
    </div>
  )
}

export default App