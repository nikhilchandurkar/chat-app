import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, View, Text, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Modal, Alert,
  SafeAreaView
} from "react-native";
import { getMyChats, searchUsers, createDirectChat, syncDelta } from "../api/chat";
import socket from "../api/socket";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";

export default function ChatListScreen({ navigation }) {
  const [chats, setChats] = useState([]);
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [foundUsers, setFoundUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const fetchChats = async () => {
    try {
      const res = await getMyChats();
      if (res.success) {
        setChats(res.chats || []);
        setFilteredChats(res.chats || []);
      }
    } catch (err) {
      console.warn("Error fetching chats:", err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChats();

    // Connect to WebSocket
    socket.connect();

    // Listen for incoming messages
    const handleNewMessage = (data) => {
      const chatId = data.chatId || data.conversation_id;
      const msg = data.message;
      setChats((prev) => {
        const next = prev.map((c) => {
          if (c._id === chatId || c.id === chatId) {
            return {
              ...c,
              lastMessage: msg?.content || "New message",
              lastMessageTime: msg?.createdAt || new Date().toISOString(),
              unreadCount: (c.unreadCount || 0) + 1,
            };
          }
          return c;
        });
        next.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
        return next;
      });
    };

    const handlePresence = (data) => {
      const list = data.online_users || data || [];
      if (Array.isArray(list)) {
        setOnlineUsers(new Set(list));
      }
    };

    socket.on("message.created", handleNewMessage);
    socket.on("NEW_MESSAGE", handleNewMessage);
    socket.on("ONLINE_USERS", handlePresence);
    socket.on("user.online", handlePresence);

    return () => {
      socket.off("message.created", handleNewMessage);
      socket.off("NEW_MESSAGE", handleNewMessage);
      socket.off("ONLINE_USERS", handlePresence);
      socket.off("user.online", handlePresence);
    };
  }, []);

  // Filter conversations
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChats(chats);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredChats(
        chats.filter((c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.lastMessage || "").toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, chats]);

  // Pull-to-refresh with cursor delta sync
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const cursor = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_CURSOR);
      const delta = await syncDelta(cursor || "");
      if (delta.next_cursor) {
        await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CURSOR, delta.next_cursor);
      }
      await fetchChats();
    } catch (e) {
      await fetchChats();
    }
  }, []);

  // Search users for new chat
  const handleUserSearch = async (text) => {
    setUserSearchQuery(text);
    if (!text.trim()) {
      setFoundUsers([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await searchUsers(text);
      if (res.success) {
        setFoundUsers(res.users || []);
      }
    } catch (e) {
      console.warn("User search error:", e);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleStartChat = async (user) => {
    try {
      const res = await createDirectChat(user._id || user.id);
      setNewChatModalVisible(false);
      setUserSearchQuery("");
      setFoundUsers([]);
      await fetchChats();
      navigation.navigate("ChatRoom", {
        chatId: res.chatId,
        chatName: user.name || user.username,
        isGroup: false,
      });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to start chat.");
    }
  };

  const renderChatItem = ({ item }) => {
    const isOtherOnline = !item.groupChat && item.members && item.members.some((m) => onlineUsers.has(m));

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() =>
          navigation.navigate("ChatRoom", {
            chatId: item._id || item.id,
            chatName: item.name,
            isGroup: item.groupChat,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {(item.name || "?")[0].toUpperCase()}
            </Text>
          </View>
          {isOtherOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.lastMessageTime ? (
              <Text style={styles.timeText}>
                {new Date(item.lastMessageTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            ) : null}
          </View>

          <View style={styles.chatSnippetRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage || "No messages yet"}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.headerButtonText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={styles.headerButtonText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Conversations List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#236B4A" />
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item._id || item.id}
          renderItem={renderChatItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#236B4A"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No conversations yet.</Text>
              <Text style={styles.emptySubText}>Tap + below to start a new chat!</Text>
            </View>
          }
        />
      )}

      {/* New Chat FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setNewChatModalVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* New Chat Modal */}
      <Modal visible={newChatModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <TouchableOpacity onPress={() => setNewChatModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search by name, username or email..."
              placeholderTextColor="#94a3b8"
              value={userSearchQuery}
              onChangeText={handleUserSearch}
              autoFocus
            />

            {searchingUsers ? (
              <ActivityIndicator style={{ marginTop: 20 }} color="#236B4A" />
            ) : (
              <FlatList
                data={foundUsers}
                keyExtractor={(item) => item._id || item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userSearchItem}
                    onPress={() => handleStartChat(item)}
                  >
                    <View style={styles.avatarPlaceholderSmall}>
                      <Text style={styles.avatarTextSmall}>
                        {(item.name || item.username)[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.userNameText}>{item.name}</Text>
                      <Text style={styles.userUsernameText}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  userSearchQuery.trim() ? (
                    <Text style={styles.noUsersText}>No users found.</Text>
                  ) : (
                    <Text style={styles.noUsersText}>Type a username or email to search.</Text>
                  )
                }
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  topBarTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    padding: 8,
    marginLeft: 6,
  },
  headerButtonText: {
    fontSize: 20,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  searchInput: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1e293b",
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  avatarContainer: {
    position: "relative",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
  },
  onlineBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#27834A",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  chatInfo: {
    flex: 1,
    marginLeft: 14,
  },
  chatHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#202421",
    flex: 1,
  },
  timeText: {
    fontSize: 12,
    color: "#737A75",
    marginLeft: 8,
  },
  chatSnippetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 14,
    color: "#737A75",
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: "#236B4A",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
  },
  emptySubText: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 6,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#236B4A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#202421",
  },
  modalCloseText: {
    fontSize: 16,
    color: "#236B4A",
    fontWeight: "600",
  },
  modalSearchInput: {
    backgroundColor: "#F1F2EF",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#202421",
    marginBottom: 14,
  },
  userSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E3E6E1",
  },
  avatarPlaceholderSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextSmall: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  userNameText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e293b",
  },
  userUsernameText: {
    fontSize: 13,
    color: "#64748b",
  },
  noUsersText: {
    textAlign: "center",
    color: "#94a3b8",
    marginTop: 30,
    fontSize: 14,
  },
});
