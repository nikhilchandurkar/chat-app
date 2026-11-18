import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

import { initServerConfig, STORAGE_KEYS } from "./src/config";
import { isBiometricLockEnabled, promptBiometricAuth } from "./src/services/biometricService";
import LoginScreen from "./src/screens/LoginScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatRoomScreen from "./src/screens/ChatRoomScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AppearanceScreen from "./src/screens/AppearanceScreen";
import DevicePerformanceScreen from "./src/screens/DevicePerformanceScreen";
import ConnectivityScreen from "./src/screens/ConnectivityScreen";
import NearbyChatScreen from "./src/screens/NearbyChatScreen";
import { registerForNativeFCM } from "./src/services/notifications";

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);

  useEffect(() => {
    const checkAuthAndInit = async () => {
      try {
        await initServerConfig();
        const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
        if (token) {
          registerForNativeFCM().catch(() => {});
          const bioEnabled = await isBiometricLockEnabled();
          if (bioEnabled) {
            setIsBiometricLocked(true);
            const unlocked = await promptBiometricAuth("Unlock ChitChat with Fingerprint");
            if (unlocked) {
              setIsBiometricLocked(false);
            }
          }
          setInitialRoute("ChatList");
        } else {
          setInitialRoute("Login");
        }
      } catch (e) {
        setInitialRoute("Login");
      }
    };
    checkAuthAndInit();
  }, []);

  const handleRetryUnlock = async () => {
    const unlocked = await promptBiometricAuth("Unlock ChitChat with Fingerprint");
    if (unlocked) {
      setIsBiometricLocked(false);
    }
  };

  const handleFallbackLogout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    setIsBiometricLocked(false);
    setInitialRoute("Login");
  };

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#236B4A" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (isBiometricLocked) {
    return (
      <SafeAreaProvider>
        <View style={styles.lockContainer}>
          <StatusBar style="light" />
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={styles.lockTitle}>ChitChat Locked</Text>
          <Text style={styles.lockSubtitle}>
            Scan fingerprint or device biometrics to unlock
          </Text>

          <TouchableOpacity style={styles.unlockBtn} onPress={handleRetryUnlock}>
            <Text style={styles.unlockBtnText}>Unlock with Fingerprint</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutFallbackBtn} onPress={handleFallbackLogout}>
            <Text style={styles.logoutFallbackText}>Log in with Password Instead</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerStyle: { backgroundColor: "#FFFFFF", elevation: 1, shadowOpacity: 0.05 },
            headerTintColor: "#236B4A",
            headerTitleStyle: { fontWeight: "700", color: "#202421" },
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChatList"
            component={ChatListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChatRoom"
            component={ChatRoomScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: "Profile & Privacy" }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Application Settings" }}
          />
          <Stack.Screen
            name="Appearance"
            component={AppearanceScreen}
            options={{ title: "Appearance & Experience" }}
          />
          <Stack.Screen
            name="DevicePerformance"
            component={DevicePerformanceScreen}
            options={{ title: "Device & Performance" }}
          />
          <Stack.Screen
            name="Connectivity"
            component={ConnectivityScreen}
            options={{ title: "Connectivity & Outbox" }}
          />
          <Stack.Screen
            name="NearbyChat"
            component={NearbyChatScreen}
            options={{ title: "Nearby Direct Chat" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F7F5",
  },
  lockContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 28,
  },
  lockEmoji: {
    fontSize: 54,
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  lockSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 28,
  },
  unlockBtn: {
    backgroundColor: "#236B4A",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: "100%",
    maxWidth: 280,
    alignItems: "center",
    marginBottom: 16,
  },
  unlockBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  logoutFallbackBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  logoutFallbackText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
  },
});
