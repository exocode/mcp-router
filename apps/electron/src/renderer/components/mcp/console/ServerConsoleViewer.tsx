import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mcp_router/ui";
import {
  IconTrash,
  IconRefresh,
  IconDownload,
  IconTerminal2,
} from "@tabler/icons-react";
import { useServerStore } from "@/renderer/stores";

interface ConsoleLogEntry {
  serverId: string;
  serverName: string;
  timestamp: string;
  type: "stdout" | "stderr";
  content: string;
}

const MAX_LOGS_PER_SERVER = 1000;
const LOG_FLUSH_INTERVAL_MS = 100;

const trimLogs = (entries: ConsoleLogEntry[]) =>
  entries.length > MAX_LOGS_PER_SERVER
    ? entries.slice(-MAX_LOGS_PER_SERVER)
    : entries;

// Many MCP servers write normal/info output to stderr (banners, "Starting
// server", etc.), so the stdout/stderr stream is a poor error signal. Classify
// by content instead: red only for genuine errors, amber for warnings, green
// for everything else.
const ERROR_PATTERN =
  /\b(errors?|exception|fatal|panic|traceback|unhandled|econnrefused|eaddrinuse|enotfound|etimedout|failed|failure)\b/i;
const WARN_PATTERN = /\b(warn(?:ing)?|deprecat\w*)\b/i;

const LOG_LEVEL_CLASS: Record<"error" | "warn" | "info", string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-emerald-300",
};

const classifyLogLevel = (content: string): "error" | "warn" | "info" => {
  if (ERROR_PATTERN.test(content)) return "error";
  if (WARN_PATTERN.test(content)) return "warn";
  return "info";
};

