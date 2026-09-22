import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getChatMessages } from "../api/chat";
import { chatSocket } from "../api/socket";
import { STORAGE_KEYS } from "../config";

export default function ChatRoomScreen({ route, navigation }) {
  const { chat } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: chat.name });

    const init = async () => {
      const userStr = await AsyncStorage.getItem(STORAGE_KEYS.USER);
      if (userStr) {
        const u = JSON.parse(userStr);
        setCurrentUserId(u._id || u.id);
      }
      try {
        const data = await getChatMessages(chat._id, 1);
        setMessages(data.messages || []);
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setLoading(false);
      }
    };

    init();

    // Listen to real-time events
    const unsubMsg = chatSocket.on("NEW_MESSAGE", (payload) => {
      if (payload.chatId === chat._id && payload.message) {
        setMessages((prev) => [payload.message, ...prev]);
      }
    });

    const unsubTypingStart = chatSocket.on("START_TYPING", (payload) => {
      if (payload.chatId === chat._id) {
        setIsTyping(true);
      }
    });

    const unsubTypingStop = chatSocket.on("STOP_TYPING", (payload) => {
      if (payload.chatId === chat._id) {
        setIsTyping(false);
      }
    });

    return () => {
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
    };
  }, [chat._id]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    chatSocket.sendMessage(chat._id, trimmed, chat.members || []);
    setInputText("");
    chatSocket.stopTyping(chat._id, chat.members || []);
  };

  const handleTypingChange = (text) => {
    setInputText(text);

    chatSocket.startTyping(chat._id, chat.members || []);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      chatSocket.stopTyping(chat._id, chat.members || []);
    }, 2000);
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.sender?._id === currentUserId || item.sender === currentUserId;

    return (
      <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
        {!isMe && chat.groupChat && (
          <Text style={styles.senderName}>{item.sender?.name || "Member"}</Text>
        )}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      style={styles.container}
    >
      {loading ? (
        <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          inverted
          keyExtractor={(item) => item._id || Math.random().toString()}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageList}
        />
      )}

      {isTyping && (
        <Text style={styles.typingIndicator}>Someone is typing...</Text>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
          value={inputText}
          onChangeText={handleTypingChange}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
  messageBubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 4,
  },
  myBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#4f46e5",
    borderBottomRightRadius: 2,
  },
  theirBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  senderName: { fontSize: 11, fontWeight: "600", color: "#6b7280", marginBottom: 2 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: "#ffffff" },
  theirMessageText: { color: "#1f2937" },
  typingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    fontSize: 12,
    fontStyle: "italic",
    color: "#6b7280",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: "#1f2937",
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: "#4f46e5",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonText: { color: "#ffffff", fontWeight: "600", fontSize: 14 },
});

