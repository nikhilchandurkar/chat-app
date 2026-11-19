package com.nikhil.chatapp;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import java.io.IOException;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

public class NotificationReplyReceiver extends BroadcastReceiver {

    public static final String ACTION_QUICK_REPLY = "com.nikhil.chatapp.ACTION_QUICK_REPLY";
    public static final String KEY_TEXT_REPLY = "key_text_reply";
    private static final OkHttpClient httpClient = new OkHttpClient();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_QUICK_REPLY.equals(intent.getAction())) {
            return;
        }

        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput == null) {
            return;
        }

        CharSequence replyCharSequence = remoteInput.getCharSequence(KEY_TEXT_REPLY);
        final String replyText = replyCharSequence != null ? replyCharSequence.toString().trim() : "";
        if (replyText.isEmpty()) {
            return;
        }

        final String chatId = intent.getStringExtra("chatId");
        final int notifId = intent.getIntExtra("notifId", 0);
        if (chatId == null || chatId.isEmpty()) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(ChatPushService.PREFS_NAME, Context.MODE_PRIVATE);
        String token = prefs.getString(ChatPushService.KEY_TOKEN, "");
        String serverUrl = prefs.getString(ChatPushService.KEY_SERVER_URL, "");

        if (token.isEmpty() || serverUrl.isEmpty()) {
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("chatId", chatId);
            json.put("content", replyText);

            MediaType jsonMediaType = MediaType.parse("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(json.toString(), jsonMediaType);

            String endpoint = serverUrl.replaceAll("/+$", "") + "/api/v1/message/send/";
            Request request = new Request.Builder()
                .url(endpoint)
                .addHeader("Authorization", "Bearer " + token)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build();

            final Context appContext = context.getApplicationContext();
            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    // Update notification to indicate failure
                    NotificationManager nm = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null && notifId != 0) {
                        NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext, "chitchat_messages")
                            .setSmallIcon(android.R.drawable.stat_notify_chat)
                            .setContentTitle("Failed to send reply")
                            .setContentText("Tap to open app and retry")
                            .setPriority(NotificationCompat.PRIORITY_LOW)
                            .setAutoCancel(true);
                        nm.notify(notifId, builder.build());
                    }
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    NotificationManager nm = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null && notifId != 0) {
                        if (response.isSuccessful()) {
                            // Briefly show sent state and then auto-cancel
                            NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext, "chitchat_messages")
                                .setSmallIcon(android.R.drawable.stat_notify_chat)
                                .setContentTitle("Replied")
                                .setContentText(replyText)
                                .setPriority(NotificationCompat.PRIORITY_LOW)
                                .setAutoCancel(true);
                            nm.notify(notifId, builder.build());
                            try {
                                Thread.sleep(1500);
                            } catch (InterruptedException ignored) {}
                            nm.cancel(notifId);
                        }
                    }
                    response.close();
                }
            });
        } catch (Exception ignored) {
        }
    }
}
