import React from 'react'
import { LogEntry } from '../types'

interface LogViewerProps {
  logs: LogEntry[]
  onClearLogs: () => void
  onToggleDebugLogging?: () => void
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClearLogs, onToggleDebugLogging }) => {
  if (logs.length === 0) {
    return null
  }

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>Activity Log ({logs.length})</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onToggleDebugLogging && (
            <button className="button secondary" onClick={onToggleDebugLogging}>
              🔧 Debug
            </button>
          )}
          <button className="button secondary" onClick={onClearLogs}>
            Clear Log
          </button>
        </div>
      </div>
      
      <div className="status-log">
        {logs.slice().reverse().map((log, index) => (
          <div key={index} className={`log-item ${log.type}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div>{log.message}</div>
                {log.identifier && (
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
                    ID: {log.identifier}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.6, whiteSpace: 'nowrap', marginLeft: '10px' }}>
                {log.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}