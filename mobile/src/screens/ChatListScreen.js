import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { getMyChats, logout } from "../api/auth";
import { getMyChats as fetchChats } from "../api/chat";
import { chatSocket } from "../api/socket";

export default function ChatListScreen({ navigation, onLogout }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const loadChats = async () => {
    try {
      const data = await fetchChats();
      setChats(data);
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadChats();
    chatSocket.connect();

    const unsubOnline = chatSocket.on("ONLINE_USERS", (users) => {
      setOnlineUsers(users || []);
    });

    const unsubRefetch = chatSocket.on("REFETCH_CHATS", () => {
      loadChats();
    });

    return () => {
      unsubOnline();
      unsubRefetch();
    };
  }, []);

  const renderChatItem = ({ item }) => {
    const isDirect = !item.groupChat;
    const isOnline = isDirect && item.members?.some((m) => onlineUsers.includes(m));

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => navigation.navigate("ChatRoom", { chat: item })}
      >
        <View style={styles.avatarContainer}>
          {item.avatar && item.avatar[0] ? (
            <Image source={{ uri: item.avatar[0] }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.name?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.chatDetails}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.groupChat && <Text style={styles.groupBadge}>Group</Text>}
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.groupChat
              ? `${item.members?.length || 0} members`
              : isOnline
              ? "🟢 Online"
              : "Offline"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Chats</Text>
        <TouchableOpacity
          onPress={async () => {
            await logout();
            chatSocket.disconnect();
            onLogout();
          }}
        >
          <Text style={styles.logoutBtn}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          renderItem={renderChatItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadChats(); }} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No conversations yet. Start chatting!</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  topTitle: { fontSize: 24, fontWeight: "bold", color: "#111827" },
  logoutBtn: { fontSize: 14, color: "#ef4444", fontWeight: "600" },
  chatCard: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
    alignItems: "center",
  },
  avatarContainer: { position: "relative" },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "bold", color: "#4f46e5" },
  onlineBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  chatDetails: { flex: 1, marginLeft: 16 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatName: { fontSize: 16, fontWeight: "600", color: "#1f2937", flex: 1 },
  groupBadge: {
    fontSize: 11,
    color: "#4f46e5",
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  lastMessage: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 60, fontSize: 15 },
});

