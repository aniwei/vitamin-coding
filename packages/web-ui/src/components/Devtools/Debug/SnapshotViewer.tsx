import { useDevtoolsStore } from '../../../stores/debug'

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function SnapshotField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-[11px] font-mono text-gray-800">{value}</span>
    </div>
  )
}

function MetadataTree({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-1 p-2 bg-gray-50 rounded text-[10px] font-mono text-gray-600 max-h-32 overflow-auto">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <span className="text-purple-600">{k}</span>: {JSON.stringify(v)}
        </div>
      ))}
    </div>
  )
}

export function SnapshotViewer() {
  const snapshot = useDevtoolsStore((s) => s.currentSnapshot)
  const paused = useDevtoolsStore((s) => s.paused)

  if (!paused || !snapshot) return null

  return (
    <div className="px-3 py-2 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs font-medium text-amber-700">
          Paused at <code className="text-[11px] bg-amber-100 px-1 rounded">{snapshot.point}</code>
        </span>
      </div>
      <div className="space-y-0">
        <SnapshotField label="Turn" value={snapshot.turn} />
        <SnapshotField label="Frame Depth" value={snapshot.frameDepth} />
        <SnapshotField label="Messages" value={snapshot.messagesCount} />
        {snapshot.lastToolName && (
          <SnapshotField label="Last Tool" value={snapshot.lastToolName} />
        )}
        {snapshot.tokenUsage && (
          <SnapshotField
            label="Tokens"
            value={`${formatNumber(snapshot.tokenUsage.input)} → ${formatNumber(snapshot.tokenUsage.output)}`}
          />
        )}
      </div>
      {snapshot.metadata && Object.keys(snapshot.metadata).length > 0 && (
        <MetadataTree data={snapshot.metadata} />
      )}
    </div>
  )
}
