import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Switch,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { getOfflineQueue, syncOfflineQueue, clearOfflineQueue } from "../services/offlineQueueService";

export default function ConnectivityScreen() {
  const [isOnline, setIsOnline] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    const q = await getOfflineQueue();
    setQueue(q);
  };

  const handleManualSync = async () => {
    if (queue.length === 0) {
      Alert.alert("Queue Empty", "There are no pending offline messages.");
      return;
    }
    setSyncing(true);
    const { syncedCount, failedCount } = await syncOfflineQueue();
    setSyncing(false);
    await loadQueue();
    Alert.alert(
      "Sync Complete",
      `Successfully sent ${syncedCount} message(s). ${failedCount > 0 ? `${failedCount} failed.` : ""}`
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Connection State Card */}
        <Text style={styles.sectionHeader}>CONNECTION STATE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.statusTitle}>Backend Server Status</Text>
              <Text style={styles.statusSub}>Django Daphne ASGI /ws/chat/</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: isOnline ? "#E8F3ED" : "#FADBD8" }]}>
              <Text style={[styles.badgeText, { color: isOnline ? "#236B4A" : "#C0392B" }]}>
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
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
              onValueChange={setAutoSync}
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
                  <Text style={styles.pendingText}>{item.state.toUpperCase()}</Text>
                </View>
              </View>
            )}
          />
        )}

        {queue.length > 0 && (
          <TouchableOpacity style={styles.syncBtn} onPress={handleManualSync} disabled={syncing}>
            {syncing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.syncBtnText}>Synchronize Outbox Now</Text>
            )}
          </TouchableOpacity>
        )}
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

