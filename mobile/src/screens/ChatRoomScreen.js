import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet, View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator,
  Alert, Modal
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { getMessages, sendMessage, deleteMessageForEveryone, deleteMessageForMe, reactToMessage, uploadAttachment } from "../api/chat";
import socket from "../api/socket";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";

export default function ChatRoomScreen({ route, navigation }) {
  const { chatId, chatName, isGroup } = route.params;

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const flatListRef = useRef();
  const typingTimeoutRef = useRef();
  const recordingTimerRef = useRef();

  useEffect(() => {
    // Load current user profile
    AsyncStorage.getItem(STORAGE_KEYS.USER).then((val) => {
      if (val) {
        try {
          const u = JSON.parse(val);
          setCurrentUserId(u.id || u._id);
        } catch (e) {}
      }
    });

    fetchChatMessages();

    // Socket Event Handlers
    const handleNewMessage = (data) => {
      const cId = data.chatId || data.conversation_id;
      if (cId === chatId) {
        const msg = data.message;
        setMessages((prev) => {
          // Deduplicate if already present from optimistic update
          if (prev.some((m) => (m._id || m.id) === (msg._id || msg.id))) {
            return prev;
          }
          return [msg, ...prev];
        });
      }
    };

    const handleMessageEdited = (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m._id || m.id) === data.messageId
            ? { ...m, content: data.content, isEdited: true }
            : m
        )
      );
    };

    const handleMessageDeleted = (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m._id || m.id) === data.messageId
            ? { ...m, content: "🚫 This message was deleted", isDeleted: true }
            : m
        )
      );
    };

    const handleTypingStarted = (data) => {
      if (data.chatId === chatId && data.userId !== currentUserId) {
        setIsTyping(true);
      }
    };

    const handleTypingStopped = (data) => {
      if (data.chatId === chatId) {
        setIsTyping(false);
      }
    };

    socket.on("message.created", handleNewMessage);
    socket.on("NEW_MESSAGE", handleNewMessage);
    socket.on("message.updated", handleMessageEdited);
    socket.on("MESSAGE_EDITED", handleMessageEdited);
    socket.on("message.deleted", handleMessageDeleted);
    socket.on("MESSAGE_DELETED", handleMessageDeleted);
    socket.on("typing.started", handleTypingStarted);
    socket.on("START_TYPING", handleTypingStarted);
    socket.on("typing.stopped", handleTypingStopped);
    socket.on("STOP_TYPING", handleTypingStopped);

    return () => {
      socket.off("message.created", handleNewMessage);
      socket.off("NEW_MESSAGE", handleNewMessage);
      socket.off("message.updated", handleMessageEdited);
      socket.off("MESSAGE_EDITED", handleMessageEdited);
      socket.off("message.deleted", handleMessageDeleted);
      socket.off("MESSAGE_DELETED", handleMessageDeleted);
      socket.off("typing.started", handleTypingStarted);
      socket.off("START_TYPING", handleTypingStarted);
      socket.off("typing.stopped", handleTypingStopped);
      socket.off("STOP_TYPING", handleTypingStopped);
    };
  }, [chatId, currentUserId]);

  const fetchChatMessages = async () => {
    try {
      const res = await getMessages(chatId, 1);
      if (res.success) {
        setMessages(res.messages || []);
      }
    } catch (e) {
      console.warn("Failed to load messages:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);

    // Typing notification throttle
    socket.emit("typing.start", { chatId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing.stop", { chatId });
    }, 2000);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText("");
    const clientMsgId = `mobile-${Date.now()}`;
    const optimisticMsg = {
      _id: clientMsgId,
      id: clientMsgId,
      content: text,
      sender: { _id: currentUserId },
      replyTo: replyingTo,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    setMessages((prev) => [optimisticMsg, ...prev]);
    setReplyingTo(null);

    try {
      await sendMessage(chatId, text, clientMsgId, replyingTo);
    } catch (err) {
      Alert.alert("Error", "Failed to deliver message.");
    }
  };

  // Image attachment
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Media library access is needed to attach photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      try {
        const uploadRes = await uploadAttachment(asset.uri, asset.mimeType || "image/jpeg", asset.fileName || "photo.jpg");
        if (uploadRes.success) {
          const att = [{
            url: uploadRes.file.url,
            thumbnail_url: uploadRes.file.thumbnail_url,
            name: uploadRes.file.file_name,
            size: uploadRes.file.file_size,
          }];
          await sendMessage(chatId, "Sent a photo", `media-${Date.now()}`, replyingTo, att, "image");
        }
      } catch (err) {
        Alert.alert("Upload Error", "Failed to upload photo attachment.");
      }
    }
  };

  // Voice Note Recording
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission", "Microphone access is required to record voice notes.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.warn("Failed to start voice recording:", err);
    }
  };

  const stopRecording = async (send = true) => {
    if (!recording) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (send && uri) {
        const uploadRes = await uploadAttachment(uri, "audio/m4a", `voice_${Date.now()}.m4a`);
        if (uploadRes.success) {
          const att = [{
            url: uploadRes.file.url,
            name: "Voice message",
            size: uploadRes.file.file_size,
            duration: recordingDuration,
          }];
          await sendMessage(chatId, "🎤 Voice Message", `voice-${Date.now()}`, replyingTo, att, "voice");
        }
      }
    } catch (err) {
      console.warn("Error finalizing voice note:", err);
    }
  };

  const handleDeleteMessage = async (forEveryone) => {
    setActionModalVisible(false);
    if (!selectedMessage) return;

    const msgId = selectedMessage._id || selectedMessage.id;
    try {
      if (forEveryone) {
        await deleteMessageForEveryone(msgId);
      } else {
        await deleteMessageForMe(msgId);
        setMessages((prev) => prev.filter((m) => (m._id || m.id) !== msgId));
      }
    } catch (e) {
      Alert.alert("Error", "Could not delete message.");
    }
  };

  const handleReact = async (emoji) => {
    setActionModalVisible(false);
    if (!selectedMessage) return;
    try {
      await reactToMessage(selectedMessage._id || selectedMessage.id, emoji);
    } catch (e) {}
  };

  const renderMessageBubble = ({ item }) => {
    const isMine =
      (item.sender?._id || item.sender?.id || item.sender) === currentUserId;

    return (
      <TouchableOpacity
        style={[
          styles.bubbleWrapper,
          isMine ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
        ]}
        onLongPress={() => {
          setSelectedMessage(item);
          setActionModalVisible(true);
        }}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleRight : styles.bubbleLeft,
            item.isDeleted && styles.bubbleDeleted,
          ]}
        >
          {/* Group member name if not mine */}
          {isGroup && !isMine && item.sender?.name ? (
            <Text style={styles.senderName}>{item.sender.name}</Text>
          ) : null}

          {/* Reply reference preview */}
          {item.replyTo && (
            <View style={styles.replyQuote}>
              <Text style={styles.replyQuoteText} numberOfLines={1}>
                {item.replyTo.content || "Quoted message"}
              </Text>
            </View>
          )}

          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextRight : styles.bubbleTextLeft]}>
            {item.content}
          </Text>

          {/* Reactions bar */}
          {item.reactions && item.reactions.length > 0 && (
            <View style={styles.reactionsBar}>
              {item.reactions.map((rx, i) => (
                <Text key={i} style={styles.reactionEmoji}>
                  {rx.reaction}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.timestampText}>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : ""}
            </Text>
            {isMine && (
              <Text style={styles.checkmarks}>
                {item.isOptimistic ? "🕒" : "✓✓"}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {chatName}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isTyping ? "typing..." : isGroup ? "Group conversation" : "Active now"}
          </Text>
        </View>
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#236B4A" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id || item.id || String(Math.random())}
          renderItem={renderMessageBubble}
          inverted
          contentContainerStyle={styles.messagesList}
        />
      )}

      {/* Reply Quote Banner */}
      {replyingTo && (
        <View style={styles.replyBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBannerTitle}>Replying to</Text>
            <Text style={styles.replyBannerSnippet} numberOfLines={1}>
              {replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Text style={styles.replyBannerClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Voice Recording Banner */}
      {isRecording && (
        <View style={styles.recordingBanner}>
          <Text style={styles.recordingIndicator}>🔴 Recording... {recordingDuration}s</Text>
          <TouchableOpacity onPress={() => stopRecording(false)}>
            <Text style={styles.recordingCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconButton} onPress={handlePickImage}>
            <Text style={styles.iconText}>📷</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
          />

          {inputText.trim() ? (
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text style={styles.sendButtonText}>➤</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive]}
              onPressIn={startRecording}
              onPressOut={() => stopRecording(true)}
            >
              <Text style={styles.micButtonText}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Message Action Sheet Modal */}
      <Modal visible={actionModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setActionModalVisible(false)}
        >
          <View style={styles.actionSheet}>
            {/* Quick Reactions */}
            <View style={styles.reactionsRow}>
              {["❤️", "👍", "😂", "🔥", "😮", "🙏"].map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)}>
                  <Text style={styles.reactionChoice}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => {
                setReplyingTo(selectedMessage);
                setActionModalVisible(false);
              }}
            >
              <Text style={styles.actionOptionText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => handleDeleteMessage(false)}
            >
              <Text style={styles.actionOptionText}>Delete for me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionOption, { borderBottomWidth: 0 }]}
              onPress={() => handleDeleteMessage(true)}
            >
              <Text style={[styles.actionOptionText, { color: "#ef4444" }]}>Delete for everyone</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: "#236B4A",
    fontWeight: "bold",
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#202421",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#27834A",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bubbleWrapper: {
    marginVertical: 4,
    flexDirection: "row",
  },
  bubbleWrapperLeft: {
    justifyContent: "flex-start",
  },
  bubbleWrapperRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 1,
  },
  bubbleLeft: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#E3E6E1",
    borderBottomLeftRadius: 3,
  },
  bubbleRight: {
    backgroundColor: "#E8F3ED",
    borderWidth: 1,
    borderColor: "#D0E4D8",
    borderBottomRightRadius: 3,
  },
  bubbleDeleted: {
    backgroundColor: "#F1F2EF",
  },
  senderName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#236B4A",
    marginBottom: 2,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: "#236B4A",
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyQuoteText: {
    fontSize: 12,
    color: "#737A75",
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextLeft: {
    color: "#202421",
  },
  bubbleTextRight: {
    color: "#202421",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
  },
  timestampText: {
    fontSize: 10,
    color: "#cbd5e1",
  },
  checkmarks: {
    fontSize: 10,
    color: "#cbd5e1",
    marginLeft: 4,
  },
  reactionsBar: {
    flexDirection: "row",
    marginTop: 4,
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 2,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  iconButton: {
    padding: 8,
  },
  iconText: {
    fontSize: 22,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    color: "#1e293b",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F1F2EF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  micButtonActive: {
    backgroundColor: "#FADBD8",
  },
  micButtonText: {
    fontSize: 18,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#236B4A",
  },
  replyBannerTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#236B4A",
  },
  replyBannerSnippet: {
    fontSize: 13,
    color: "#202421",
  },
  replyBannerClose: {
    fontSize: 16,
    color: "#236B4A",
    padding: 4,
  },
  recordingBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recordingIndicator: {
    color: "#ef4444",
    fontWeight: "bold",
  },
  recordingCancel: {
    color: "#64748b",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  reactionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  reactionChoice: {
    fontSize: 28,
  },
  actionOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  actionOptionText: {
    fontSize: 16,
    color: "#1e293b",
    textAlign: "center",
  },
});
