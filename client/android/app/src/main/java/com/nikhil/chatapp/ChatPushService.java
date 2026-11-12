package com.nikhil.chatapp;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Keeps a lightweight native WebSocket connection alive in the background so incoming
 * messages post real grouped Android Notification Drawer alerts even when the app is
 * minimized or on another screen, and auto-dismisses alerts when read/replied from PC.
 */
public class ChatPushService extends Service {

    public static final String PREFS_NAME = "chitchat_push_prefs";
    public static final String KEY_SERVER_URL = "server_url";
    public static final String KEY_TOKEN = "auth_token";
    public static final String KEY_USER_ID = "user_id";

    public static final String MESSAGE_CHANNEL_ID = "chitchat_messages";
    public static final String SERVICE_CHANNEL_ID = "chitchat_bg_sync";
    private static final int FOREGROUND_SERVICE_NOTIF_ID = 90010;
    private static final int FRIEND_REQUEST_NOTIF_ID = 90011;

    public static volatile boolean isUiInForeground = true;
    public static volatile String activeUiChatId = "";
    private static final ConcurrentHashMap<String, Integer> pendingCounts = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, ChatMeta> chatMetaMap = new ConcurrentHashMap<>();
    private static volatile boolean running = false;

    private OkHttpClient httpClient;
    private WebSocket webSocket;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable reconnectRunnable;
    private Runnable pingRunnable;
    private boolean manuallyStopped = false;
    private int reconnectDelayMs = 4000;

    private static class ChatMeta {
        final String name;
        final boolean groupChat;
        final boolean isMuted;

        ChatMeta(String name, boolean groupChat, boolean isMuted) {
            this.name = name != null ? name : "";
            this.groupChat = groupChat;
            this.isMuted = isMuted;
        }
    }

    public static boolean isServiceRunning() {
        return running;
    }

    public static int notifIdForChat(String chatId) {
        return ((chatId != null ? chatId.hashCode() : 1001) & 0x7ffffff) + 10000;
    }

