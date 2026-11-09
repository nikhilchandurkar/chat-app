import React, { useState, useEffect } from "react";
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  SafeAreaView, Switch, Alert, ActivityIndicator
} from "react-native";
import { getSessions, revokeSession, logout } from "../api/auth";
import api from "../api/auth";

export default function SettingsScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [storageUsed, setStorageUsed] = useState("0 MB");

  useEffect(() => {
    loadSettings();
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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

        {/* Active Device Sessions */}
        <Text style={styles.sectionHeader}>ACTIVE DEVICES & SESSIONS</Text>
        <View style={styles.card}>
          {sessions.map((sess) => (
            <View key={sess.id} style={styles.sessionItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceTitle}>
                  {sess.platform ? sess.platform.toUpperCase() : "DEVICE"} (v{sess.app_version})
                </Text>
                <Text style={styles.deviceMeta}>
                  {sess.device_id} • {sess.ip_address || "Local IP"}
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
});

