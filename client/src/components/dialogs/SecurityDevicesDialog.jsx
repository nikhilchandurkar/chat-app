import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Close as CloseIcon,
  Computer as WebIcon,
  ContentCopy as CopyIcon,
  DeleteOutline as RevokeIcon,
  Devices as DevicesIcon,
  Logout as LogoutIcon,
  PhoneAndroid as AndroidIcon,
  QrCodeScanner as QrScannerIcon,
  Security as SecurityIcon,
  Shield as ShieldIcon,
  VerifiedUser as VerifiedIcon,
} from "@mui/icons-material";
import axios from "axios";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { server } from "../../constants/config";
import { userExists } from "../../redux/reducers/auth";

const SecurityDevicesDialog = ({ open, onClose, initialTab = 0 }) => {
  const dispatch = useDispatch();
  const [tab, setTab] = useState(initialTab);

  // Sessions state
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [maxDevices, setMaxDevices] = useState(3);

  // QR Scanner / Approver state
  const [qrInput, setQrInput] = useState("");
  const [qrApproving, setQrApproving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  // MFA state
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaStatus, setMfaStatus] = useState({ mfa_enabled: false, backup_codes_remaining: 0 });
  const [setupData, setSetupData] = useState(null); // { secret, otpauth_uri }
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [disablePwd, setDisablePwd] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");

  useEffect(() => {
    if (open) {
      setTab(initialTab);
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
    if (!open || tab !== 1) {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, tab, stopCamera]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await axios.get(`${server}/api/v1/auth/sessions`, { withCredentials: true });
      setSessions(data.sessions || []);
      setMaxDevices(data.max_devices || 3);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load active sessions");
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

  const approveQrToken = useCallback(async (rawToken) => {
    const clean = (rawToken || "").trim();
    if (!clean) {
      toast.error("Scan or paste a valid QR login token");
      return;
    }
    setQrApproving(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/auth/qr/approve`,
        { qr_token: clean },
        { withCredentials: true }
      );
      toast.success(data.message || "Companion device authorized!");
      setQrInput("");
      stopCamera();
      setTimeout(fetchSessions, 1200);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "DEVICE_LIMIT_REACHED") {
        toast.error(err?.response?.data?.message || "Max devices reached. Revoke an old device first.");
        setTab(0);
      } else {
        toast.error(err?.response?.data?.message || "Could not approve QR code");
      }
    } finally {
      setQrApproving(false);
    }
  }, [fetchSessions, stopCamera]);

  const startCameraScanner = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access requires HTTPS or a supported browser. Paste the QR token below instead.");
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

      if (typeof window.BarcodeDetector === "function") {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanTimerRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length > 0 && codes[0].rawValue) {
              approveQrToken(codes[0].rawValue);
            }
          } catch {
            // ignore detection frame glitch
          }
        }, 400);
      } else {
        setCameraError("Auto-QR detection is unavailable in this WebView; point camera or paste the QR token below.");
      }
    } catch (err) {
      setCameraError(err?.message || "Camera permission denied. Paste the QR code token below.");
      setCameraActive(false);
    }
  };

  const handleBeginMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const { data } = await axios.post(`${server}/api/v1/auth/mfa/setup`, {}, { withCredentials: true });
      setSetupData(data);
      const url = await QRCode.toDataURL(data.otpauth_uri, { width: 200, margin: 2 });
      setMfaQrDataUrl(url);
      setBackupCodes([]);
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
      setSetupData(null);
      setMfaQrDataUrl("");
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
      setRegenCode("");
      toast.success("Backup codes rotated");
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
      fetchMfaStatus();
      refreshProfile();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to disable 2FA");
    } finally {
      setMfaLoading(false);
    }
  };

  const copyText = (val, label) => {
    navigator.clipboard?.writeText(val);
    toast.success(`${label} copied`);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2.5 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <SecurityIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>Security, 2FA & Linked Devices</Typography>
        </Stack>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab icon={<DevicesIcon fontSize="small" />} iconPosition="start" label={`Devices (${sessions.length}/${maxDevices})`} />
        <Tab icon={<QrScannerIcon fontSize="small" />} iconPosition="start" label="Link QR" />
        <Tab icon={<ShieldIcon fontSize="small" />} iconPosition="start" label="2FA / MFA" />
      </Tabs>

      <DialogContent sx={{ pt: 2.5, minHeight: 340 }}>
        {/* TAB 0: LINKED DEVICES & SESSION CAP */}
        {tab === 0 && (
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                <Typography variant="body2" fontWeight={600}>
                  Active Device Limit: {sessions.length} of {maxDevices} allowed
                </Typography>
                {sessions.length > 1 && (
                  <Button size="small" color="warning" startIcon={<LogoutIcon />} onClick={handleRevokeOthers}>
                    Log out others
                  </Button>
                )}
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (sessions.length / Math.max(maxDevices, 1)) * 100)}
                color={sessions.length >= maxDevices ? "warning" : "primary"}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>

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
                            {s.device_name || s.platform}
                          </Typography>
                          {s.is_current && <Chip label="This Device" size="small" color="success" />}
                          {s.auth_method === "qr" && <Chip label="QR Linked" size="small" variant="outlined" />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block">
                          IP: {s.ip_address || "Unknown"} · Method: {s.auth_method || "password"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last active: {new Date(s.last_active || s.created_at).toLocaleString()}
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

        {/* TAB 1: LINK COMPANION DEVICE VIA QR */}
        {tab === 1 && (
          <Stack spacing={2}>
            <Alert severity="info">
              To sign in on a Web Browser or Desktop without typing your password, open ChitChat on that browser,
              click <b>Link via QR Code</b>, and scan or paste its QR token here.
            </Alert>

            {!cameraActive ? (
              <Button variant="outlined" startIcon={<QrScannerIcon />} onClick={startCameraScanner}>
                Open Camera to Scan QR
              </Button>
            ) : (
              <Box textAlign="center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ width: "100%", maxHeight: 220, borderRadius: 12, backgroundColor: "#111" }}
                />
                <Button size="small" color="inherit" onClick={stopCamera} sx={{ mt: 1 }}>Stop Camera</Button>
              </Box>
            )}

            {cameraError && <Alert severity="warning">{cameraError}</Alert>}

            <Divider>OR PASTE QR TOKEN / LINK</Divider>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="QR Token or chitchat://qr-login?token=..."
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
              />
              <Button
                variant="contained"
                disabled={qrApproving || !qrInput.trim()}
                onClick={() => approveQrToken(qrInput)}
              >
                {qrApproving ? <CircularProgress size={20} color="inherit" /> : "Approve"}
              </Button>
            </Stack>
          </Stack>
        )}

        {/* TAB 2: TWO-FACTOR AUTHENTICATION (TOTP + BACKUP CODES) */}
        {tab === 2 && (
          <Stack spacing={2}>
            {mfaStatus.mfa_enabled ? (
              <Alert icon={<VerifiedIcon />} severity="success">
                Two-Factor Authentication is <b>ACTIVE</b>. Remaining single-use backup codes:{" "}
                <b>{mfaStatus.backup_codes_remaining}</b>
              </Alert>
            ) : (
              <Alert severity="warning">
                Two-Factor Authentication is currently <b>OFF</b>. Add an Authenticator App (Google Authenticator,
                Authy, 1Password) for strong login protection.
              </Alert>
            )}

            {backupCodes.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Save Your One-Time Backup Recovery Codes
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<CopyIcon fontSize="small" />}
                    onClick={() => copyText(backupCodes.join("\n"), "Backup codes")}
                  >
                    Copy All
                  </Button>
                </Stack>
                <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1}>
                  {backupCodes.map((c) => (
                    <Typography key={c} fontFamily="monospace" fontWeight={700} fontSize={14}>
                      {c}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            )}

            {!mfaStatus.mfa_enabled && !setupData && (
              <Button variant="contained" onClick={handleBeginMfaSetup} disabled={mfaLoading}>
                {mfaLoading ? "Preparing..." : "Enable Authenticator App (2FA)"}
              </Button>
            )}

            {setupData && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={2} alignItems="center">
                  <Typography variant="subtitle2" fontWeight={700}>
                    1. Scan this QR in your Authenticator App
                  </Typography>
                  {mfaQrDataUrl && <img src={mfaQrDataUrl} alt="MFA Setup QR" style={{ borderRadius: 8 }} />}
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" fontFamily="monospace">
                      Secret: {setupData.secret}
                    </Typography>
                    <IconButton size="small" onClick={() => copyText(setupData.secret, "Secret key")}>
                      <CopyIcon fontSize="inherit" />
                    </IconButton>
                  </Stack>
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
                        Verify & Enable
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
                    label="6-digit code to rotate backup codes"
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
                        label="6-digit code or backup code"
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
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SecurityDevicesDialog;

