import { v4 as uuidv4 } from 'uuid';

export function generateRequestId(): string {
  return `req_${uuidv4().slice(0, 8)}`;
}

export interface LogEntry {
  requestId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  stage: string;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  private entries: LogEntry[] = [];

  log(requestId: string, stage: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      level: 'info',
      stage,
      message,
      data,
    };
    this.entries.push(entry);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${entry.timestamp}] [${requestId}] [${stage}] ${message}`, data || '');
    }
  }

  warn(requestId: string, stage: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage,
      message,
      data,
    };
    this.entries.push(entry);
    console.warn(`[${entry.timestamp}] [${requestId}] [${stage}] WARN: ${message}`, data || '');
  }

  error(requestId: string, stage: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      level: 'error',
      stage,
      message,
      data,
    };
    this.entries.push(entry);
    console.error(`[${entry.timestamp}] [${requestId}] [${stage}] ERROR: ${message}`, data || '');
  }

  getEntries(requestId?: string): LogEntry[] {
    if (requestId) {
      return this.entries.filter(e => e.requestId === requestId);
    }
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }
}

export const logger = new Logger();
