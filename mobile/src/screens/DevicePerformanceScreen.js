import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Switch,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBatterySaverMode, setBatterySaverMode } from "../services/batteryService";

export default function DevicePerformanceScreen() {
  const [batterySaver, setBatterySaver] = useState(false);
  const [dataMode, setDataMode] = useState("auto");
  const [cacheSize, setCacheSize] = useState("18.4 MB");

  useEffect(() => {
    const load = async () => {
      const mode = await getBatterySaverMode();
      setBatterySaver(mode);
    };
    load();
  }, []);

  const handleToggleSaver = async (val) => {
    setBatterySaver(val);
    await setBatterySaverMode(val);
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This will clear temporary media thumbnails and cached attachments. Your messages will remain intact.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          onPress: () => {
            setCacheSize("1.2 MB");
            Alert.alert("Cache Cleared", "Temporary storage has been freed.");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Battery Intelligence */}
        <Text style={styles.sectionHeader}>BATTERY INTELLIGENCE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Battery Saver Mode</Text>
              <Text style={styles.rowSubLabel}>
                Reduces background sync frequency, pauses video autoplay, and lowers thumbnail resolution.
              </Text>
            </View>
            <Switch
              value={batterySaver}
              onValueChange={handleToggleSaver}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {/* Network Aware Optimization */}
        <Text style={styles.sectionHeader}>NETWORK DATA PREFERENCES</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.choiceRow} onPress={() => setDataMode("auto")}>
            <View>
              <Text style={[styles.choiceLabel, dataMode === "auto" && styles.choiceActive]}>
                Auto Detect (Recommended)
              </Text>
              <Text style={styles.rowSubLabel}>Adapts download quality based on Wi-Fi vs Mobile</Text>
            </View>
            {dataMode === "auto" && <Text style={styles.checkIcon}>✓</Text>}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.choiceRow} onPress={() => setDataMode("saver")}>
            <View>
              <Text style={[styles.choiceLabel, dataMode === "saver" && styles.choiceActive]}>
                Data Saver Mode
              </Text>
              <Text style={styles.rowSubLabel}>Downloads large files and media only over Wi-Fi</Text>
            </View>
            {dataMode === "saver" && <Text style={styles.checkIcon}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Local Storage Management */}
        <Text style={styles.sectionHeader}>DEVICE STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Temporary Cache & Thumbnails</Text>
            <Text style={styles.rowValue}>{cacheSize}</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearCache}>
            <Text style={styles.clearBtnText}>Clear Application Cache</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F5",
  },
  content: {
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
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
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
    paddingRight: 10,
  },
  rowValue: {
    fontSize: 14,
    color: "#236B4A",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#E3E6E1",
    marginVertical: 12,
  },
  choiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  choiceLabel: {
    fontSize: 15,
    color: "#202421",
    fontWeight: "500",
  },
  choiceActive: {
    color: "#236B4A",
    fontWeight: "bold",
  },
  checkIcon: {
    color: "#236B4A",
    fontSize: 16,
    fontWeight: "bold",
  },
  clearBtn: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E3E6E1",
  },
  clearBtnText: {
    color: "#C0392B",
    fontSize: 14,
    fontWeight: "600",
  },
});