    public static void clearChat(Context context, String chatId) {
        if (chatId == null || chatId.isEmpty() || context == null) return;
        pendingCounts.remove(chatId);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notifIdForChat(chatId));
        }
    }

    public static void clearAll(Context context) {
        pendingCounts.clear();
        chatMetaMap.clear();
        if (context == null) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancelAll();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        httpClient = new OkHttpClient.Builder()
            .pingInterval(25, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build();
        ensureChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        manuallyStopped = false;
        running = true;
        ensureChannels();

        Notification fgNotif = new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("ChitChat")
            .setContentText("Connected for real-time messages")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FOREGROUND_SERVICE_NOTIF_ID, fgNotif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(FOREGROUND_SERVICE_NOTIF_ID, fgNotif);
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String token = prefs.getString(KEY_TOKEN, "");
        if (token == null || token.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        connectWebSocket();
        fetchChatsMetadataAsync();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        manuallyStopped = true;
        running = false;
        stopTimers();
        if (webSocket != null) {
            try {
                webSocket.close(1000, "Service stopped");
            } catch (Exception ignored) {}
            webSocket = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(SERVICE_CHANNEL_ID) == null) {
            NotificationChannel bgChannel = new NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Background Connection",
                NotificationManager.IMPORTANCE_MIN
            );
            bgChannel.setDescription("Keeps ChitChat ready to show notifications");
            bgChannel.setShowBadge(false);
            bgChannel.setSound(null, null);
            bgChannel.enableVibration(false);
            nm.createNotificationChannel(bgChannel);
        }

        if (nm.getNotificationChannel(MESSAGE_CHANNEL_ID) == null) {
            NotificationChannel msgChannel = new NotificationChannel(
                MESSAGE_CHANNEL_ID,
                "Chat Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            msgChannel.setDescription("Incoming message alerts");
            msgChannel.enableVibration(true);
            msgChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(msgChannel);
        }
    }

    private void stopTimers() {
        if (reconnectRunnable != null) {
            mainHandler.removeCallbacks(reconnectRunnable);
            reconnectRunnable = null;
        }
        if (pingRunnable != null) {
            mainHandler.removeCallbacks(pingRunnable);
            pingRunnable = null;
        }
    }

    private synchronized void connectWebSocket() {
        if (manuallyStopped) return;
        if (webSocket != null) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String serverUrl = prefs.getString(KEY_SERVER_URL, "");
        String token = prefs.getString(KEY_TOKEN, "");
        if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
            return;
        }

        String wsBase = serverUrl.replaceFirst("^https://", "wss://").replaceFirst("^http://", "ws://");
        wsBase = wsBase.replaceAll("/+$", "");
        String wsUrl = wsBase + "/ws/chat/?token=" + Uri.encode(token);

        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                reconnectDelayMs = 4000;
                startPingLoop();
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                handleIncomingPacket(text);
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                ws.close(1000, null);
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                synchronized (ChatPushService.this) {
                    if (webSocket == ws) webSocket = null;
                }
                stopPingLoop();
                if (!manuallyStopped && code != 4001 && code != 1008) {
                    scheduleReconnect();
                }
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                synchronized (ChatPushService.this) {
                    if (webSocket == ws) webSocket = null;
                }
                stopPingLoop();
                if (!manuallyStopped) {
                    scheduleReconnect();
                }
            }
        });
    }

    private void startPingLoop() {
        stopPingLoop();
        pingRunnable = new Runnable() {
            @Override
            public void run() {
                WebSocket ws = webSocket;
                if (ws != null) {
                    try {
                        ws.send("{\"type\":\"ping\"}");
                    } catch (Exception ignored) {}
                    mainHandler.postDelayed(this, 25000);
                }
            }
        };
        mainHandler.postDelayed(pingRunnable, 25000);
    }

    private void stopPingLoop() {
        if (pingRunnable != null) {
            mainHandler.removeCallbacks(pingRunnable);
            pingRunnable = null;
        }
    }

    private void scheduleReconnect() {
        if (manuallyStopped) return;
        if (reconnectRunnable != null) {
            mainHandler.removeCallbacks(reconnectRunnable);
        }
        int delay = reconnectDelayMs;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
        reconnectRunnable = () -> connectWebSocket();
        mainHandler.postDelayed(reconnectRunnable, delay);
    }

    private void fetchChatsMetadataAsync() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String serverUrl = prefs.getString(KEY_SERVER_URL, "");
        String token = prefs.getString(KEY_TOKEN, "");
        if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) return;

        String url = serverUrl.replaceAll("/+$", "") + "/api/v1/chat/my";
        Request req = new Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer " + token)
            .build();
        httpClient.newCall(req).enqueue(new okhttp3.Callback() {
            @Override
            public void onFailure(okhttp3.Call call, java.io.IOException e) {
                // ignore transient network errors
            }

            @Override
            public void onResponse(okhttp3.Call call, Response response) {
                try (Response resp = response) {
                    if (!resp.isSuccessful() || resp.body() == null) return;
                    JSONObject root = new JSONObject(resp.body().string());
                    JSONArray chats = root.optJSONArray("chats");
                    if (chats == null) return;
                    for (int i = 0; i < chats.length(); i++) {
                        JSONObject c = chats.optJSONObject(i);
                        if (c == null) continue;
                        String cid = c.optString("_id", c.optString("id", ""));
                        if (cid.isEmpty()) continue;
                        chatMetaMap.put(
                            cid,
                            new ChatMeta(
                                c.optString("name", "ChitChat"),
                                c.optBoolean("groupChat", false),
                                c.optBoolean("isMuted", false)
                            )
                        );
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void handleIncomingPacket(String raw) {
        try {
            JSONObject packet = new JSONObject(raw);
            String event = packet.optString("event", packet.optString("type", ""));
            String legacy = packet.optString("legacy_event", "");
            JSONObject data = packet.optJSONObject("data");
            if (data == null) data = packet;

            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String myId = prefs.getString(KEY_USER_ID, "");

            if ("message.created".equals(event) || "NEW_MESSAGE".equals(event) || "NEW_MESSAGE".equals(legacy)) {
                String chatId = data.optString("chatId", data.optString("conversation_id", ""));
                if (chatId.isEmpty()) return;

                JSONObject msg = data.optJSONObject("message");
                JSONObject senderObj = msg != null ? msg.optJSONObject("sender") : null;
                String senderId = data.optString(
                    "sender_id",
                    senderObj != null ? senderObj.optString("_id", senderObj.optString("id", "")) : ""
                );

                // Message sent by our own account (e.g. from PC) -> clear pending alerts for this chat
                if (!myId.isEmpty() && myId.equals(senderId)) {
                    clearChat(this, chatId);
                    return;
                }

                // Do not pop notification drawer alert if user is currently looking at this chat in Android UI
                if (isUiInForeground && chatId.equals(activeUiChatId)) {
                    return;
                }

                ChatMeta meta = chatMetaMap.get(chatId);
                if (meta != null && meta.isMuted) {
                    return;
                }

                String senderName = data.optString(
                    "sender_name",
                    senderObj != null ? senderObj.optString("name", "ChitChat") : "ChitChat"
                );
                String rawContent = data.optString("content", msg != null ? msg.optString("content", "") : "");
                JSONArray attachments = data.optJSONArray("attachments");
                if ((attachments == null || attachments.length() == 0) && msg != null) {
                    attachments = msg.optJSONArray("attachments");
                }
                String preview;
                if (rawContent.startsWith("::e2ee:v1::")) {
                    preview = "🔒 Encrypted message";
                } else if (!rawContent.trim().isEmpty()) {
                    preview = rawContent;
                } else if (attachments != null && attachments.length() > 0) {
                    preview = "📎 Attachment";
                } else {
                    preview = "New message";
                }

                int nextCount = (pendingCounts.containsKey(chatId) ? pendingCounts.get(chatId) : 0) + 1;
                pendingCounts.put(chatId, nextCount);

                boolean isGroup = meta != null && meta.groupChat;
                String baseTitle = (meta != null && !meta.name.isEmpty()) ? meta.name : senderName;
                String title = nextCount > 1 ? baseTitle + " (" + nextCount + " new messages)" : baseTitle;
                String body = isGroup ? (senderName + ": " + preview) : preview;

                postMessageDrawerNotification(chatId, title, body, nextCount);
            } else if ("message.read".equals(event) || "MESSAGE_READ_UPDATE".equals(event) || "MESSAGE_READ_UPDATE".equals(legacy)) {
                String readBy = data.optString("readBy", "");
                String chatId = data.optString("chatId", data.optString("conversation_id", ""));
                if (!myId.isEmpty() && myId.equals(readBy) && !chatId.isEmpty()) {
                    clearChat(this, chatId);
                }
            } else if ("NEW_REQUEST".equals(event) || "NEW_REQUEST".equals(legacy)) {
                postGenericNotification(FRIEND_REQUEST_NOTIF_ID, "New Friend Request", "Someone sent you a friend request on ChitChat");
            } else if ("chat.created".equals(event) || "chat.member_updated".equals(event) || "REFETCH_CHATS".equals(event) || "REFETCH_CHATS".equals(legacy)) {
                fetchChatsMetadataAsync();
            }
        } catch (Exception ignored) {}
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void postMessageDrawerNotification(String chatId, String title, String body, int count) {
        if (!canPostNotifications()) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannels();

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("chatId", chatId);

        int notifId = notifIdForChat(chatId);
        PendingIntent pi = PendingIntent.getActivity(
            this,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setNumber(Math.max(1, count))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(count > 1)
            .setContentIntent(pi);

        nm.notify(notifId, builder.build());
    }

    private void postGenericNotification(int notifId, String title, String body) {
        if (!canPostNotifications()) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannels();

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(notifId, builder.build());
    }
}

