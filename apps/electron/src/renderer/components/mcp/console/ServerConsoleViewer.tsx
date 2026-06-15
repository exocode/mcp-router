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
import { IconTrash, IconRefresh, IconDownload } from "@tabler/icons-react";
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
const LOG_ROW_HEIGHT = 24;
const LOG_OVERSCAN = 30;

const trimLogs = (entries: ConsoleLogEntry[]) =>
  entries.length > MAX_LOGS_PER_SERVER
    ? entries.slice(-MAX_LOGS_PER_SERVER)
    : entries;

const ServerConsoleViewer: React.FC = () => {
  const { t } = useTranslation();
  const { servers } = useServerStore();
  const [selectedServerId, setSelectedServerId] = useState<string>("all");
  const [logs, setLogs] = useState<Record<string, ConsoleLogEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
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

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => {
      setViewportHeight(container.clientHeight);
    };

    updateViewportHeight();

    const resizeObserver = new window.ResizeObserver(() => {
      updateViewportHeight();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
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

  const totalHeight = displayLogs.length * LOG_ROW_HEIGHT;
  const visibleRowCount = Math.ceil(viewportHeight / LOG_ROW_HEIGHT);
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / LOG_ROW_HEIGHT) - LOG_OVERSCAN,
  );
  const endIndex = Math.min(
    displayLogs.length,
    startIndex + visibleRowCount + LOG_OVERSCAN * 2,
  );
  const visibleLogs = displayLogs.slice(startIndex, endIndex);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          {t("serverConsole.title", "Server Console")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "serverConsole.description",
            "View console output from all running MCP servers",
          )}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-4 items-center">
        <Select value={selectedServerId} onValueChange={setSelectedServerId}>
          <SelectTrigger className="w-[200px]">
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

        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          disabled={loading}
        >
          <IconRefresh className="h-4 w-4 mr-2" />
          {t("common.refresh", "Refresh")}
        </Button>

        <Button variant="outline" size="sm" onClick={handleClearLogs}>
          <IconTrash className="h-4 w-4 mr-2" />
          {t("common.clear", "Clear")}
        </Button>

        <Button variant="outline" size="sm" onClick={handleExportLogs}>
          <IconDownload className="h-4 w-4 mr-2" />
          {t("serverConsole.export", "Export")}
        </Button>

        <label className="flex items-center gap-2 ml-auto">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">
            {t("serverConsole.autoScroll", "Auto-scroll")}
          </span>
        </label>
      </div>

      {/* Console Output */}
      <Card className="flex-1 overflow-hidden p-0">
        <div
          ref={logContainerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="h-full overflow-auto p-4 bg-black text-green-400 font-mono text-sm"
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
            <div
              style={{
                height: totalHeight,
                position: "relative",
              }}
            >
              {visibleLogs.map((log, index) => {
                const absoluteIndex = startIndex + index;
                const timestamp = new Date(log.timestamp).toLocaleTimeString();
                const isError = log.type === "stderr";
                const serverLabel =
                  selectedServerId === "all" ? `[${log.serverName}]` : "";

                return (
                  <div
                    key={`${log.serverId}-${absoluteIndex}-${log.timestamp}`}
                    className={isError ? "text-red-400" : "text-green-400"}
                    style={{
                      position: "absolute",
                      top: absoluteIndex * LOG_ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: LOG_ROW_HEIGHT,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <span className="text-gray-500">{timestamp}</span>
                    {serverLabel && (
                      <span className="text-blue-400 ml-2">{serverLabel}</span>
                    )}
                    <span className={`ml-2 ${isError ? "text-red-400" : ""}`}>
                      {log.content}
                    </span>
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