const ServerConsoleViewer: React.FC = () => {
  const { t } = useTranslation();
  const { servers } = useServerStore();
  const [selectedServerId, setSelectedServerId] = useState<string>("all");
  const [logs, setLogs] = useState<Record<string, ConsoleLogEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const pendingLogsRef = useRef<Record<string, ConsoleLogEntry[]>>({});
  const flushTimeoutRef = useRef<number | null>(null);

  // Get running servers
  const runningServers = Array.from(servers.values()).filter(
    (server) => server.status === "running" || server.status === "starting",
  );

  // Load logs for all servers or a specific server
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getConsoleLogs(
        selectedServerId === "all" ? undefined : selectedServerId,
      );

      // Handle both array and object return types
      if (selectedServerId === "all") {
        // Should be an object with serverId keys
        if (Array.isArray(result)) {
          // Convert array to object grouped by serverId
          const logsObj: Record<string, ConsoleLogEntry[]> = {};
          result.forEach((log) => {
            if (!logsObj[log.serverId]) {
              logsObj[log.serverId] = [];
            }
            logsObj[log.serverId].push(log);
          });
          const trimmedLogs = Object.fromEntries(
            Object.entries(logsObj).map(([serverId, entries]) => [
              serverId,
              trimLogs(entries),
            ]),
          );
          setLogs(trimmedLogs);
        } else {
          const trimmedLogs = Object.fromEntries(
            Object.entries(result || {}).map(([serverId, entries]) => [
              serverId,
              trimLogs(entries as ConsoleLogEntry[]),
            ]),
          );
          setLogs(trimmedLogs);
        }
      } else {
        // Should be an array for a specific server
        const logArray = Array.isArray(result) ? result : [];
        setLogs({ [selectedServerId]: trimLogs(logArray) });
      }
    } catch (error) {
      console.error("Failed to load console logs:", error);
      setLogs({});
    } finally {
      setLoading(false);
    }
  }, [selectedServerId]);

  // Initial load when selectedServerId changes
  useEffect(() => {
    loadLogs();
  }, [selectedServerId]); // Only reload when server selection changes

  const flushPendingLogs = useCallback(() => {
    flushTimeoutRef.current = null;
    const pendingLogs = pendingLogsRef.current;
    pendingLogsRef.current = {};

    if (Object.keys(pendingLogs).length === 0) {
      return;
    }

    setLogs((prevLogs) => {
      const nextLogs = { ...prevLogs };

      Object.entries(pendingLogs).forEach(([serverId, entries]) => {
        const existingLogs = nextLogs[serverId] || [];
        nextLogs[serverId] = trimLogs([...existingLogs, ...entries]);
      });

      return nextLogs;
    });

    if (autoScroll && logContainerRef.current) {
      window.requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop =
            logContainerRef.current.scrollHeight;
        }
      });
    }
  }, [autoScroll]);

  // Subscribe to real-time log updates
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      // Subscribe to log updates
      unsubscribe = window.electronAPI.onConsoleLog(
        (logEntry: ConsoleLogEntry) => {
          const serverLogs = pendingLogsRef.current[logEntry.serverId] || [];
          pendingLogsRef.current[logEntry.serverId] = [...serverLogs, logEntry];

          if (!flushTimeoutRef.current) {
            flushTimeoutRef.current = window.setTimeout(
              flushPendingLogs,
              LOG_FLUSH_INTERVAL_MS,
            );
          }
        },
        selectedServerId === "all" ? undefined : selectedServerId,
      );
    } catch (error) {
      console.error("Failed to subscribe to console logs:", error);
    }

    return () => {
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      flushPendingLogs();
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedServerId, flushPendingLogs]); // Only resubscribe when server selection changes

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

  // Clear logs for selected server
  const handleClearLogs = async () => {
    try {
      await window.electronAPI.clearConsoleLogs(
        selectedServerId === "all" ? undefined : selectedServerId,
      );
      await loadLogs();
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  // Export logs
  const handleExportLogs = () => {
    const logsToExport =
      selectedServerId === "all"
        ? Object.values(logs).flat()
        : logs[selectedServerId] || [];

    const logText = logsToExport
      .map(
        (log) =>
          `[${new Date(log.timestamp).toLocaleString()}] [${log.type.toUpperCase()}] ${log.serverName}: ${log.content}`,
      )
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-console-logs-${selectedServerId}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get logs to display
  const displayLogs = useMemo(
    () =>
      selectedServerId === "all"
        ? Object.values(logs)
            .flat()
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        : logs[selectedServerId] || [],
    [logs, selectedServerId],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Compact header + controls in a single bar */}
      <div className="flex items-center gap-2 mb-3">
        <IconTerminal2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        <h1 className="text-sm font-semibold flex-shrink-0">
          {t("serverConsole.title", "Server Console")}
        </h1>
        <Select value={selectedServerId} onValueChange={setSelectedServerId}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue
              placeholder={t("serverConsole.selectServer", "Select Server")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("serverConsole.allServers", "All Servers")}
            </SelectItem>
            {runningServers.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                {server.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={loadLogs}
            disabled={loading}
            title={t("common.refresh", "Refresh")}
          >
            <IconRefresh className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClearLogs}
            title={t("common.clear", "Clear")}
          >
            <IconTrash className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleExportLogs}
            title={t("serverConsole.export", "Export")}
          >
            <IconDownload className="h-4 w-4" />
          </Button>

          <label className="flex items-center gap-1.5 ml-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">
              {t("serverConsole.autoScroll", "Auto-scroll")}
            </span>
          </label>
        </div>
      </div>

      {/* Console Output */}
      <Card className="flex-1 overflow-hidden p-0">
        <div
          ref={logContainerRef}
          className="h-full overflow-auto p-3 bg-zinc-950 text-emerald-300 font-mono text-xs"
          style={{ fontFamily: "monospace" }}
        >
          {loading && displayLogs.length === 0 ? (
            <div className="text-muted-foreground">
              {t("serverConsole.loading", "Loading...")}
            </div>
          ) : displayLogs.length === 0 ? (
            <div className="text-muted-foreground">
              {selectedServerId === "all"
                ? t(
                    "serverConsole.noLogs",
                    "No console output available. Start a server to see its output.",
                  )
                : t(
                    "serverConsole.noLogsForServer",
                    "No console output available for this server.",
                  )}
            </div>
          ) : (
            <div>
              {displayLogs.map((log, index) => {
                const timestamp = new Date(log.timestamp).toLocaleTimeString();
                const colorClass =
                  LOG_LEVEL_CLASS[classifyLogLevel(log.content)];
                const serverLabel =
                  selectedServerId === "all" ? `[${log.serverName}]` : "";

                return (
                  <div
                    key={`${log.serverId}-${index}-${log.timestamp}`}
                    className={`mb-0.5 ${colorClass}`}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                  >
                    <span className="text-gray-500">{timestamp}</span>
                    {serverLabel && (
                      <span className="text-sky-400 ml-2">{serverLabel}</span>
                    )}
                    <span className="ml-2">{log.content}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ServerConsoleViewer;
