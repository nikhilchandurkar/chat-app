package com.nikhil.chatapp;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "DeviceNotify",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class DeviceNotifyPlugin extends Plugin {

    private static final String CHANNEL_ID = "chitchat_messages";
    private static volatile DeviceNotifyPlugin activeInstance = null;
    private static volatile String pendingLaunchChatId = "";
    private static volatile String pendingSharedText = "";
    private static volatile String pendingSharedType = "";
    private static volatile String pendingSharedUri = "";

    public static void handleShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null && !sharedText.isEmpty()) {
                    pendingSharedText = sharedText;
                    pendingSharedType = "text";
                    DeviceNotifyPlugin inst = activeInstance;
                    if (inst != null) {
                        JSObject payload = new JSObject();
                        payload.put("type", "text");
                        payload.put("text", sharedText);
                        inst.notifyListeners("shareTargetReceived", payload);
                    }
                }
            } else if (type.startsWith("image/")) {
                Uri uri = null;
                try {
                    uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                } catch (Exception ignored) {}
                if (uri != null) {
                    String uriStr = uri.toString();
                    pendingSharedUri = uriStr;
                    pendingSharedType = "image";
                    DeviceNotifyPlugin inst = activeInstance;
                    if (inst != null) {
                        JSObject payload = new JSObject();
                        payload.put("type", "image");
                        payload.put("uri", uriStr);
                        inst.notifyListeners("shareTargetReceived", payload);
                    }
                }
            }
        }
    }

    public static void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String chatId = intent.getStringExtra("chatId");
        if (chatId != null && !chatId.isEmpty()) {
            pendingLaunchChatId = chatId;
            DeviceNotifyPlugin inst = activeInstance;
            if (inst != null) {
                JSObject payload = new JSObject();
                payload.put("chatId", chatId);
                inst.notifyListeners("notificationOpen", payload);
            }
        }
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Chat Messages",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Incoming message alerts");
                channel.enableVibration(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void load() {
        activeInstance = this;
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel(nm);
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void startBackgroundSync(PluginCall call) {
        String serverUrl = call.getString("serverUrl", "");
        String token = call.getString("token", "");
        String userId = call.getString("userId", "");
        if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            call.resolve(ret);
            return;
        }

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(ChatPushService.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(ChatPushService.KEY_SERVER_URL, serverUrl)
            .putString(ChatPushService.KEY_TOKEN, token)
            .putString(ChatPushService.KEY_USER_ID, userId != null ? userId : "")
            .apply();

        Intent serviceIntent = new Intent(ctx, ChatPushService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(serviceIntent);
        } else {
            ctx.startService(serviceIntent);
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopBackgroundSync(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(ChatPushService.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
        ctx.stopService(new Intent(ctx, ChatPushService.class));
        ChatPushService.clearAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void setActiveState(PluginCall call) {
        boolean inForeground = Boolean.TRUE.equals(call.getBoolean("inForeground", true));
        String activeChatId = call.getString("activeChatId", "");
        ChatPushService.isUiInForeground = inForeground;
        ChatPushService.activeUiChatId = activeChatId != null ? activeChatId : "";
        if (inForeground && activeChatId != null && !activeChatId.isEmpty()) {
            ChatPushService.clearChat(getContext(), activeChatId);
        }
        call.resolve();
    }

    @PluginMethod
    public void getLaunchChatId(PluginCall call) {
        String cid = pendingLaunchChatId != null ? pendingLaunchChatId : "";
        pendingLaunchChatId = "";
        JSObject ret = new JSObject();
        ret.put("chatId", cid);
        call.resolve(ret);
    }

    @PluginMethod
    public void getSharedData(PluginCall call) {
        String text = pendingSharedText != null ? pendingSharedText : "";
        String type = pendingSharedType != null ? pendingSharedType : "";
        String uri = pendingSharedUri != null ? pendingSharedUri : "";
        pendingSharedText = "";
        pendingSharedType = "";
        pendingSharedUri = "";
        JSObject ret = new JSObject();
        ret.put("type", type);
        ret.put("text", text);
        ret.put("uri", uri);
        call.resolve(ret);
    }

    @PluginMethod
    public void showMessageNotification(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("shown", false);
            call.resolve(ret);
            return;
        }

        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            JSObject ret = new JSObject();
            ret.put("shown", false);
            call.resolve(ret);
            return;
        }
        ensureChannel(nm);

        String chatId = call.getString("chatId", "general");
        String title = call.getString("title", "ChitChat");
        String body = call.getString("body", "New message");
        Integer countObj = call.getInt("count", 1);
        int count = countObj != null ? countObj : 1;

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (chatId != null) {
            openIntent.putExtra("chatId", chatId);
        }

        int notifId = ChatPushService.notifIdForChat(chatId);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            ctx,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Inline Notification Quick Reply
        Intent replyIntent = new Intent(ctx, NotificationReplyReceiver.class);
        replyIntent.setAction(NotificationReplyReceiver.ACTION_QUICK_REPLY);
        replyIntent.putExtra("chatId", chatId);
        replyIntent.putExtra("notifId", notifId);

        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
            ctx,
            notifId,
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0)
        );

        RemoteInput remoteInput = new RemoteInput.Builder(NotificationReplyReceiver.KEY_TEXT_REPLY)
            .setLabel("Reply...")
            .build();

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_send,
            "Reply",
            replyPendingIntent
        )
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
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
            .setContentIntent(pendingIntent)
            .addAction(replyAction);

        nm.notify(notifId, builder.build());

        JSObject ret = new JSObject();
        ret.put("shown", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelChatNotification(PluginCall call) {
        String chatId = call.getString("chatId", "");
        ChatPushService.clearChat(getContext(), chatId);
        call.resolve();
    }
}
