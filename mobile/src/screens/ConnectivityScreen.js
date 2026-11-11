import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Switch,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOfflineQueue, syncOfflineQueue, clearOfflineQueue } from "../services/offlineQueueService";
import socket from "../api/socket";
import { checkServerReady } from "../api/auth";
import { getApiBaseUrl, getWsBaseUrl } from "../config";

const AUTO_SYNC_KEY = "@chatapp_auto_sync";

export default function ConnectivityScreen() {
  const [wsConnected, setWsConnected] = useState(socket.isConnected);
  const [apiReachable, setApiReachable] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [checking, setChecking] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const loadQueue = useCallback(async () => {
    const q = await getOfflineQueue();
    setQueue(q);
  }, []);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    const start = Date.now();
    try {
      await checkServerReady();
      setApiReachable(true);
      setLatencyMs(Date.now() - start);
    } catch {
      setApiReachable(false);
      setLatencyMs(null);
    } finally {
      setWsConnected(socket.isConnected);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    checkHealth();

    AsyncStorage.getItem(AUTO_SYNC_KEY).then((val) => {
      if (val !== null) setAutoSync(val === "true");
    });

    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [loadQueue, checkHealth]);

  const handleToggleAutoSync = async (nextVal) => {
    setAutoSync(nextVal);
    await AsyncStorage.setItem(AUTO_SYNC_KEY, nextVal ? "true" : "false");
  };

  const handleReconnectAndPing = async () => {
    if (!socket.isConnected) {
      socket.connect();
    }
    await checkHealth();
  };

  const handleManualSync = async () => {
    if (queue.length === 0) {
      await handleReconnectAndPing();
      Alert.alert("Outbox Empty", "No pending offline messages. Server connection refreshed.");
      return;
    }
    setSyncing(true);
    if (!socket.isConnected) {
      socket.connect();
    }
    const { syncedCount, failedCount } = await syncOfflineQueue();
    setSyncing(false);
    await loadQueue();
    await checkHealth();
    Alert.alert(
      "Sync Complete",
      `Delivered ${syncedCount} queued message(s).${failedCount > 0 ? ` ${failedCount} remaining.` : ""}`
    );
  };

  const handleClear = async () => {
    Alert.alert("Clear Queue", "Discard all pending unsent messages?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await clearOfflineQueue();
          await loadQueue();
        },
      },
    ]);
  };

  const isHealthy = wsConnected || apiReachable === true;

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <View style={styles.content}>
        {/* Connection State Card */}
        <Text style={styles.sectionHeader}>CONNECTION STATE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.statusTitle}>Real-Time Backend Server</Text>
              <Text style={styles.statusSub} numberOfLines={1}>{getApiBaseUrl()}</Text>
              <Text style={styles.statusSub} numberOfLines={1}>
                WS: {getWsBaseUrl()} {wsConnected ? "• Connected" : "• Disconnected"}
              </Text>
              {latencyMs !== null && (
                <Text style={styles.latencyText}>API Ping: {latencyMs} ms</Text>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: isHealthy ? "#E8F3ED" : "#FADBD8" }]}>
              <Text style={[styles.badgeText, { color: isHealthy ? "#236B4A" : "#C0392B" }]}>
                {wsConnected ? "Live WS" : apiReachable ? "REST Ready" : apiReachable === false ? "Offline" : "Checking"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.pingBtn}
            onPress={handleReconnectAndPing}
            disabled={checking}
          >
            <Text style={styles.pingBtnText}>
              {checking ? "Testing Server..." : "Ping Server & Reconnect WebSocket"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sync Settings */}
        <Text style={styles.sectionHeader}>SYNCHRONIZATION POLICY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Auto-Sync on Reconnect</Text>
              <Text style={styles.rowSubLabel}>Replays offline queue when network returns</Text>
            </View>
            <Switch
              value={autoSync}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {/* Offline Queue */}
        <View style={styles.queueHeaderRow}>
          <Text style={styles.sectionHeader}>OFFLINE MESSAGE QUEUE ({queue.length})</Text>
          {queue.length > 0 && (
            <TouchableOpacity onPress={handleClear}>
              <Text style={styles.clearText}>Discard All</Text>
            </TouchableOpacity>
          )}
        </View>

        {queue.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Outbox is clean. All messages delivered.</Text>
          </View>
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.queueItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueContent}>{item.content || "Media Attachment"}</Text>
                  <Text style={styles.queueTime}>Queued at {new Date(item.timestamp).toLocaleTimeString()}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>{(item.state || "queued").toUpperCase()}</Text>
                </View>
              </View>
            )}
          />
        )}

        <TouchableOpacity style={styles.syncBtn} onPress={handleManualSync} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.syncBtnText}>
              {queue.length > 0 ? "Synchronize Outbox Now" : "Verify Sync & Refresh"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F5",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#737A75",
    marginBottom: 8,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  queueHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  clearText: {
    fontSize: 12,
    color: "#C0392B",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E3E6E1",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E3E6E1",
    alignItems: "center",
  },
  emptyText: {
    color: "#27834A",
    fontSize: 14,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#202421",
  },
  statusSub: {
    fontSize: 12,
    color: "#737A75",
    marginTop: 2,
  },
  latencyText: {
    fontSize: 11,
    color: "#236B4A",
    fontWeight: "600",
    marginTop: 4,
  },
  pingBtn: {
    marginTop: 12,
    backgroundColor: "#F1F2EF",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E3E6E1",
  },
  pingBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#236B4A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#202421",
  },
  rowSubLabel: {
    fontSize: 12,
    color: "#737A75",
    marginTop: 2,
  },
  queueItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E3E6E1",
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  queueContent: {
    fontSize: 14,
    color: "#202421",
    fontWeight: "500",
  },
  queueTime: {
    fontSize: 11,
    color: "#737A75",
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: "#F1F2EF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#B7791F",
  },
  syncBtn: {
    backgroundColor: "#236B4A",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

