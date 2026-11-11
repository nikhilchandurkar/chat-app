import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessageForEveryone,
  deleteMessageForMe,
  reactToMessage,
  uploadAttachment,
} from "../api/chat";
import socket from "../api/socket";
import { resolveMediaUrl, STORAGE_KEYS } from "../config";
import { enqueueMessage, syncOfflineQueue } from "../services/offlineQueueService";
import { triggerHaptic } from "../services/hapticsService";

const isImageAttachment = (att) => {
  const url = (att?.url || att?.path || "").toLowerCase();
  const mime = (att?.mime_type || att?.type || "").toLowerCase();
  return mime.startsWith("image") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(url);
};

const isAudioAttachment = (att) => {
  const url = (att?.url || att?.path || "").toLowerCase();
  const mime = (att?.mime_type || att?.type || "").toLowerCase();
  return mime.startsWith("audio") || mime === "voice" || /\.(m4a|mp3|wav|ogg|aac|webm)$/i.test(url);
};

export default function ChatRoomScreen({ route, navigation }) {
  const { chatId, chatName, isGroup } = route.params;

  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [inputText, setInputText] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isTyping, setIsTyping] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState(null);

  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const soundRef = useRef(null);

  const fetchChatMessages = useCallback(async (targetPage = 1) => {
    try {
      const res = await getMessages(chatId, targetPage);
      if (res.success) {
        setTotalPages(res.totalPages || 1);
        const incoming = res.messages || [];
        if (targetPage === 1) {
          setMessages(incoming);
        } else {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => String(m._id || m.id)));
            const unique = incoming.filter((m) => !seen.has(String(m._id || m.id)));
            return [...prev, ...unique];
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load messages:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [chatId]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.USER).then((val) => {
      if (val) {
        try {
          const u = JSON.parse(val);
          setCurrentUserId(String(u._id || u.id));
        } catch {}
      }
    });
    AsyncStorage.getItem(STORAGE_KEYS.TOKEN).then((t) => setAuthToken(t));

    fetchChatMessages(1);

    const handleNewMessage = (data) => {
      if (!data) return;
      const cId = String(data.chatId || data.conversation_id || "");
      if (cId !== String(chatId)) return;

      const msg = data.message;
      if (!msg || (!msg._id && !msg.id)) return;

      setMessages((prev) => {
        // Reconcile optimistic message by client_message_id or skip duplicates
        if (msg.client_message_id) {
          const optIdx = prev.findIndex(
            (m) => String(m._id || m.id) === String(msg.client_message_id)
          );
          if (optIdx !== -1) {
            const updated = [...prev];
            updated[optIdx] = { ...msg, isOptimistic: false };
            return updated;
          }
        }
        if (prev.some((m) => String(m._id || m.id) === String(msg._id || msg.id))) {
          return prev;
        }
        return [msg, ...prev];
      });

      const senderId = String(msg.sender?._id || msg.sender?.id || msg.sender || "");
      if (currentUserId && senderId !== currentUserId) {
        triggerHaptic("receive");
        socket.emit("message.read", { chatId, messageIds: [msg._id || msg.id] });
      }
    };

    const handleMessageEdited = (data) => {
      if (!data) return;
      const targetId = String(data.messageId || data.message_id || "");
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id || m.id) === targetId ? { ...m, content: data.content, isEdited: true } : m
        )
      );
    };

    const handleMessageDeleted = (data) => {
      if (!data) return;
      const targetId = String(data.messageId || data.message_id || "");
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id || m.id) === targetId
            ? { ...m, content: "🚫 This message was deleted", isDeleted: true, attachments: [] }
            : m
        )
      );
    };

    const handleMessageReacted = (data) => {
      if (!data) return;
      const cId = String(data.chatId || data.conversation_id || "");
      if (cId && cId !== String(chatId)) return;
      const targetId = String(data.messageId || data.message_id || "");
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id || m.id) === targetId ? { ...m, reactions: data.reactions || [] } : m
        )
      );
    };

    const handleTypingStarted = (data) => {
      if (String(data?.chatId) === String(chatId) && String(data?.userId) !== String(currentUserId)) {
        setIsTyping(true);
      }
    };

    const handleTypingStopped = (data) => {
      if (String(data?.chatId) === String(chatId)) {
        setIsTyping(false);
      }
    };

    const handleReconnect = async () => {
      await syncOfflineQueue();
      fetchChatMessages(1);
    };

    socket.on("connect", handleReconnect);
    socket.on("message.created", handleNewMessage);
    socket.on("NEW_MESSAGE", handleNewMessage);
    socket.on("message.updated", handleMessageEdited);
    socket.on("MESSAGE_EDITED", handleMessageEdited);
    socket.on("message.deleted", handleMessageDeleted);
    socket.on("MESSAGE_DELETED", handleMessageDeleted);
    socket.on("message.reaction", handleMessageReacted);
    socket.on("MESSAGE_REACTED", handleMessageReacted);
    socket.on("typing.started", handleTypingStarted);
    socket.on("START_TYPING", handleTypingStarted);
    socket.on("typing.stopped", handleTypingStopped);
    socket.on("STOP_TYPING", handleTypingStopped);

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      socket.off("connect", handleReconnect);
      socket.off("message.created", handleNewMessage);
      socket.off("NEW_MESSAGE", handleNewMessage);
      socket.off("message.updated", handleMessageEdited);
      socket.off("MESSAGE_EDITED", handleMessageEdited);
      socket.off("message.deleted", handleMessageDeleted);
      socket.off("MESSAGE_DELETED", handleMessageDeleted);
      socket.off("message.reaction", handleMessageReacted);
      socket.off("MESSAGE_REACTED", handleMessageReacted);
      socket.off("typing.started", handleTypingStarted);
      socket.off("START_TYPING", handleTypingStarted);
      socket.off("typing.stopped", handleTypingStopped);
      socket.off("STOP_TYPING", handleTypingStopped);
    };
  }, [chatId, currentUserId, fetchChatMessages]);

  // Emit read receipt when unread messages from others are loaded
  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => {
        const senderId = String(m.sender?._id || m.sender?.id || m.sender || "");
        const readBy = Array.isArray(m.readBy) ? m.readBy.map(String) : [];
        return senderId && senderId !== currentUserId && !m.isOptimistic && !readBy.includes(currentUserId);
      })
      .map((m) => m._id || m.id);
    if (unreadIds.length > 0) {
      socket.emit("message.read", { chatId, messageIds: unreadIds });
    }
  }, [messages, currentUserId, chatId]);

  const handleLoadOlder = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchChatMessages(nextPage);
  };

  const handleTextChange = (text) => {
    setInputText(text);
    socket.emit("typing.start", { chatId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing.stop", { chatId });
    }, 2000);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    if (editingMessage) {
      const targetId = editingMessage._id || editingMessage.id;
      setInputText("");
      setEditingMessage(null);
      try {
        await editMessage(targetId, text);
        setMessages((prev) =>
          prev.map((m) => (String(m._id || m.id) === String(targetId) ? { ...m, content: text, isEdited: true } : m))
        );
      } catch (err) {
        Alert.alert("Edit Failed", err?.response?.data?.message || "Could not edit message.");
      }
      return;
    }

    setInputText("");
    triggerHaptic("send");
    const clientMsgId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const replyPayload = replyingTo
      ? {
          _id: replyingTo._id || replyingTo.id,
          content: replyingTo.content,
          sender: replyingTo.sender,
        }
      : null;

    const optimisticMsg = {
      _id: clientMsgId,
      id: clientMsgId,
      client_message_id: clientMsgId,
      content: text,
      sender: { _id: currentUserId },
      replyTo: replyPayload,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    setMessages((prev) => [optimisticMsg, ...prev]);
    setReplyingTo(null);

    try {
      const res = await sendMessage(chatId, text, clientMsgId, replyPayload);
      if (res?.message) {
        setMessages((prev) =>
          prev.map((m) =>
            String(m._id || m.id) === clientMsgId ? { ...res.message, isOptimistic: false } : m
          )
        );
      }
    } catch (err) {
      if (!err?.response) {
        // Offline/network drop: persist in offline outbox queue for auto-sync
        await enqueueMessage({ chatId, content: text, attachments: [] });
        setMessages((prev) =>
          prev.map((m) =>
            String(m._id || m.id) === clientMsgId ? { ...m, isQueuedOffline: true, isOptimistic: false } : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== clientMsgId));
        Alert.alert("Error", err.response?.data?.message || "Failed to deliver message.");
      }
    }
  };

  const handleUploadAndSend = async (uri, mimeType, fileName, msgType, labelText) => {
    setUploading(true);
    try {
      const uploadRes = await uploadAttachment(uri, mimeType, fileName);
      if (uploadRes.success && uploadRes.file) {
        const att = [{
          url: uploadRes.file.url,
          thumbnail_url: uploadRes.file.thumbnail_url,
          name: uploadRes.file.file_name || fileName,
          size: uploadRes.file.file_size,
          type: msgType,
          mime_type: mimeType,
        }];
        const res = await sendMessage(
          chatId,
          labelText,
          `media-${Date.now()}`,
          replyingTo,
          att,
          msgType
        );
        setReplyingTo(null);
        if (res?.message) {
          setMessages((prev) => {
            if (prev.some((m) => String(m._id || m.id) === String(res.message._id))) return prev;
            return [res.message, ...prev];
          });
        }
      }
    } catch (err) {
      Alert.alert("Upload Error", err?.response?.data?.message || "Failed to upload attachment.");
    } finally {
      setUploading(false);
    }
  };

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

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await handleUploadAndSend(
        asset.uri,
        asset.mimeType || "image/jpeg",
        asset.fileName || `photo_${Date.now()}.jpg`,
        "image",
        "Sent a photo"
      );
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        await handleUploadAndSend(
          asset.uri,
          asset.mimeType || "application/octet-stream",
          asset.name || `file_${Date.now()}`,
          "document",
          asset.name || "Sent a file"
        );
      }
    } catch (e) {
      Alert.alert("Error", "Could not select file.");
    }
  };

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

      triggerHaptic("record_start");
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

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    triggerHaptic("record_stop");

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (send && uri && recordingDuration >= 1) {
        await handleUploadAndSend(
          uri,
          "audio/m4a",
          `voice_${Date.now()}.m4a`,
          "audio",
          `🎤 Voice Message (${recordingDuration}s)`
        );
      }
    } catch (err) {
      console.warn("Error finalizing voice note:", err);
    }
  };

  const handleTogglePlayAudio = async (audioUrl, key) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingAudioId === key) {
        setPlayingAudioId(null);
        return;
      }

      const fullUrl = resolveMediaUrl(audioUrl);
      const { sound } = await Audio.Sound.createAsync(
        {
          uri: fullUrl,
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingAudioId(key);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingAudioId(null);
        }
      });
    } catch (e) {
      setPlayingAudioId(null);
      Alert.alert("Playback Error", "Could not play audio attachment.");
    }
  };

  const handleDeleteMessage = async (forEveryone) => {
    setActionModalVisible(false);
    if (!selectedMessage) return;

    const msgId = selectedMessage._id || selectedMessage.id;
    try {
      if (forEveryone) {
        await deleteMessageForEveryone(msgId);
        setMessages((prev) =>
          prev.map((m) =>
            String(m._id || m.id) === String(msgId)
              ? { ...m, content: "🚫 This message was deleted", isDeleted: true, attachments: [] }
              : m
          )
        );
      } else {
        await deleteMessageForMe(msgId);
        setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(msgId)));
      }
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.message || "Could not delete message.");
    }
  };

  const handleReact = async (emoji) => {
    setActionModalVisible(false);
    if (!selectedMessage) return;
    const msgId = selectedMessage._id || selectedMessage.id;
    try {
      triggerHaptic("reaction");
      const res = await reactToMessage(msgId, emoji);
      if (res?.reactions) {
        setMessages((prev) =>
          prev.map((m) => (String(m._id || m.id) === String(msgId) ? { ...m, reactions: res.reactions } : m))
        );
      }
    } catch {}
  };

  const renderAttachments = (attachments = [], msgId) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;

    return attachments.map((att, idx) => {
      const rawUrl = typeof att === "string" ? att : att?.url || att?.path || "";
      if (!rawUrl) return null;
      const fullUrl = resolveMediaUrl(rawUrl);
      const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
      const fileName = att?.name || rawUrl.split("/").pop()?.split("?")[0] || "Attachment";

      if (isImageAttachment(att)) {
        return (
          <TouchableOpacity
            key={`${msgId}-img-${idx}`}
            onPress={() => setPreviewImageUrl(fullUrl)}
            style={{ marginTop: 6 }}
          >
            <Image
              source={{ uri: fullUrl, headers: authHeaders }}
              style={styles.attachmentImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        );
      }

      if (isAudioAttachment(att)) {
        const audioKey = `${msgId}-aud-${idx}`;
        const playing = playingAudioId === audioKey;
        return (
          <TouchableOpacity
            key={audioKey}
            style={styles.audioBubble}
            onPress={() => handleTogglePlayAudio(rawUrl, audioKey)}
          >
            <Text style={styles.audioIcon}>{playing ? "⏸" : "▶️"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.audioTitle} numberOfLines={1}>
                {playing ? "Playing voice note..." : fileName}
              </Text>
              {att?.duration ? <Text style={styles.audioSub}>{att.duration}s</Text> : null}
            </View>
          </TouchableOpacity>
        );
      }

      return (
        <TouchableOpacity
          key={`${msgId}-doc-${idx}`}
          style={styles.docCard}
          onPress={() => Linking.openURL(fullUrl).catch(() => {})}
        >
          <Text style={styles.docIcon}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.docName} numberOfLines={1}>{fileName}</Text>
            <Text style={styles.docSub}>Tap to open file</Text>
          </View>
        </TouchableOpacity>
      );
    });
  };

  const renderMessageBubble = ({ item }) => {
    const senderId = String(item.sender?._id || item.sender?.id || item.sender || "");
    const isMine = currentUserId && senderId === currentUserId;
    const msgId = String(item._id || item.id);

    return (
      <TouchableOpacity
        style={[styles.bubbleWrapper, isMine ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft]}
        onLongPress={() => {
          if (item.isDeleted) return;
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
          {isGroup && !isMine && item.sender?.name ? (
            <Text style={styles.senderName}>{item.sender.name}</Text>
          ) : null}

          {item.replyTo && (
            <View style={styles.replyQuote}>
              <Text style={styles.replyQuoteText} numberOfLines={1}>
                {item.replyTo.sender?.name ? `${item.replyTo.sender.name}: ` : ""}
                {item.replyTo.content || "Quoted message"}
              </Text>
            </View>
          )}

          {item.content ? (
            <Text style={[styles.bubbleText, isMine ? styles.bubbleTextRight : styles.bubbleTextLeft]}>
              {item.content}
            </Text>
          ) : null}

          {!item.isDeleted && renderAttachments(item.attachments, msgId)}

          {Array.isArray(item.reactions) && item.reactions.length > 0 && (
            <View style={styles.reactionsBar}>
              {item.reactions.map((rx, i) => (
                <Text key={i} style={styles.reactionEmoji}>
                  {typeof rx === "string" ? rx : rx.reaction || rx.emoji}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.metaRow}>
            {item.isEdited && !item.isDeleted && <Text style={styles.editedTag}>edited </Text>}
            <Text style={styles.timestampText}>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : ""}
            </Text>
            {isMine && (
              <Text style={styles.checkmarks}>
                {item.isQueuedOffline ? "⏳" : item.isOptimistic ? "🕒" : "✓✓"}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedIsMine =
    selectedMessage &&
    currentUserId &&
    String(selectedMessage.sender?._id || selectedMessage.sender?.id || selectedMessage.sender || "") ===
      currentUserId;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
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
            {isTyping ? "typing..." : isGroup ? "Group conversation" : "Encrypted Direct Chat"}
          </Text>
        </View>
      </View>

      {/* Messages + Composer */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#236B4A" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item._id || item.id)}
            renderItem={renderMessageBubble}
            inverted
            contentContainerStyle={styles.messagesList}
            onEndReached={handleLoadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator size="small" color="#236B4A" style={{ marginVertical: 10 }} /> : null
            }
          />
        )}

        {(replyingTo || editingMessage) && (
          <View style={styles.replyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBannerTitle}>
                {editingMessage ? "Editing message" : `Replying to ${replyingTo.sender?.name || "Message"}`}
              </Text>
              <Text style={styles.replyBannerSnippet} numberOfLines={1}>
                {(editingMessage || replyingTo).content}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setReplyingTo(null);
                setEditingMessage(null);
                if (editingMessage) setInputText("");
              }}
            >
              <Text style={styles.replyBannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {isRecording && (
          <View style={styles.recordingBanner}>
            <Text style={styles.recordingIndicator}>🔴 Recording voice note... {recordingDuration}s</Text>
            <TouchableOpacity onPress={() => stopRecording(false)}>
              <Text style={styles.recordingCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {uploading && (
          <View style={styles.uploadingBanner}>
            <ActivityIndicator size="small" color="#236B4A" />
            <Text style={styles.uploadingText}>Uploading attachment...</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconButton} onPress={handlePickImage} disabled={uploading}>
            <Text style={styles.iconText}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={handlePickDocument} disabled={uploading}>
            <Text style={styles.iconText}>📎</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            placeholderTextColor="#94a3b8"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
          />

          {inputText.trim() ? (
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text style={styles.sendButtonText}>{editingMessage ? "✓" : "➤"}</Text>
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
                setEditingMessage(null);
                setReplyingTo(selectedMessage);
                setActionModalVisible(false);
              }}
            >
              <Text style={styles.actionOptionText}>Reply</Text>
            </TouchableOpacity>

            {selectedIsMine && selectedMessage?.content ? (
              <TouchableOpacity
                style={styles.actionOption}
                onPress={() => {
                  setReplyingTo(null);
                  setEditingMessage(selectedMessage);
                  setInputText(selectedMessage.content || "");
                  setActionModalVisible(false);
                }}
              >
                <Text style={styles.actionOptionText}>Edit Message</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.actionOption} onPress={() => handleDeleteMessage(false)}>
              <Text style={styles.actionOptionText}>Delete for me</Text>
            </TouchableOpacity>

            {selectedIsMine && (
              <TouchableOpacity
                style={[styles.actionOption, { borderBottomWidth: 0 }]}
                onPress={() => handleDeleteMessage(true)}
              >
                <Text style={[styles.actionOptionText, { color: "#ef4444" }]}>Delete for everyone</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fullscreen Image Preview Modal */}
      <Modal visible={Boolean(previewImageUrl)} transparent animationType="fade">
        <TouchableOpacity
          style={styles.imageModalBackdrop}
          activeOpacity={1}
          onPress={() => setPreviewImageUrl(null)}
        >
          {previewImageUrl && (
            <Image
              source={{
                uri: previewImageUrl,
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
              }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.closePreviewText}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#E3E6E1",
  },
  backButton: { padding: 6, marginRight: 8 },
  backButtonText: { fontSize: 24, color: "#236B4A", fontWeight: "bold" },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "bold", color: "#202421" },
  headerSubtitle: { fontSize: 12, color: "#27834A" },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  messagesList: { paddingHorizontal: 14, paddingVertical: 12 },
  bubbleWrapper: { marginVertical: 4, flexDirection: "row" },
  bubbleWrapperLeft: { justifyContent: "flex-start" },
  bubbleWrapperRight: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, elevation: 1 },
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
  bubbleDeleted: { backgroundColor: "#F1F2EF" },
  senderName: { fontSize: 11, fontWeight: "bold", color: "#236B4A", marginBottom: 2 },
  replyQuote: { borderLeftWidth: 3, borderLeftColor: "#236B4A", paddingLeft: 8, marginBottom: 6 },
  replyQuoteText: { fontSize: 12, color: "#737A75" },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextLeft: { color: "#202421" },
  bubbleTextRight: { color: "#202421" },
  attachmentImage: { width: 210, height: 170, borderRadius: 8, backgroundColor: "#E3E6E1" },
  audioBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(35,107,74,0.08)",
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    minWidth: 180,
  },
  audioIcon: { fontSize: 18, marginRight: 8 },
  audioTitle: { fontSize: 13, fontWeight: "600", color: "#202421" },
  audioSub: { fontSize: 11, color: "#737A75" },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(35,107,74,0.08)",
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    minWidth: 190,
  },
  docIcon: { fontSize: 20, marginRight: 8 },
  docName: { fontSize: 13, fontWeight: "600", color: "#202421" },
  docSub: { fontSize: 11, color: "#236B4A" },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  editedTag: { fontSize: 10, color: "#737A75", fontStyle: "italic" },
  timestampText: { fontSize: 10, color: "#737A75" },
  checkmarks: { fontSize: 10, color: "#236B4A", marginLeft: 4, fontWeight: "600" },
  reactionsBar: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  reactionEmoji: { fontSize: 14, marginRight: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#E3E6E1",
  },
  iconButton: { padding: 6 },
  iconText: { fontSize: 20 },
  textInput: {
    flex: 1,
    backgroundColor: "#F1F2EF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    color: "#202421",
    marginHorizontal: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#236B4A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  sendButtonText: { color: "#ffffff", fontSize: 18, fontWeight: "bold" },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F1F2EF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  micButtonActive: { backgroundColor: "#FADBD8" },
  micButtonText: { fontSize: 18 },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F3ED",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#236B4A",
  },
  replyBannerTitle: { fontSize: 11, fontWeight: "bold", color: "#236B4A" },
  replyBannerSnippet: { fontSize: 13, color: "#202421" },
  replyBannerClose: { fontSize: 16, color: "#236B4A", padding: 4 },
  recordingBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recordingIndicator: { color: "#ef4444", fontWeight: "bold" },
  recordingCancel: { color: "#64748b" },
  uploadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F3ED",
    paddingVertical: 6,
    gap: 8,
  },
  uploadingText: { color: "#236B4A", fontSize: 12, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
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
    borderBottomColor: "#F1F2EF",
  },
  reactionChoice: { fontSize: 28 },
  actionOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F2EF" },
  actionOptionText: { fontSize: 16, color: "#202421", textAlign: "center", fontWeight: "500" },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  fullscreenImage: { width: "100%", height: "80%" },
  closePreviewText: { color: "#FFFFFF", marginTop: 12, fontSize: 13, opacity: 0.7 },
});
