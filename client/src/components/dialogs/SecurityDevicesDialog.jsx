import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  AddToHomeScreen as LinkDeviceIcon,
  Close as CloseIcon,
  Computer as WebIcon,
  ContentCopy as CopyIcon,
  DeleteOutline as RevokeIcon,
  Devices as DevicesIcon,
  Key as KeyIcon,
  Lock as LockIcon,
  Logout as LogoutIcon,
  PhoneAndroid as AndroidIcon,
  Refresh as RotateIcon,
  Security as SecurityIcon,
  Shield as ShieldIcon,
  VerifiedUser as VerifiedIcon,
  Visibility as RevealIcon,
  VisibilityOff as HideIcon,
} from "@mui/icons-material";
import axios from "axios";
import jsQR from "jsqr";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { server } from "../../constants/config";
import { userExists } from "../../redux/reducers/auth";
import { usePublishE2eeKeyMutation } from "../../redux/api/api";
import {
  ensureLocalIdentityKeyPair,
  exportEncryptedKeyBackup,
  getStoredKeyPair,
  importEncryptedKeyBackup,
  rotateLocalIdentityKeyPair,
} from "../../utils/e2ee";

const SecurityDevicesDialog = ({ open, onClose, initialTab = 0 }) => {
  const dispatch = useDispatch();
  // 0 = Shared Sessions, 1 = Two-Factor Auth, 2 = E2EE Encryption Keys
  const [tab, setTab] = useState(initialTab > 2 ? 2 : initialTab);
  const [publishE2eeKey] = usePublishE2eeKeyMutation();
  const [e2eeKeyPair, setE2eeKeyPair] = useState(getStoredKeyPair);
  const [e2eeBusy, setE2eeBusy] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupText, setBackupText] = useState("");

  // Shared Sessions state
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [maxDevices, setMaxDevices] = useState(3);

  // Companion device camera scanner state (hosted inside Shared Sessions tab)
  const [linkScannerOpen, setLinkScannerOpen] = useState(false);
  const [pairingApproving, setPairingApproving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const approvingLockRef = useRef(false);

  // MFA state (no plaintext TOTP secret displayed on UI)
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaStatus, setMfaStatus] = useState({ mfa_enabled: false, backup_codes_remaining: 0 });
  const [mfaPairingDataUrl, setMfaPairingDataUrl] = useState("");
  const [hasPendingSetup, setHasPendingSetup] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [revealBackupCodes, setRevealBackupCodes] = useState(false);
  const [disablePwd, setDisablePwd] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");

  useEffect(() => {
    if (open) {
      setTab(initialTab > 1 ? 1 : initialTab);
      setLinkScannerOpen(false);
    }
  }, [open, initialTab]);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!open || tab !== 0 || !linkScannerOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, tab, linkScannerOpen, stopCamera]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await axios.get(`${server}/api/v1/auth/sessions`, { withCredentials: true });
      setSessions(data.sessions || []);
      setMaxDevices(data.max_devices || 3);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load shared sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const fetchMfaStatus = useCallback(async () => {
    setMfaLoading(true);
    try {
      const { data } = await axios.get(`${server}/api/v1/auth/mfa/status`, { withCredentials: true });
      setMfaStatus(data);
    } catch {
      // Ignore quietly
    } finally {
      setMfaLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await axios.get(`${server}/api/v1/user/me`, { withCredentials: true });
      if (data?.user) dispatch(userExists(data.user));
    } catch {
      // ignore
    }
  }, [dispatch]);

  useEffect(() => {
    if (open) {
      fetchSessions();
      fetchMfaStatus();
    }
  }, [open, fetchSessions, fetchMfaStatus]);

  const handleRevokeSession = async (sessionId) => {
    try {
      await axios.delete(`${server}/api/v1/auth/sessions/${sessionId}`, { withCredentials: true });
      toast.success("Device session revoked");
      fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to revoke session");
    }
  };

  const handleRevokeOthers = async () => {
    try {
      const { data } = await axios.post(`${server}/api/v1/auth/sessions/revoke-others`, {}, { withCredentials: true });
      toast.success(data.message || "Signed out of all other devices");
      fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to revoke other devices");
    }
  };

  const approvePairingPayload = useCallback(
    async (rawPayload) => {
      const clean = (rawPayload || "").trim();
      if (!clean || approvingLockRef.current) return;
      approvingLockRef.current = true;
      setPairingApproving(true);
      try {
        const { data } = await axios.post(
          `${server}/api/v1/auth/qr/approve`,
          { qr_token: clean },
          { withCredentials: true }
        );
        toast.success(data.message || "Companion device authorized!");
        stopCamera();
        setLinkScannerOpen(false);
        setTimeout(fetchSessions, 1200);
      } catch (err) {
        const code = err?.response?.data?.code;
        if (code === "DEVICE_LIMIT_REACHED") {
          toast.error(err?.response?.data?.message || "Device limit reached. Revoke an old session first.");
          stopCamera();
          setLinkScannerOpen(false);
        } else {
          toast.error(err?.response?.data?.message || "Could not authorize pairing code");
        }
      } finally {
        setPairingApproving(false);
        setTimeout(() => {
          approvingLockRef.current = false;
        }, 1200);
      }
    },
    [fetchSessions, stopCamera]
  );

  const startCameraScanner = async () => {
    setCameraError("");
    setLinkScannerOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is unavailable on this browser/device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      const nativeDetector =
        typeof window.BarcodeDetector === "function"
          ? new window.BarcodeDetector({ formats: ["qr_code"] })
          : null;

      scanTimerRef.current = setInterval(async () => {
        const videoEl = videoRef.current;
        if (!videoEl || videoEl.readyState < 2 || approvingLockRef.current) return;

        // 1. Native BarcodeDetector fast path when supported
        if (nativeDetector) {
          try {
            const codes = await nativeDetector.detect(videoEl);
            if (codes?.length > 0 && codes[0].rawValue) {
              approvePairingPayload(codes[0].rawValue);
              return;
            }
          } catch {
            // Fall through to pure-JS frame decoding
          }
        }

        // 2. Cross-platform canvas decoding (works inside Android WebView & all browsers)
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        if (!w || !h) return;
        const canvas = canvasRef.current || document.createElement("canvas");
        canvasRef.current = canvas;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(videoEl, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const decoded = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
        if (decoded?.data) {
          approvePairingPayload(decoded.data);
        }
      }, 350);
    } catch (err) {
      setCameraError(err?.message || "Camera permission is required to link another device.");
      setCameraActive(false);
    }
  };

  const handleBeginMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const { data } = await axios.post(`${server}/api/v1/auth/mfa/setup`, {}, { withCredentials: true });
      const url = await QRCode.toDataURL(data.otpauth_uri, { width: 200, margin: 2 });
      setMfaPairingDataUrl(url);
      setHasPendingSetup(true);
      setBackupCodes([]);
      setRevealBackupCodes(false);
      setMfaCode("");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to initialize 2FA");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfaSetup = async (e) => {
    e.preventDefault();
    setMfaLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/mfa/verify-setup`,
        { code: mfaCode.trim() },
        { withCredentials: true }
      );
      toast.success(data.message || "2FA Enabled!");
      setBackupCodes(data.backup_codes || []);
      setRevealBackupCodes(false);
      setHasPendingSetup(false);
      setMfaPairingDataUrl("");
      setMfaCode("");
      fetchMfaStatus();
      refreshProfile();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Invalid verification code");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleRegenBackup = async () => {
    if (!regenCode.trim()) {
      toast.error("Enter current 6-digit authenticator code");
      return;
    }
    setMfaLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/mfa/backup-codes`,
        { code: regenCode.trim() },
        { withCredentials: true }
      );
      setBackupCodes(data.backup_codes || []);
      setRevealBackupCodes(false);
      setRegenCode("");
      toast.success("Recovery codes rotated");
      fetchMfaStatus();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to regenerate backup codes");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async (e) => {
    e.preventDefault();
    setMfaLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/mfa/disable`,
        { password: disablePwd, code: disableCode.trim() },
        { withCredentials: true }
      );
      toast.success(data.message || "2FA Disabled");
      setDisablePwd("");
      setDisableCode("");
      setBackupCodes([]);
      setRevealBackupCodes(false);
      fetchMfaStatus();
      refreshProfile();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to disable 2FA");
    } finally {
      setMfaLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard?.writeText(backupCodes.join("\n"));
    toast.success("Recovery codes copied");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2.5 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <SecurityIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>Security &amp; Shared Sessions</Typography>
        </Stack>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab icon={<DevicesIcon fontSize="small" />} iconPosition="start" label={`Shared Sessions (${sessions.length}/${maxDevices})`} />
        <Tab icon={<ShieldIcon fontSize="small" />} iconPosition="start" label="Two-Factor Auth (2FA)" />
        <Tab icon={<KeyIcon fontSize="small" />} iconPosition="start" label="E2EE Keys" />
      </Tabs>

      <DialogContent sx={{ pt: 2.5, minHeight: 340 }}>
        {/* TAB 0: SHARED SESSIONS + LINK COMPANION DEVICE */}
        {tab === 0 && (
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5} flexWrap="wrap" gap={1}>
                <Typography variant="body2" fontWeight={600}>
                  Active Shared Sessions: {sessions.length} of {maxDevices} allowed
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<LinkDeviceIcon />}
                    onClick={() => (linkScannerOpen ? setLinkScannerOpen(false) : startCameraScanner())}
                  >
                    {linkScannerOpen ? "Close Scanner" : "Link New Device"}
                  </Button>
                  {sessions.length > 1 && (
                    <Button size="small" color="warning" startIcon={<LogoutIcon />} onClick={handleRevokeOthers}>
                      Log out others
                    </Button>
                  )}
                </Stack>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (sessions.length / Math.max(maxDevices, 1)) * 100)}
                color={sessions.length >= maxDevices ? "warning" : "primary"}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>

            <Collapse in={linkScannerOpen}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Link Another Browser or Device
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    On the other device, open ChitChat → <b>Sign in via Shared Session</b>, then point this camera at the pairing code.
                  </Typography>
                  {cameraActive ? (
                    <Box textAlign="center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{ width: "100%", maxHeight: 220, borderRadius: 12, backgroundColor: "#111" }}
                      />
                      {pairingApproving && (
                        <Typography variant="caption" display="block" mt={1} color="primary" fontWeight={600}>
                          Authorizing device...
                        </Typography>
                      )}
                      <Button size="small" color="inherit" onClick={() => { stopCamera(); setLinkScannerOpen(false); }} sx={{ mt: 1 }}>
                        Stop Camera
                      </Button>
                    </Box>
                  ) : (
                    <Button variant="contained" startIcon={<LinkDeviceIcon />} onClick={startCameraScanner}>
                      Start Camera
                    </Button>
                  )}
                  {cameraError && <Alert severity="warning">{cameraError}</Alert>}
                </Stack>
              </Paper>
            </Collapse>

            {sessionsLoading ? (
              <Box py={4} textAlign="center"><CircularProgress size={28} /></Box>
            ) : sessions.length === 0 ? (
              <Alert severity="info">No active tracked sessions found.</Alert>
            ) : (
              sessions.map((s) => (
                <Paper key={s.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {s.platform === "android" || s.platform === "ios" ? (
                        <AndroidIcon color="primary" />
                      ) : (
                        <WebIcon color="action" />
                      )}
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="subtitle2" fontWeight={700}>
                            {s.device_name || (s.platform === "android" ? "Android App" : "Web Browser")}
                          </Typography>
                          {s.is_current && <Chip label="This Device" size="small" color="success" />}
                          {s.auth_method === "qr" && <Chip label="Shared Session" size="small" variant="outlined" />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block">
                          IP: {s.ip_address || "Unknown"} · Last active: {new Date(s.last_active || s.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                    </Stack>
                    <IconButton
                      color="error"
                      size="small"
                      title="Revoke device session"
                      onClick={() => handleRevokeSession(s.id)}
                    >
                      <RevokeIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        )}

        {/* TAB 1: TWO-FACTOR AUTHENTICATION */}
        {tab === 1 && (
          <Stack spacing={2}>
            {mfaStatus.mfa_enabled ? (
              <Alert icon={<VerifiedIcon />} severity="success">
                Two-Factor Authentication is <b>ACTIVE</b>. Remaining single-use recovery codes:{" "}
                <b>{mfaStatus.backup_codes_remaining}</b>
              </Alert>
            ) : (
              <Alert severity="warning">
                Two-Factor Authentication is currently <b>OFF</b>. Add an Authenticator App (Google Authenticator,
                Authy, 1Password) for strong account protection.
              </Alert>
            )}

            {backupCodes.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" gap={1}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    One-Time Recovery Codes (Shown Once)
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={revealBackupCodes ? <HideIcon fontSize="small" /> : <RevealIcon fontSize="small" />}
                      onClick={() => setRevealBackupCodes((v) => !v)}
                    >
                      {revealBackupCodes ? "Hide" : "Reveal"}
                    </Button>
                    <Button
                      size="small"
                      startIcon={<CopyIcon fontSize="small" />}
                      onClick={copyBackupCodes}
                    >
                      Copy
                    </Button>
                  </Stack>
                </Stack>
                <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1}>
                  {backupCodes.map((c, i) => (
                    <Typography key={i} fontFamily="monospace" fontWeight={700} fontSize={14}>
                      {revealBackupCodes ? c : "••••-••••"}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            )}

            {!mfaStatus.mfa_enabled && !hasPendingSetup && (
              <Button variant="contained" onClick={handleBeginMfaSetup} disabled={mfaLoading}>
                {mfaLoading ? "Preparing..." : "Enable Authenticator App (2FA)"}
              </Button>
            )}

            {hasPendingSetup && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={2} alignItems="center">
                  <Typography variant="subtitle2" fontWeight={700}>
                    1. Scan this setup code in your Authenticator App
                  </Typography>
                  {mfaPairingDataUrl && <img src={mfaPairingDataUrl} alt="Authenticator Setup" style={{ borderRadius: 8 }} />}
                  <form onSubmit={handleVerifyMfaSetup} style={{ width: "100%" }}>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        fullWidth
                        size="small"
                        label="2. Enter 6-digit code"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        required
                      />
                      <Button type="submit" variant="contained" disabled={mfaLoading}>
                        Verify &amp; Enable
                      </Button>
                    </Stack>
                  </form>
                </Stack>
              </Paper>
            )}

            {mfaStatus.mfa_enabled && (
              <>
                <Divider />
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    label="6-digit code to rotate recovery codes"
                    value={regenCode}
                    onChange={(e) => setRegenCode(e.target.value)}
                  />
                  <Button variant="outlined" onClick={handleRegenBackup} disabled={mfaLoading}>
                    Rotate Codes
                  </Button>
                </Stack>

                <Divider />
                <form onSubmit={handleDisableMfa}>
                  <Typography variant="subtitle2" color="error" fontWeight={700} mb={1}>
                    Disable Two-Factor Authentication
                  </Typography>
                  <Stack spacing={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      label="Current Password (if set)"
                      value={disablePwd}
                      onChange={(e) => setDisablePwd(e.target.value)}
                    />
                    <Stack direction="row" spacing={1}>
                      <TextField
                        fullWidth
                        size="small"
                        label="6-digit code or recovery code"
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value)}
                        required
                      />
                      <Button type="submit" color="error" variant="outlined" disabled={mfaLoading}>
                        Disable 2FA
                      </Button>
                    </Stack>
                  </Stack>
                </form>
              </>
            )}
          </Stack>
        )}

        {/* TAB 2: CLIENT-SIDE END-TO-END ENCRYPTION KEYS */}
        {tab === 2 && (
          <Stack spacing={2}>
            <Alert icon={<LockIcon fontSize="small" />} severity={e2eeKeyPair ? "success" : "info"}>
              {e2eeKeyPair
                ? "Your ECDH P-256 identity key is active on this device. Your private key never leaves this device."
                : "Generate & publish your public ECDH P-256 key so direct contacts can send you client-side E2EE messages."}
            </Alert>

            {e2eeKeyPair?.fingerprint && (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
                  PUBLIC KEY FINGERPRINT
                </Typography>
                <Typography fontFamily="monospace" fontWeight={700} fontSize={14} mt={0.5}>
                  {e2eeKeyPair.fingerprint}
                </Typography>
              </Paper>
            )}

            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                fullWidth
                startIcon={<KeyIcon />}
                disabled={e2eeBusy}
                onClick={async () => {
                  setE2eeBusy(true);
                  try {
                    const pair = await ensureLocalIdentityKeyPair();
                    await publishE2eeKey({ publicKey: pair.publicJwk, fingerprint: pair.fingerprint }).unwrap();
                    setE2eeKeyPair(pair);
                    toast.success("Public E2EE key published");
                  } catch (err) {
                    toast.error(err?.data?.message || err?.message || "Failed to publish key");
                  } finally {
                    setE2eeBusy(false);
                  }
                }}
              >
                {e2eeKeyPair ? "Sync Public Key" : "Generate & Publish Key"}
              </Button>
              {e2eeKeyPair && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<RotateIcon />}
                  disabled={e2eeBusy}
                  onClick={async () => {
                    setE2eeBusy(true);
                    try {
                      const pair = await rotateLocalIdentityKeyPair();
                      await publishE2eeKey({ publicKey: pair.publicJwk, fingerprint: pair.fingerprint }).unwrap();
                      setE2eeKeyPair(pair);
                      toast.success("Identity key rotated & synced");
                    } catch {
                      toast.error("Failed to rotate key");
                    } finally {
                      setE2eeBusy(false);
                    }
                  }}
                >
                  Rotate
                </Button>
              )}
            </Stack>

            <Divider />
            <Typography variant="subtitle2" fontWeight={700}>
              Encrypted Key Backup / Restore (Multi-Device)
            </Typography>
            <TextField
              size="small"
              type="password"
              fullWidth
              label="Backup Passphrase"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              placeholder="Encrypted key backup JSON (export or paste here to import)"
              value={backupText}
              onChange={(e) => setBackupText(e.target.value)}
            />
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                fullWidth
                disabled={!e2eeKeyPair || !backupPassphrase}
                onClick={async () => {
                  try {
                    const exported = await exportEncryptedKeyBackup(e2eeKeyPair, backupPassphrase);
                    setBackupText(exported);
                    navigator.clipboard?.writeText(exported);
                    toast.success("Encrypted key backup exported & copied");
                  } catch {
                    toast.error("Export failed");
                  }
                }}
              >
                Export Encrypted Backup
              </Button>
              <Button
                size="small"
                variant="contained"
                fullWidth
                disabled={!backupText.trim() || !backupPassphrase}
                onClick={async () => {
                  try {
                    const imported = await importEncryptedKeyBackup(backupText.trim(), backupPassphrase);
                    await publishE2eeKey({ publicKey: imported.publicJwk, fingerprint: imported.fingerprint }).unwrap();
                    setE2eeKeyPair(imported);
                    toast.success("E2EE key restored on this device");
                  } catch {
                    toast.error("Invalid passphrase or backup JSON");
                  }
                }}
              >
                Import Backup
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SecurityDevicesDialog;
