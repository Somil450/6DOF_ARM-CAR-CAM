"""
WAREBOT - Structured Log & Event Service
"""
import time
import uuid
from datetime import datetime, timezone
from collections import deque
from typing import List, Optional, Dict, Any
from backend.schemas import LogEntry, Severity, Subsystem

class LogService:
    def __init__(self, max_entries: int = 500):
        self._max_entries = max_entries
        self._entries: deque = deque(maxlen=max_entries)
    
    def log(
        self,
        severity: Severity,
        subsystem: Subsystem,
        event_type: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> LogEntry:
        now = time.time()
        iso_str = datetime.now(timezone.utc).isoformat()
        entry = LogEntry(
            id=str(uuid.uuid4())[:8],
            timestamp=now,
            iso_time=iso_str,
            severity=severity,
            subsystem=subsystem,
            event_type=event_type,
            message=message,
            details=details or {}
        )
        self._entries.append(entry)
        # Also print to terminal with formatted tag
        print(f"[{iso_str}] [{severity.value}] [{subsystem.value}] {event_type}: {message}")
        return entry

    def info(self, subsystem: Subsystem, event_type: str, message: str, details: Optional[Dict[str, Any]] = None):
        return self.log(Severity.INFO, subsystem, event_type, message, details)

    def success(self, subsystem: Subsystem, event_type: str, message: str, details: Optional[Dict[str, Any]] = None):
        return self.log(Severity.SUCCESS, subsystem, event_type, message, details)

    def warning(self, subsystem: Subsystem, event_type: str, message: str, details: Optional[Dict[str, Any]] = None):
        return self.log(Severity.WARNING, subsystem, event_type, message, details)

    def error(self, subsystem: Subsystem, event_type: str, message: str, details: Optional[Dict[str, Any]] = None):
        return self.log(Severity.ERROR, subsystem, event_type, message, details)

    def critical(self, subsystem: Subsystem, event_type: str, message: str, details: Optional[Dict[str, Any]] = None):
        return self.log(Severity.CRITICAL, subsystem, event_type, message, details)

    def get_entries(
        self,
        severity: Optional[str] = None,
        subsystem: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100
    ) -> List[LogEntry]:
        results = list(self._entries)
        
        if severity:
            sev_upper = severity.upper()
            results = [e for e in results if e.severity.value == sev_upper]
            
        if subsystem:
            sub_upper = subsystem.upper()
            results = [e for e in results if e.subsystem.value == sub_upper]
            
        if search:
            query = search.lower()
            results = [
                e for e in results
                if query in e.message.lower() or query in e.event_type.lower()
            ]
            
        # Return newest first
        results.reverse()
        return results[:limit]

    def to_csv(self) -> str:
        lines = ["id,iso_time,severity,subsystem,event_type,message"]
        for e in self._entries:
            # Clean message of commas/newlines
            clean_msg = e.message.replace('"', '""').replace('\n', ' ')
            lines.append(f'"{e.id}","{e.iso_time}","{e.severity.value}","{e.subsystem.value}","{e.event_type}","{clean_msg}"')
        return "\n".join(lines)

    def clear(self):
        self._entries.clear()

# Global log service instance
log_service = LogService()
