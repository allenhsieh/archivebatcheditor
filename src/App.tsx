import { } from 'react'
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
    itemStatuses,  // Add the new itemStatuses from the hook
    searchItems,
    getUserItems,
    refreshUserItems,
    updateMetadata,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    clearLogs
  } = useArchive()

  return (
    <div className="container">
      <header style={{ marginBottom: '30px' }}>
        <h1>Archive.org Batch Metadata Editor</h1>
        <p style={{ opacity: 0.8 }}>
          Search and batch edit metadata for your Archive.org items
        </p>
      </header>

      <SearchSection
        onSearch={searchItems}
        onLoadUserItems={getUserItems}
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
      />

      <LogViewer
        logs={logs}
        onClearLogs={clearLogs}
      />
    </div>
  )
}

export default App