import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getMyChats,
  searchUsers,
  createDirectChat,
  createGroupChat,
  sendFriendRequest,
  getNotifications,
  acceptFriendRequest,
  getFriends,
  togglePinChat,
  toggleMuteChat,
  leaveGroup,
  deleteChat,
  syncDelta,
} from "../api/chat";
import socket from "../api/socket";
import { STORAGE_KEYS } from "../config";
import { syncOfflineQueue } from "../services/offlineQueueService";

export default function ChatListScreen({ navigation }) {
  const [chats, setChats] = useState([]);
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(socket.isConnected);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // New Chat / New Group Modal
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [modalTab, setModalTab] = useState("direct"); // "direct" | "group"
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [foundUsers, setFoundUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [friends, setFriends] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Notifications / Friend Requests Modal
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [requests, setRequests] = useState([]);

  const seenMsgIdsRef = useRef(new Set());

  const fetchChats = useCallback(async () => {
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
  }, []);

  const fetchNotificationsList = useCallback(async () => {
    try {
      const res = await getNotifications();
      if (res.success) {
        setRequests(res.allRequests || []);
      }
    } catch {}
  }, []);

  const performFullSync = useCallback(async () => {
    try {
      await syncOfflineQueue();
      const cursor = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_CURSOR);
      const delta = await syncDelta(cursor || "");
      if (delta.next_cursor) {
        await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CURSOR, delta.next_cursor);
      }
    } catch {}
    await fetchChats();
    await fetchNotificationsList();
  }, [fetchChats, fetchNotificationsList]);

  useEffect(() => {
    fetchChats();
    fetchNotificationsList();

    socket.connect();

    const handleConnect = () => {
      setWsConnected(true);
      performFullSync();
    };
    const handleDisconnect = () => setWsConnected(false);

    const handleNewMessage = (data) => {
      if (!data) return;
      const chatId = data.chatId || data.conversation_id;
      const msg = data.message || (data.message_id ? {
        _id: data.message_id,
        content: data.content,
        createdAt: data.timestamp,
      } : null);
      if (!chatId || !msg) return;

      const msgId = String(msg._id || msg.id || data.message_id || "");
      const alreadyCounted = msgId && seenMsgIdsRef.current.has(msgId);
      if (msgId) seenMsgIdsRef.current.add(msgId);

      setChats((prev) => {
        const exists = prev.some((c) => String(c._id || c.id) === String(chatId));
        if (!exists) {
          fetchChats();
          return prev;
        }
        const next = prev.map((c) => {
          if (String(c._id || c.id) === String(chatId)) {
            return {
              ...c,
              lastMessage: msg.content || "Attachment",
              lastMessageTime: msg.createdAt || new Date().toISOString(),
              unreadCount: alreadyCounted ? c.unreadCount : (c.unreadCount || 0) + 1,
            };
          }
          return c;
        });
        next.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
        return next;
      });
    };

    const handlePresence = (data) => {
      if (Array.isArray(data)) {
        setOnlineUsers(new Set(data.map(String)));
      } else if (data?.online_users && Array.isArray(data.online_users)) {
        setOnlineUsers(new Set(data.online_users.map(String)));
      } else if (data?.user_id) {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.status === "offline") next.delete(String(data.user_id));
          else next.add(String(data.user_id));
          return next;
        });
      }
    };

    const handleRefresh = () => fetchChats();

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("message.created", handleNewMessage);
    socket.on("NEW_MESSAGE", handleNewMessage);
    socket.on("ONLINE_USERS", handlePresence);
    socket.on("user.online", handlePresence);
    socket.on("user.offline", handlePresence);
    socket.on("REFETCH_CHATS", handleRefresh);
    socket.on("NEW_REQUEST", fetchNotificationsList);

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        socket.connect();
        performFullSync();
      }
    });

    return () => {
      appSub.remove();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("message.created", handleNewMessage);
      socket.off("NEW_MESSAGE", handleNewMessage);
      socket.off("ONLINE_USERS", handlePresence);
      socket.off("user.online", handlePresence);
      socket.off("user.offline", handlePresence);
      socket.off("REFETCH_CHATS", handleRefresh);
      socket.off("NEW_REQUEST", fetchNotificationsList);
    };
  }, [fetchChats, fetchNotificationsList, performFullSync]);

  // Reload chats cleanly whenever navigating back from ChatRoom
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      fetchChats();
      fetchNotificationsList();
    });
    return unsubscribe;
  }, [navigation, fetchChats, fetchNotificationsList]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChats(chats);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredChats(
        chats.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.lastMessage || "").toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, chats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await performFullSync();
  }, [performFullSync]);

  const openNewChatModal = async () => {
    setNewChatModalVisible(true);
    try {
      const res = await getFriends();
      if (res.success) setFriends(res.friends || []);
    } catch {}
  };

  const handleUserSearch = async (text) => {
    setUserSearchQuery(text);
    if (!text.trim()) {
      setFoundUsers([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await searchUsers(text);
      if (res.success) setFoundUsers(res.users || []);
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
      Alert.alert("Cannot Message User", err?.response?.data?.message || "Failed to start chat.");
    }
  };

  const handleSendFriendRequest = async (user) => {
    try {
      const res = await sendFriendRequest(user._id || user.id);
      Alert.alert("Request Sent", res?.message || `Friend request sent to ${user.name || user.username}.`);
    } catch (err) {
      Alert.alert("Notice", err?.response?.data?.message || "Could not send request.");
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Missing Name", "Please enter a group name.");
      return;
    }
    if (selectedMembers.length < 1) {
      Alert.alert("Select Members", "Please choose at least 1 friend to add.");
      return;
    }
    setCreatingGroup(true);
    try {
      const res = await createGroupChat(groupName.trim(), selectedMembers);
      setNewChatModalVisible(false);
      setGroupName("");
      setSelectedMembers([]);
      await fetchChats();
      navigation.navigate("ChatRoom", {
        chatId: res.chatId,
        chatName: groupName.trim(),
        isGroup: true,
      });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Could not create group.");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRequestAction = async (requestId, accept) => {
    try {
      const res = await acceptFriendRequest(requestId, accept);
      Alert.alert("Updated", res?.message || (accept ? "Request accepted" : "Request rejected"));
      await fetchNotificationsList();
      await fetchChats();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Action failed.");
    }
  };

  const handleChatLongPress = (item) => {
    const cId = item._id || item.id;
    Alert.alert(item.name || "Conversation", "Choose an action", [
      {
        text: item.isPinned ? "Unpin Chat" : "Pin Chat",
        onPress: async () => {
          try {
            await togglePinChat(cId);
            fetchChats();
          } catch {}
        },
      },
      {
        text: item.isMuted ? "Unmute" : "Mute",
        onPress: async () => {
          try {
            await toggleMuteChat(cId);
            fetchChats();
          } catch {}
        },
      },
      {
        text: item.groupChat ? "Leave Group" : "Delete Chat",
        style: "destructive",
        onPress: async () => {
          try {
            if (item.groupChat) await leaveGroup(cId);
            else await deleteChat(cId);
            fetchChats();
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.message || "Action failed.");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderChatItem = ({ item }) => {
    const isOtherOnline =
      !item.groupChat && item.members && item.members.some((m) => onlineUsers.has(String(m)));

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => {
          setChats((prev) =>
            prev.map((c) => (String(c._id || c.id) === String(item._id || item.id) ? { ...c, unreadCount: 0 } : c))
          );
          navigation.navigate("ChatRoom", {
            chatId: item._id || item.id,
            chatName: item.name,
            isGroup: item.groupChat,
          });
        }}
        onLongPress={() => handleChatLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{(item.name || "?")[0].toUpperCase()}</Text>
          </View>
          {isOtherOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.isPinned ? "📌 " : ""}
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
              {item.isMuted ? "🔇 " : ""}
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Messages</Text>
          <View style={styles.syncRow}>
            <View style={[styles.syncDot, { backgroundColor: wsConnected ? "#27834A" : "#D97706" }]} />
            <Text style={styles.syncLabel}>
              {wsConnected ? "Live Synced" : "Connecting..."}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              fetchNotificationsList();
              setNotifModalVisible(true);
            }}
          >
            <Text style={styles.headerButtonText}>🔔</Text>
            {requests.length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{requests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate("Settings")}>
            <Text style={styles.headerButtonText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate("Profile")}>
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
          keyExtractor={(item) => String(item._id || item.id)}
          renderItem={renderChatItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#236B4A"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No conversations yet.</Text>
              <Text style={styles.emptySubText}>Tap + below to search users or create a group!</Text>
            </View>
          }
        />
      )}

      {/* New Chat / Group FAB */}
      <TouchableOpacity style={styles.fab} onPress={openNewChatModal} activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* New Conversation / Group Modal */}
      <Modal visible={newChatModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start Messaging</Text>
              <TouchableOpacity onPress={() => setNewChatModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Mode Switcher */}
            <View style={styles.modalTabs}>
              <TouchableOpacity
                style={[styles.modalTab, modalTab === "direct" && styles.modalTabActive]}
                onPress={() => setModalTab("direct")}
              >
                <Text style={[styles.modalTabText, modalTab === "direct" && styles.modalTabTextActive]}>
                  Find User
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, modalTab === "group" && styles.modalTabActive]}
                onPress={() => setModalTab("group")}
              >
                <Text style={[styles.modalTabText, modalTab === "group" && styles.modalTabTextActive]}>
                  New Group
                </Text>
              </TouchableOpacity>
            </View>

            {modalTab === "direct" ? (
              <>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search by name or username..."
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
                    keyExtractor={(item) => String(item._id || item.id)}
                    renderItem={({ item }) => (
                      <View style={styles.userSearchItem}>
                        <View style={styles.avatarPlaceholderSmall}>
                          <Text style={styles.avatarTextSmall}>
                            {(item.name || item.username || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.userNameText}>{item.name || item.username}</Text>
                          <Text style={styles.userUsernameText}>@{item.username}</Text>
                        </View>
                        <TouchableOpacity style={styles.chatActionBtn} onPress={() => handleStartChat(item)}>
                          <Text style={styles.chatActionBtnText}>Chat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.reqActionBtn} onPress={() => handleSendFriendRequest(item)}>
                          <Text style={styles.reqActionBtnText}>+Friend</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    ListEmptyComponent={
                      userSearchQuery.trim() ? (
                        <Text style={styles.noUsersText}>No users found.</Text>
                      ) : (
                        <Text style={styles.noUsersText}>Type a name or username to search.</Text>
                      )
                    }
                  />
                )}
              </>
            ) : (
              <>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Group Name (e.g. Project Team)"
                  placeholderTextColor="#94a3b8"
                  value={groupName}
                  onChangeText={setGroupName}
                />
                <Text style={styles.groupMemberCount}>
                  Select Friends ({selectedMembers.length} selected)
                </Text>
                <FlatList
                  data={friends}
                  keyExtractor={(item) => String(item._id || item.id)}
                  renderItem={({ item }) => {
                    const uid = String(item._id || item.id);
                    const picked = selectedMembers.includes(uid);
                    return (
                      <TouchableOpacity
                        style={styles.userSearchItem}
                        onPress={() =>
                          setSelectedMembers((prev) =>
                            picked ? prev.filter((id) => id !== uid) : [...prev, uid]
                          )
                        }
                      >
                        <View style={styles.avatarPlaceholderSmall}>
                          <Text style={styles.avatarTextSmall}>
                            {(item.name || item.username || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.userNameText}>{item.name || item.username}</Text>
                          <Text style={styles.userUsernameText}>@{item.username}</Text>
                        </View>
                        <View style={[styles.checkCircle, picked && styles.checkCircleActive]}>
                          <Text style={{ color: picked ? "#fff" : "#737A75", fontWeight: "bold" }}>
                            {picked ? "✓" : "+"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={styles.noUsersText}>No friends yet. Start a direct chat first!</Text>
                  }
                />
                <TouchableOpacity
                  style={[styles.createGroupBtn, creatingGroup && { opacity: 0.6 }]}
                  onPress={handleCreateGroup}
                  disabled={creatingGroup}
                >
                  {creatingGroup ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.createGroupBtnText}>Create Group</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Friend Requests / Notifications Modal */}
      <Modal visible={notifModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Friend Requests ({requests.length})</Text>
              <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={requests}
              keyExtractor={(item) => String(item._id)}
              renderItem={({ item }) => (
                <View style={styles.userSearchItem}>
                  <View style={styles.avatarPlaceholderSmall}>
                    <Text style={styles.avatarTextSmall}>
                      {(item.sender?.name || item.sender?.username || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.userNameText}>{item.sender?.name || item.sender?.username}</Text>
                    <Text style={styles.userUsernameText}>@{item.sender?.username}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.chatActionBtn}
                    onPress={() => handleRequestAction(item._id, true)}
                  >
                    <Text style={styles.chatActionBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectActionBtn}
                    onPress={() => handleRequestAction(item._id, false)}
                  >
                    <Text style={styles.rejectActionBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.noUsersText}>No pending friend requests.</Text>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#E3E6E1",
  },
  topBarTitle: { fontSize: 22, fontWeight: "bold", color: "#202421" },
  syncRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  syncDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  syncLabel: { fontSize: 11, color: "#737A75", fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerButton: { padding: 8, marginLeft: 4, position: "relative" },
  headerButtonText: { fontSize: 20 },
  notifBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#C0392B",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#ffffff" },
  searchInput: {
    backgroundColor: "#F1F2EF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#202421",
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F2EF",
  },
  avatarContainer: { position: "relative" },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 19, fontWeight: "bold" },
  onlineBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#27834A",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  chatInfo: { flex: 1, marginLeft: 14 },
  chatHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  chatName: { fontSize: 16, fontWeight: "600", color: "#202421", flex: 1 },
  timeText: { fontSize: 12, color: "#737A75", marginLeft: 8 },
  chatSnippetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lastMessage: { fontSize: 14, color: "#737A75", flex: 1 },
  unreadBadge: { backgroundColor: "#236B4A", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  unreadText: { color: "#ffffff", fontSize: 11, fontWeight: "bold" },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 24 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#202421" },
  emptySubText: { fontSize: 14, color: "#737A75", marginTop: 6, textAlign: "center" },
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
    elevation: 6,
  },
  fabText: { color: "#ffffff", fontSize: 32, lineHeight: 34, fontWeight: "300" },
  modalOverlay: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#202421" },
  modalCloseText: { fontSize: 16, color: "#236B4A", fontWeight: "600" },
  modalTabs: {
    flexDirection: "row",
    backgroundColor: "#E3E6E1",
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  modalTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 8 },
  modalTabActive: { backgroundColor: "#FFFFFF" },
  modalTabText: { fontSize: 14, fontWeight: "600", color: "#737A75" },
  modalTabTextActive: { color: "#236B4A" },
  modalSearchInput: {
    backgroundColor: "#F1F2EF",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#202421",
    marginBottom: 12,
  },
  groupMemberCount: { fontSize: 13, fontWeight: "600", color: "#737A75", marginBottom: 8 },
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
  avatarTextSmall: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  userNameText: { fontSize: 15, fontWeight: "600", color: "#202421" },
  userUsernameText: { fontSize: 13, color: "#737A75" },
  chatActionBtn: {
    backgroundColor: "#236B4A",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  chatActionBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  reqActionBtn: {
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 6,
  },
  reqActionBtnText: { color: "#236B4A", fontSize: 12, fontWeight: "700" },
  rejectActionBtn: {
    backgroundColor: "#FADBD8",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 6,
  },
  rejectActionBtnText: { color: "#C0392B", fontSize: 12, fontWeight: "700" },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E3E6E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: { backgroundColor: "#236B4A", borderColor: "#236B4A" },
  createGroupBtn: {
    backgroundColor: "#236B4A",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  createGroupBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  noUsersText: { textAlign: "center", color: "#737A75", marginTop: 30, fontSize: 14 },
});
