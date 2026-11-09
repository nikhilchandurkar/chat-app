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
import { getShakeConfig, saveShakeConfig } from "../services/shakeService";
import { isHapticsEnabled, setHapticsEnabled, triggerHaptic } from "../services/hapticsService";

export default function AppearanceScreen({ navigation }) {
  const [theme, setTheme] = useState("light");
  const [fontSize, setFontSize] = useState("medium");
  const [haptics, setHaptics] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [messageEffects, setMessageEffects] = useState(true);
  const [shakeConfig, setShakeConfig] = useState({
    enabled: false,
    action: "undo",
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem("chat_mobile_theme");
        if (storedTheme) setTheme(storedTheme);

        const storedHaptics = await isHapticsEnabled();
        setHaptics(storedHaptics);

        const storedShake = await getShakeConfig();
        setShakeConfig(storedShake);
      } catch {}
    };
    loadSettings();
  }, []);

  const handleToggleHaptics = async (val) => {
    setHaptics(val);
    await setHapticsEnabled(val);
    if (val) triggerHaptic("send");
  };

  const handleToggleShake = async (val) => {
    const updated = { ...shakeConfig, enabled: val };
    setShakeConfig(updated);
    await saveShakeConfig(updated);
  };

  const handleShakeActionChange = async (action) => {
    const updated = { ...shakeConfig, action };
    setShakeConfig(updated);
    await saveShakeConfig(updated);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Theme Mode */}
        <Text style={styles.sectionHeader}>THEME & PALETTE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Color Direction</Text>
            <Text style={styles.rowValue}>Forest Green & Charcoal</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Dark Theme</Text>
            <Switch
              value={theme === "dark"}
              onValueChange={(val) => {
                const newT = val ? "dark" : "light";
                setTheme(newT);
                AsyncStorage.setItem("chat_mobile_theme", newT);
              }}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {/* Sensory Feedback */}
        <Text style={styles.sectionHeader}>SENSORY & HAPTICS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Haptic Feedback</Text>
            <Switch
              value={haptics}
              onValueChange={handleToggleHaptics}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Message Effects</Text>
            <Switch
              value={messageEffects}
              onValueChange={setMessageEffects}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Reduced Motion</Text>
            <Switch
              value={reducedMotion}
              onValueChange={setReducedMotion}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>
        </View>

        {/* Shake-to-Action Feature */}
        <Text style={styles.sectionHeader}>SHAKE-TO-ACTION GESTURE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Enable Shake Gestures</Text>
              <Text style={styles.rowSubLabel}>Uses accelerometer to trigger quick actions</Text>
            </View>
            <Switch
              value={shakeConfig.enabled}
              onValueChange={handleToggleShake}
              trackColor={{ false: "#E3E6E1", true: "#236B4A" }}
            />
          </View>

          {shakeConfig.enabled && (
            <>
              <View style={styles.divider} />
              <Text style={[styles.rowLabel, { marginTop: 10, marginBottom: 8 }]}>Configured Action</Text>
              {["undo", "quick_actions", "refresh", "report"].map((act) => (
                <TouchableOpacity
                  key={act}
                  style={styles.actionChoice}
                  onPress={() => handleShakeActionChange(act)}
                >
                  <Text style={[styles.actionText, shakeConfig.action === act && styles.actionSelected]}>
                    {act === "undo" && "Shake to Undo (10s window)"}
                    {act === "quick_actions" && "Shake for Quick Actions Panel"}
                    {act === "refresh" && "Shake to Refresh Sync"}
                    {act === "report" && "Shake to Report an Issue"}
                  </Text>
                  {shakeConfig.action === act && <Text style={{ color: "#236B4A", fontWeight: "bold" }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </>
          )}
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
    paddingVertical: 4,
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
  rowValue: {
    fontSize: 14,
    color: "#236B4A",
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: "#E3E6E1",
    marginVertical: 12,
  },
  actionChoice: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F2EF",
  },
  actionText: {
    fontSize: 14,
    color: "#202421",
  },
  actionSelected: {
    color: "#236B4A",
    fontWeight: "bold",
  },
});

