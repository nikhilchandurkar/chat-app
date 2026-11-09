import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import {
  loginWithPassword,
  registerRequest,
  registerVerify,
  requestOtp,
  verifyOtp,
} from "../api/auth";
import { registerForNativeFCM } from "../services/notifications";

export default function LoginScreen({ navigation }) {
  // authMode: "login" | "register" | "otp"
  const [authMode, setAuthMode] = useState("login");

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regStep, setRegStep] = useState("details"); // "details" | "otp"

  // OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const digitRefs = useRef([]);

  useEffect(() => {
    let timer;
    if ((regStep === "otp" || authMode === "otp_verify") && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [regStep, authMode, countdown]);

  // 1. Password Login
  const handlePasswordLogin = async () => {
    const identifier = loginIdentifier.trim();
    if (!identifier) {
      Alert.alert("Missing Input", "Please enter your username or email address.");
      return;
    }
    if (!loginPassword) {
      Alert.alert("Missing Password", "Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      await loginWithPassword(identifier, loginPassword);
      registerForNativeFCM().catch(() => {});
      navigation.replace("ChatList");
    } catch (err) {
      Alert.alert(
        "Login Failed",
        err?.response?.data?.message || "Invalid username or password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // 2. Register Step 1: Send OTP
  const handleRegisterRequest = async () => {
    const username = regUsername.trim().toLowerCase();
    const email = regEmail.trim().toLowerCase();

    if (!username || username.length < 3) {
      Alert.alert("Invalid Username", "Username must be at least 3 characters.");
      return;
    }
    if (!email || !email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    if (!regPassword || regPassword.length < 8) {
      Alert.alert("Weak Password", "Password must be at least 8 characters long.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      Alert.alert("Password Mismatch", "Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      await registerRequest(username, email, regPassword, regConfirmPassword);
      setOtpEmail(email);
      setRegStep("otp");
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 200);
    } catch (err) {
      Alert.alert(
        "Registration Error",
        err?.response?.data?.message || "Failed to start registration. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // 3. Register Step 2: Verify OTP & Activate
  const handleRegisterVerify = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      Alert.alert("Incomplete Code", "Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      await registerVerify(regUsername, otpEmail, regPassword, code);
      registerForNativeFCM().catch(() => {});
      navigation.replace("ChatList");
    } catch (err) {
      Alert.alert(
        "Verification Failed",
        err?.response?.data?.message || "Invalid code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // 4. Passwordless OTP flow
  const handleSendOtp = async () => {
    const cleanEmail = otpEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await requestOtp(cleanEmail);
      setAuthMode("otp_verify");
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 200);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      Alert.alert("Incomplete Code", "Please enter all 6 digits.");
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(otpEmail, code);
      registerForNativeFCM().catch(() => {});
      navigation.replace("ChatList");
    } catch (err) {
      Alert.alert(
        "Verification Failed",
        err?.response?.data?.message || "Invalid code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index, val) => {
    const clean = val.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = clean ? clean.slice(-1) : "";
    setOtpDigits(newDigits);

    if (clean && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index, e) => {
    if (e.nativeEvent.key === "Backspace" && !otpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>C</Text>
            </View>
            <Text style={styles.appTitle}>ChitChat</Text>
            <Text style={styles.appSubtitle}>Secure Real-Time Messaging</Text>
          </View>

          {/* Mode Switcher Tabs */}
          {regStep !== "otp" && authMode !== "otp_verify" && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, authMode === "login" && styles.tabButtonActive]}
                onPress={() => setAuthMode("login")}
              >
                <Text style={[styles.tabButtonText, authMode === "login" && styles.tabButtonTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, authMode === "register" && styles.tabButtonActive]}
                onPress={() => setAuthMode("register")}
              >
                <Text style={[styles.tabButtonText, authMode === "register" && styles.tabButtonTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            {/* 1. PASSWORD SIGN IN */}
            {authMode === "login" && (
              <>
                <Text style={styles.inputLabel}>Username or Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. nikhil24 or name@example.com"
                  placeholderTextColor="#A6AEA8"
                  value={loginIdentifier}
                  onChangeText={setLoginIdentifier}
                  autoCapitalize="none"
                  editable={!loading}
                />

                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#A6AEA8"
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  secureTextEntry
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => {
                    setAuthMode("otp_email");
                    setOtpEmail("");
                  }}
                >
                  <Text style={styles.linkButtonText}>Sign in with Email OTP code instead</Text>
                </TouchableOpacity>
              </>
            )}

            {/* 2. REGISTRATION (STEP 1: DETAILS) */}
            {authMode === "register" && regStep === "details" && (
              <>
                <Text style={styles.inputLabel}>Choose Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. nikhil24"
                  placeholderTextColor="#A6AEA8"
                  value={regUsername}
                  onChangeText={(val) => setRegUsername(val.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  autoCapitalize="none"
                  editable={!loading}
                />

                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#A6AEA8"
                  value={regEmail}
                  onChangeText={setRegEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <Text style={styles.inputLabel}>Password (min 8 chars)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a strong password"
                  placeholderTextColor="#A6AEA8"
                  value={regPassword}
                  onChangeText={setRegPassword}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor="#A6AEA8"
                  value={regConfirmPassword}
                  onChangeText={setRegConfirmPassword}
                  secureTextEntry
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleRegisterRequest}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* 3. REGISTRATION (STEP 2: OTP VERIFICATION) */}
            {authMode === "register" && regStep === "otp" && (
              <>
                <Text style={styles.otpDescription}>
                  Enter the 6-digit verification code sent to{"\n"}
                  <Text style={styles.emailHighlight}>{otpEmail}</Text>
                </Text>

                <View style={styles.otpRow}>
                  {otpDigits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(el) => (digitRefs.current[idx] = el)}
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={(val) => handleDigitChange(idx, val)}
                      onKeyPress={(e) => handleKeyPress(idx, e)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textAlign="center"
                      editable={!loading}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleRegisterVerify}
                  disabled={loading || otpDigits.join("").length !== 6}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Create Account</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendContainer}>
                  {canResend ? (
                    <TouchableOpacity onPress={handleRegisterRequest}>
                      <Text style={styles.resendText}>Resend Code</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.countdownText}>Resend code in {countdown}s</Text>
                  )}
                  <TouchableOpacity onPress={() => setRegStep("details")}>
                    <Text style={styles.changeEmailText}>Edit Details</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* 4. PASSWORDLESS EMAIL OTP (STANDALONE) */}
            {authMode === "otp_email" && (
              <>
                <Text style={styles.inputLabel}>Enter Email for Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#A6AEA8"
                  value={otpEmail}
                  onChangeText={setOtpEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleSendOtp}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Sign In Code</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={() => setAuthMode("login")}>
                  <Text style={styles.linkButtonText}>Back to Password Sign In</Text>
                </TouchableOpacity>
              </>
            )}

            {/* 5. PASSWORDLESS OTP VERIFY */}
            {authMode === "otp_verify" && (
              <>
                <Text style={styles.otpDescription}>
                  Enter the 6-digit code sent to{"\n"}
                  <Text style={styles.emailHighlight}>{otpEmail}</Text>
                </Text>

                <View style={styles.otpRow}>
                  {otpDigits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(el) => (digitRefs.current[idx] = el)}
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={(val) => handleDigitChange(idx, val)}
                      onKeyPress={(e) => handleKeyPress(idx, e)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textAlign="center"
                      editable={!loading}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleVerifyOtp}
                  disabled={loading || otpDigits.join("").length !== 6}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Sign In</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendContainer}>
                  {canResend ? (
                    <TouchableOpacity onPress={handleSendOtp}>
                      <Text style={styles.resendText}>Resend Code</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.countdownText}>Resend code in {countdown}s</Text>
                  )}
                  <TouchableOpacity onPress={() => setAuthMode("login")}>
                    <Text style={styles.changeEmailText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F5",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logoBadgeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  appTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#202421",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 14,
    color: "#737A75",
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#E3E6E1",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#737A75",
  },
  tabButtonTextActive: {
    color: "#236B4A",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E3E6E1",
    shadowColor: "#202421",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#202421",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#F1F2EF",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#202421",
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: "#236B4A",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  linkButton: {
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 4,
  },
  linkButtonText: {
    fontSize: 13,
    color: "#236B4A",
    fontWeight: "600",
  },
  otpDescription: {
    fontSize: 14,
    color: "#737A75",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  emailHighlight: {
    color: "#236B4A",
    fontWeight: "700",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E3E6E1",
    backgroundColor: "#F1F2EF",
    fontSize: 22,
    fontWeight: "700",
    color: "#202421",
  },
  otpBoxFilled: {
    borderColor: "#236B4A",
    backgroundColor: "#FFFFFF",
  },
  resendContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  resendText: {
    color: "#236B4A",
    fontWeight: "700",
    fontSize: 13,
  },
  countdownText: {
    color: "#737A75",
    fontSize: 13,
  },
  changeEmailText: {
    color: "#737A75",
    fontSize: 13,
  },
});
