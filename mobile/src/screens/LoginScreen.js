import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { loginWithPassword, requestOtp, verifyOtp } from "../api/auth";

export default function LoginScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState("password"); // 'password' or 'otp'
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async () => {
    if (!identifier || !password) {
      Alert.alert("Error", "Please enter username and password");
      return;
    }
    setLoading(true);
    try {
      const res = await loginWithPassword(identifier, password);
      onLoginSuccess(res.user);
    } catch (err) {
      Alert.alert("Login Failed", err.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!identifier.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address for OTP");
      return;
    }
    setLoading(true);
    try {
      await requestOtp(identifier);
      setOtpSent(true);
      Alert.alert("OTP Sent", "A 6-digit code has been sent to your email.");
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert("Error", "Please enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOtp(identifier, otp);
      onLoginSuccess(res.user);
    } catch (err) {
      Alert.alert("Verification Failed", err.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>💬 ChatApp</Text>
        <Text style={styles.subtitle}>
          {mode === "password" ? "Sign in to your account" : "Sign in with One-Time Password"}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={mode === "password" ? "Username or Email" : "Email address"}
          placeholderTextColor="#9ca3af"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType={mode === "otp" ? "email-address" : "default"}
        />

        {mode === "password" ? (
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        ) : (
          otpSent && (
            <TextInput
              style={styles.input}
              placeholder="6-digit verification code"
              placeholderTextColor="#9ca3af"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
          )
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={
            mode === "password"
              ? handlePasswordLogin
              : otpSent
              ? handleVerifyOtp
              : handleRequestOtp
          }
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "password"
                ? "Sign In"
                : otpSent
                ? "Verify & Continue"
                : "Send OTP Code"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleMode}
          onPress={() => {
            setMode(mode === "password" ? "otp" : "password");
            setOtpSent(false);
            setOtp("");
          }}
        >
          <Text style={styles.toggleText}>
            {mode === "password"
              ? "🔑 Use OTP Login instead"
              : "🔒 Use Password Login instead"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#4f46e5",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    height: 50,
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1f2937",
    marginBottom: 16,
    backgroundColor: "#f9fafb",
  },
  button: {
    height: 50,
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  toggleMode: {
    marginTop: 20,
    alignItems: "center",
  },
  toggleText: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "500",
  },
});

