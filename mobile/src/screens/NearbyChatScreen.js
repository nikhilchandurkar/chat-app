import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Switch,
  TouchableOpacity,
  FlatList,
  TextInput,
  SafeAreaView,
  Alert,
} from "react-native";
import {
  getNearbyConfig,
  saveNearbyConfig,
  getNearbyMessages,
  saveNearbyMessage,
  reconcileNearbyWithServer,
} from "../services/nearbyService";

export default function NearbyChatScreen() {
  const [config, setConfig] = useState({
    enabled: false,
    discoverable: false,
    deviceName: "Android Device",
  });
  const [nearbyDevices, setNearbyDevices] = useState([]);
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const c = await getNearbyConfig();
    setConfig(c);
    const msgs = await getNearbyMessages();
    setMessages(msgs);
  };

  const handleToggleNearby = async (val) => {
    const updated = { ...config, enabled: val };
    setConfig(updated);
    await saveNearbyConfig(updated);
    if (val) {
      startDiscovery();
    } else {
      setNearbyDevices([]);
      setConnectedPeer(null);
    }
  };

  const startDiscovery = () => {
    setIsScanning(true);
    // Simulate discovering local BLE / Wi-Fi Direct devices
    setTimeout(() => {
      setNearbyDevices([
        { id: "peer-1", name: "Alice's Galaxy S24", transport: "Wi-Fi Direct", distance: "2m" },
        { id: "peer-2", name: "Bob's Pixel 8", transport: "Bluetooth LE", distance: "4m" },
      ]);
      setIsScanning(false);
    }, 1200);
  };

  const handleConnect = (peer) => {
    Alert.alert(
      "Nearby Connection Request",
      `Establish authenticated local connection with ${peer.name}? Messages will exchange directly via ${peer.transport}.`,
      [
        { text: "Decline", style: "cancel" },
        {
          text: "Accept & Pair",
          onPress: () => {
            setConnectedPeer(peer);
            Alert.alert("Connected", `Paired with ${peer.name} over ${peer.transport}.`);
          },
        },
      ]
    );
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const msg = {
      id: `nearby-${Date.now()}`,
      sender: "Me",
      content: inputText.trim(),
      peerName: connectedPeer?.name || "Local Peer",
    };
    await saveNearbyMessage(msg);
    setInputText("");
    const msgs = await getNearbyMessages();
    setMessages(msgs);
  };

  const handleReconcile = async () => {
    const { reconciledCount } = await reconcileNearbyWithServer();
    Alert.alert(
      "Sync Status",
      `Synchronized ${reconciledCount} nearby message(s) with your cloud account.`
    );
    loadSettings();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Toggle Card */}
        <Text style={styles.sectionHeader}>NEARBY COMMUNICATION (NO INTERNET)</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Enable Nearby Mode</Text>
              <Text style={styles.rowSubLabel}>Direct Wi-Fi Direct & Bluetooth communication</Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={handleToggleNearby}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {config.enabled && (
          <>
            {/* Nearby Discovered Peers */}
            <View style={styles.subHeaderRow}>
              <Text style={styles.sectionHeader}>NEARBY DEVICES ({nearbyDevices.length})</Text>
              <TouchableOpacity onPress={startDiscovery}>
                <Text style={styles.scanText}>{isScanning ? "Scanning..." : "Rescan"}</Text>
              </TouchableOpacity>
            </View>

            {nearbyDevices.length > 0 && !connectedPeer && (
              <View style={styles.card}>
                {nearbyDevices.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.deviceRow}
                    onPress={() => handleConnect(d)}
                  >
                    <View>
                      <Text style={styles.deviceName}>{d.name}</Text>
                      <Text style={styles.deviceTransport}>{d.transport} • ~{d.distance}</Text>
                    </View>
                    <View style={styles.connectBadge}>
                      <Text style={styles.connectBadgeText}>Connect</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {connectedPeer && (
              <View style={styles.connectedCard}>
                <Text style={styles.connectedTitle}>Active Direct Session</Text>
                <Text style={styles.connectedPeer}>{connectedPeer.name} ({connectedPeer.transport})</Text>
                <TouchableOpacity onPress={() => setConnectedPeer(null)}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Nearby Messages */}
            <View style={styles.subHeaderRow}>
              <Text style={styles.sectionHeader}>NEARBY CHAT HISTORY</Text>
              <TouchableOpacity onPress={handleReconcile}>
                <Text style={styles.reconcileText}>Sync to Cloud</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              renderItem={({ item }) => (
                <View style={styles.messageBubble}>
                  <Text style={styles.messageContent}>{item.content}</Text>
                  <View style={styles.messageMeta}>
                    <Text style={styles.metaText}>{item.sender} • Nearby</Text>
                    <Text style={[styles.metaText, { color: item.syncedWithServer ? "#27834A" : "#B7791F" }]}>
                      {item.syncedWithServer ? "Cloud Synced" : "Local Only"}
                    </Text>
                  </View>
                </View>
              )}
            />

            {/* Input Composer */}
            <View style={styles.composerRow}>
              <TextInput
                style={styles.input}
                placeholder="Send nearby message..."
                placeholderTextColor="#737A75"
                value={inputText}
                onChangeText={setInputText}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </>
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
    marginTop: 12,
    letterSpacing: 0.5,
  },
  subHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  scanText: {
    fontSize: 13,
    color: "#236B4A",
    fontWeight: "600",
  },
  reconcileText: {
    fontSize: 13,
    color: "#236B4A",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E3E6E1",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F2EF",
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#202421",
  },
  deviceTransport: {
    fontSize: 12,
    color: "#737A75",
    marginTop: 2,
  },
  connectBadge: {
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  connectBadgeText: {
    color: "#236B4A",
    fontSize: 12,
    fontWeight: "bold",
  },
  connectedCard: {
    backgroundColor: "#E8F3ED",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D0E4D8",
    marginTop: 8,
  },
  connectedTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#236B4A",
  },
  connectedPeer: {
    fontSize: 15,
    fontWeight: "600",
    color: "#202421",
    marginTop: 2,
  },
  disconnectText: {
    fontSize: 12,
    color: "#C0392B",
    marginTop: 6,
    fontWeight: "600",
  },
  messageBubble: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E3E6E1",
    marginBottom: 8,
  },
  messageContent: {
    fontSize: 14,
    color: "#202421",
  },
  messageMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
    color: "#737A75",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#202421",
  },
  sendBtn: {
    backgroundColor: "#236B4A",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginLeft: 8,
  },
  sendBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});

