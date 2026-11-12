package com.nikhil.chatapp;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenPrivacyPlugin.class);
        registerPlugin(AppLockPlugin.class);
        // Protect app switcher previews & block screenshots until user preference overrides
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        super.onCreate(savedInstanceState);
    }
}
