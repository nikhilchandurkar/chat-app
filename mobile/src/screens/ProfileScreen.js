import React, { useState, useEffect } from "react";
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert
} from "react-native";
import { getProfile } from "../api/auth";
import api from "../api/auth";

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await api.put("/user/profile", { name, bio });
      Alert.alert("Success", "Profile updated successfully.");
      loadProfile();
    } catch (err) {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setSaving(false);
    }
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
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>
            {(profile?.name || profile?.username || "?")[0].toUpperCase()}
          </Text>
        </View>

        <Text style={styles.emailText}>{profile?.email}</Text>
        <Text style={styles.usernameText}>@{profile?.username}</Text>

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
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

