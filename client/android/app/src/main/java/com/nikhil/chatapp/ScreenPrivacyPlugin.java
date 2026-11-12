package com.nikhil.chatapp;

import android.app.Activity;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenPrivacy")
public class ScreenPrivacyPlugin extends Plugin {

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            if (enabled) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            JSObject ret = new JSObject();
            ret.put("enabled", enabled);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            JSObject ret = new JSObject();
            ret.put("enabled", false);
            call.resolve(ret);
            return;
        }
        activity.runOnUiThread(() -> {
            int flags = activity.getWindow().getAttributes().flags;
            boolean secured = (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
            JSObject ret = new JSObject();
            ret.put("enabled", secured);
            call.resolve(ret);
        });
    }
}

