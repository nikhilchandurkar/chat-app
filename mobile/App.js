import React, { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

import { initServerConfig, STORAGE_KEYS } from "./src/config";
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

  useEffect(() => {
    const checkAuthAndInit = async () => {
      try {
        await initServerConfig();
        const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
        if (token) {
          registerForNativeFCM().catch(() => {});
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

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F7F5" }}>
          <ActivityIndicator size="large" color="#236B4A" />
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
