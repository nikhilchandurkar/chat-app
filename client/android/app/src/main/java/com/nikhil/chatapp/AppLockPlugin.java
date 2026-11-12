package com.nikhil.chatapp;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    @PluginMethod
    public void isDeviceSecure(PluginCall call) {
        KeyguardManager km = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        boolean secure = km != null && km.isDeviceSecure();
        JSObject ret = new JSObject();
        ret.put("secure", secure);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        KeyguardManager km = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (km == null || !km.isDeviceSecure()) {
            JSObject ret = new JSObject();
            ret.put("unlocked", false);
            ret.put("reason", "Device credential not configured");
            call.resolve(ret);
            return;
        }

        String title = call.getString("title", "Unlock ChitChat");
        String subtitle = call.getString("subtitle", "Verify fingerprint, face, or device PIN");
        @SuppressWarnings("deprecation")
        Intent intent = km.createConfirmDeviceCredentialIntent(title, subtitle);
        if (intent == null) {
            JSObject ret = new JSObject();
            ret.put("unlocked", false);
            call.resolve(ret);
            return;
        }
        startActivityForResult(call, intent, "handleCredentialResult");
    }

    @ActivityCallback
    private void handleCredentialResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject ret = new JSObject();
        ret.put("unlocked", result != null && result.getResultCode() == Activity.RESULT_OK);
        call.resolve(ret);
    }
}

