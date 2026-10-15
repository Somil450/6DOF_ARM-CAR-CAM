import React, { useState, useEffect } from 'react';
import { useRobotStore, LogEntry } from '../store/useRobotStore';
import {
  ListCollapse,
  Search,
  Download,
  Trash2,
  Copy,
  Check,
  Filter,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

export const LogsScreen: React.FC = () => {
  const { logs, fetchLogs, clearLogs, gatewayHost } = useRobotStore();
  const [search, setSearch] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      fetchLogs({
        severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
        subsystem: selectedSubsystem !== 'ALL' ? selectedSubsystem : undefined,
        search: search.trim() || undefined,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchLogs, selectedSeverity, selectedSubsystem, search]);

  const handleCopy = (entry: LogEntry) => {
    const text = `[${entry.iso_time}] [${entry.severity}] [${entry.subsystem}] ${entry.event_type}: ${entry.message}`;
    navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-accent-red text-white flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>CRITICAL</span>
          </span>
        );
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-accent-red/20 text-accent-red border border-accent-red/40 flex items-center space-x-1">
            <XCircle className="w-3 h-3" />
            <span>ERROR</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40 flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>WARNING</span>
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-accent-green/20 text-accent-green border border-accent-green/40 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>SUCCESS</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-elevated text-text-secondary border border-surface-border">
            INFO
          </span>
        );
    }
  };

  const subsystems = ['ALL', 'SYSTEM', 'GATEWAY', 'CAR', 'ARM', 'CAMERA', 'VISION', 'MISSION'];
  const severities = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL'];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <ListCollapse className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">SYSTEM EVENTS & AUDIT LOGS</h1>
            <p className="text-xs text-text-muted font-mono">
              In-Memory Buffer • Subsystem Classification • Real-time Traceability
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Export CSV */}
          <a
            href={`http://${gatewayHost}:8000/api/logs/export/csv`}
            download="warebot_logs.csv"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs text-text-secondary hover:text-white transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CSV</span>
          </a>

          {/* Export JSON */}
          <a
            href={`http://${gatewayHost}:8000/api/logs/export/json`}
            download="warebot_logs.json"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs text-text-secondary hover:text-white transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT JSON</span>
          </a>

          {/* Clear Logs */}
          <button
            onClick={() => clearLogs()}
            className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-text-muted hover:text-accent-red transition-all active:scale-95"
            title="Clear Log History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="p-3.5 rounded-xl bg-surface-primary border border-surface-border flex flex-col md:flex-row gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search events, messages, commands, or errors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-secondary border border-surface-border text-xs text-white placeholder-text-muted focus:border-accent-blue outline-none font-mono"
          />
        </div>

        {/* Severity Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-text-muted font-mono flex items-center space-x-1">
            <Filter className="w-3.5 h-3.5" />
            <span>SEV:</span>
          </span>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
          >
            {severities.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Subsystem Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-text-muted font-mono">SUBSYSTEM:</span>
          <select
            value={selectedSubsystem}
            onChange={(e) => setSelectedSubsystem(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
          >
            {subsystems.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log Entries List */}
      <div className="space-y-2">
        {logs.length > 0 ? (
          logs.map((entry) => (
            <div
              key={entry.id}
              className="p-3 rounded-lg bg-surface-primary border border-surface-border hover:border-surface-border/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-text-muted text-[11px] flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{entry.iso_time.split('T')[1].replace('Z', '')}</span>
                  </span>
                  {getSeverityBadge(entry.severity)}
                  <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-surface-border text-[10px] text-text-secondary font-bold">
                    {entry.subsystem}
                  </span>
                  <span className="text-white font-bold">{entry.event_type}</span>
                </div>
                <div className="text-text-secondary text-[12px] pl-0.5">{entry.message}</div>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-center">
                <button
                  onClick={() => handleCopy(entry)}
                  className="p-1 rounded bg-surface-secondary hover:bg-surface-elevated text-text-muted hover:text-white border border-surface-border transition-colors"
                  title="Copy log entry to clipboard"
                >
                  {copiedId === entry.id ? (
                    <Check className="w-3.5 h-3.5 text-accent-green" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 rounded-xl bg-surface-primary border border-surface-border text-center text-xs font-mono text-text-muted space-y-2">
            <ListCollapse className="w-8 h-8 mx-auto text-text-muted opacity-40" />
            <div>NO LOG ENTRIES MATCH CURRENT FILTERS</div>
          </div>
        )}
      </div>
    </div>
  );
};
