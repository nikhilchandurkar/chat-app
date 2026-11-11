import React, { useState, useEffect } from "react";
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile, updateProfile, changePassword } from "../api/auth";
import { resolveMediaUrl } from "../config";

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await getProfile();
      if (res.success && res.user) {
        setProfile(res.user);
        setName(res.user.name || "");
        setBio(res.user.bio || "");
      }
    } catch (e) {
      console.warn("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validation Error", "Display Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), bio: bio.trim() });
      Alert.alert("Success", "Profile updated successfully.");
      await loadProfile();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing Fields", "Please complete all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Weak Password", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Success", "Password updated successfully.");
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#236B4A" />
      </View>
    );
  }

  const joinedRaw = profile?.created_at || profile?.createdAt;
  const joinedLabel = joinedRaw ? new Date(joinedRaw).toLocaleDateString() : "—";
  const avatarUri = profile?.avatar?.url ? resolveMediaUrl(profile.avatar.url) : "";

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {(profile?.name || profile?.username || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={styles.emailText}>{profile?.email}</Text>
        <Text style={styles.usernameText}>@{profile?.username} • Joined {joinedLabel}</Text>

        <View style={styles.formSection}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.label}>About / Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell your contacts about yourself"
            placeholderTextColor="#94a3b8"
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabledButton]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.passwordSection}>
          <Text style={styles.sectionTitle}>Change Password</Text>

          <Text style={styles.label}>Current Password</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
          />

          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="At least 8 characters"
            placeholderTextColor="#94a3b8"
            secureTextEntry
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat new password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.secondaryButton, changingPassword && styles.disabledButton]}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator color="#236B4A" />
            ) : (
              <Text style={styles.secondaryButtonText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    alignItems: "center",
    padding: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 16,
    backgroundColor: "#E3E6E1",
  },
  avatarInitial: {
    fontSize: 36,
    color: "#ffffff",
    fontWeight: "bold",
  },
  emailText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#202421",
  },
  usernameText: {
    fontSize: 14,
    color: "#737A75",
    marginTop: 4,
  },
  formSection: {
    width: "100%",
    marginTop: 28,
  },
  passwordSection: {
    width: "100%",
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E3E6E1",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202421",
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#202421",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#F1F2EF",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#202421",
    marginBottom: 16,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#236B4A",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryButton: {
    backgroundColor: "#E8F3ED",
    borderWidth: 1,
    borderColor: "#236B4A",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  secondaryButtonText: {
    color: "#236B4A",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

