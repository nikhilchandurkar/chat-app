import React, { useState, useEffect } from "react";
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, Modal, TextInput
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSessions, revokeSession, logout, checkServerReady } from "../api/auth";
import api from "../api/auth";
import socket from "../api/socket";
import {
  getApiBaseUrl,
  getWsBaseUrl,
  setCustomServerUrl,
  PROD_API_URL,
  DEV_DEFAULT_API_URL,
} from "../config";

export default function SettingsScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [storageUsed, setStorageUsed] = useState("0 MB");
  const [wsConnected, setWsConnected] = useState(socket.isConnected);
  const [activeServer, setActiveServer] = useState(getApiBaseUrl());

  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [serverInput, setServerInput] = useState(getApiBaseUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [serverStatusMsg, setServerStatusMsg] = useState("");

  useEffect(() => {
    loadSettings();
    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const sessRes = await getSessions();
      if (sessRes.success) {
        setSessions(sessRes.sessions || []);
      }
      const quotaRes = await api.get("/storage/quota");
      if (quotaRes.data && quotaRes.data.used_mb !== undefined) {
        setStorageUsed(`${quotaRes.data.used_mb} MB / ${quotaRes.data.quota_mb} MB`);
      }
    } catch (e) {
      console.warn("Settings error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestServer = async (targetUrl = serverInput) => {
    setTestingServer(true);
    setServerStatusMsg("");
    try {
      const data = await checkServerReady(targetUrl);
      setServerStatusMsg(`Online (${data?.status || "ready"})`);
    } catch (err) {
      setServerStatusMsg(`Unreachable: ${err?.message || "Connection failed"}`);
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveServer = async () => {
    try {
      const nextUrl = await setCustomServerUrl(serverInput);
      setActiveServer(nextUrl);
      socket.disconnect();
      socket.connect();
      setServerModalVisible(false);
      loadSettings();
      Alert.alert(
        "Server Updated",
        `App synced to ${nextUrl}. If switching between Production and Local servers, log out and sign back in for that server's database.`
      );
    } catch (err) {
      Alert.alert("Invalid URL", err?.message || "Use http:// or https://");
    }
  };

  const handleRevokeSession = (sessionId) => {
    Alert.alert("Revoke Session", "Log out this device remotely?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await revokeSession(sessionId);
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          } catch (e) {
            Alert.alert("Error", "Could not revoke session.");
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          socket.disconnect();
          await logout();
          navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#236B4A" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Server Connection & Sync */}
        <Text style={styles.sectionHeader}>SERVER CONNECTION & SYNC</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.navLabel} numberOfLines={1}>{activeServer}</Text>
              <Text style={styles.navSub} numberOfLines={1}>
                WS: {getWsBaseUrl()} ({wsConnected ? "Live" : "Reconnecting"})
              </Text>
            </View>
            <TouchableOpacity
              style={styles.configBtn}
              onPress={() => {
                setServerInput(getApiBaseUrl());
                setServerStatusMsg("");
                setServerModalVisible(true);
              }}
            >
              <Text style={styles.configBtnText}>Configure</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Preferences & Exclusive Features */}
        <Text style={styles.sectionHeader}>APP PREFERENCES & EXPERIENCE</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("Appearance")}
          >
            <View>
              <Text style={styles.navLabel}>Appearance & Experience</Text>
              <Text style={styles.navSub}>Theme, haptics, motion & shake gestures</Text>
            </View>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("DevicePerformance")}
          >
            <View>
              <Text style={styles.navLabel}>Device & Performance</Text>
              <Text style={styles.navSub}>Battery saver, cache cleanup & data mode</Text>
            </View>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("Connectivity")}
          >
            <View>
              <Text style={styles.navLabel}>Connectivity & Offline Queue</Text>
              <Text style={styles.navSub}>Status, offline message outbox & sync</Text>
            </View>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("NearbyChat")}
          >
            <View>
              <Text style={styles.navLabel}>Nearby Local Chat</Text>
              <Text style={styles.navSub}>Direct Wi-Fi Direct & Bluetooth communication</Text>
            </View>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {/* Storage Section */}
        <Text style={styles.sectionHeader}>STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Cloud Attachment Usage</Text>
            <Text style={styles.rowValue}>{storageUsed}</Text>
          </View>
        </View>

        {/* Security & Shared Sessions */}
        <Text style={styles.sectionHeader}>SECURITY & SHARED SESSIONS</Text>
        <View style={styles.card}>
          {sessions.map((sess) => (
            <View key={sess.id} style={styles.sessionItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceTitle}>
                  {sess.device_name || (sess.platform ? sess.platform.toUpperCase() : "DEVICE")} (v{sess.app_version})
                </Text>
                <Text style={styles.deviceMeta}>
                  {(sess.platform || "device").toUpperCase()} • {sess.ip_address || "Unknown IP"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.revokeButton}
                onPress={() => handleRevokeSession(sess.id)}
              >
                <Text style={styles.revokeButtonText}>Revoke</Text>
              </TouchableOpacity>
            </View>
          ))}
          {sessions.length === 0 && (
            <Text style={styles.noSessionsText}>No other active sessions.</Text>
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={serverModalVisible} transparent animationType="slide" onRequestClose={() => setServerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backend Server Sync URL</Text>
            <Text style={styles.modalSubtitle}>
              Default Production is {PROD_API_URL}. Switch to a local LAN IP for local testing.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="https://chat-nikkiii.duckdns.org"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setServerInput(PROD_API_URL)}
              >
                <Text style={styles.presetChipText}>Production</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setServerInput(DEV_DEFAULT_API_URL)}
              >
                <Text style={styles.presetChipText}>Emulator / Local</Text>
              </TouchableOpacity>
            </View>

            {serverStatusMsg ? (
              <Text
                style={[
                  styles.statusMsg,
                  serverStatusMsg.startsWith("Online") ? styles.statusMsgOk : styles.statusMsgErr,
                ]}
              >
                {serverStatusMsg}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => handleTestServer(serverInput)}
                disabled={testingServer}
              >
                <Text style={styles.modalBtnSecondaryText}>
                  {testingServer ? "Testing..." : "Test"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setServerModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveServer}>
                <Text style={styles.modalBtnPrimaryText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 15,
    color: "#1e293b",
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 14,
    color: "#737A75",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#202421",
  },
  navSub: {
    fontSize: 12,
    color: "#737A75",
    marginTop: 2,
  },
  navChevron: {
    fontSize: 20,
    color: "#737A75",
    fontWeight: "bold",
  },
  divider: {
    height: 1,
    backgroundColor: "#E3E6E1",
    marginVertical: 10,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  deviceTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
  },
  deviceMeta: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  revokeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#fee2e2",
  },
  revokeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
  noSessionsText: {
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 8,
    fontSize: 13,
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 32,
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  configBtn: {
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  configBtnText: {
    color: "#236B4A",
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(32, 36, 33, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#202421",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#737A75",
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: "#F1F2EF",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#202421",
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: "#F1F2EF",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  presetChipText: {
    fontSize: 12,
    color: "#202421",
    fontWeight: "600",
  },
  statusMsg: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  statusMsgOk: {
    color: "#236B4A",
  },
  statusMsgErr: {
    color: "#C0392B",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 6,
  },
  modalBtnSecondary: {
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalBtnSecondaryText: {
    color: "#236B4A",
    fontWeight: "700",
    fontSize: 13,
  },
  modalBtnCancel: {
    backgroundColor: "#F1F2EF",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalBtnCancelText: {
    color: "#202421",
    fontWeight: "600",
    fontSize: 13,
  },
  modalBtnPrimary: {
    backgroundColor: "#236B4A",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalBtnPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
});

