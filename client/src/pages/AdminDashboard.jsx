import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AdminPanelSettings as AdminIcon,
  ArrowBack as BackIcon,
  Block as SuspendIcon,
  ChatBubbleOutline as ChatIcon,
  CheckCircle as RestoreIcon,
  DarkMode as DarkModeIcon,
  DeleteOutline as RevokeIcon,
  Devices as DevicesIcon,
  DoneAll as ResolveIcon,
  Forum as MessagesIcon,
  LightMode as LightModeIcon,
  OpenInNew as ExternalIcon,
  PeopleOutline as UsersIcon,
  QrCode2 as QrIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
  Shield as ShieldIcon,
  Storage as StorageIcon,
  VerifiedUser as VerifiedIcon,
} from "@mui/icons-material";
import axios from "axios";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useNavigate } from "react-router-dom";
import { server } from "../constants/config";
import {
  darkAction,
  darkBorder,
  darkSurface,
  darkSurfaceSecondary,
  darkText,
  darkTextSecondary,
  errorColor,
  lightAction,
  lightBorder,
  lightSurface,
  lightSurfaceSecondary,
  lightText,
  lightTextSecondary,
  successColor,
  warningColor,
} from "../constants/color";
import { toggleTheme } from "../redux/reducers/misc";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  Filler
);

// Palette strictly aligned with ChitChat Green / Teal / Amber / Slate design tokens
const CHART_SERIES_COLORS = [
  "#236B4A",
  "#0D9488",
  "#B7791F",
  "#4B9B70",
  "#334155",
  "#27834A",
];

const StatCard = ({ label, value, sub, adminHref, icon: Icon, isDark, accent }) => (
  <Paper
    elevation={0}
    sx={{
      p: 2,
      borderRadius: 2.5,
      height: "100%",
      bgcolor: isDark ? darkSurface : lightSurface,
      border: `1px solid ${isDark ? darkBorder : lightBorder}`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    }}
  >
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
      <Box>
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{
            textTransform: "uppercase",
            letterSpacing: "0.4px",
            color: isDark ? darkTextSecondary : lightTextSecondary,
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="h4"
          fontWeight={800}
          sx={{ mt: 0.5, mb: 0.5, color: accent || (isDark ? darkText : lightText) }}
        >
          {value}
        </Typography>
      </Box>
      {Icon && (
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: isDark ? darkSurfaceSecondary : lightSurfaceSecondary,
            color: accent || (isDark ? darkAction : lightAction),
            display: "flex",
          }}
        >
          <Icon fontSize="small" />
        </Box>
      )}
    </Stack>

    <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
      <Typography variant="caption" sx={{ color: isDark ? darkTextSecondary : lightTextSecondary }}>
        {sub}
      </Typography>
      {adminHref && (
        <Button
          size="small"
          component="a"
          href={adminHref}
          target="_blank"
          rel="noreferrer"
          endIcon={<ExternalIcon sx={{ fontSize: 12 }} />}
          sx={{
            textTransform: "none",
            fontSize: 11,
            fontWeight: 600,
            minWidth: 0,
            p: 0.4,
            color: isDark ? darkAction : lightAction,
          }}
        >
          Django
        </Button>
      )}
    </Stack>
  </Paper>
);

const AdminDashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const { themeMode } = useSelector((state) => state.misc);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const isDark = themeMode === "dark";
  const actionColor = isDark ? darkAction : lightAction;
  const borderColor = isDark ? darkBorder : lightBorder;
  const cardBg = isDark ? darkSurface : lightSurface;
  const subTextColor = isDark ? darkTextSecondary : lightTextSecondary;
  const textColor = isDark ? darkText : lightText;

  // Strict superadmin visibility guard — regular users never view this route
  const isSuperAdmin = Boolean(
    user && (user.is_superuser || (user.role === "admin" && user.is_staff))
  );

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [includeLoadTest, setIncludeLoadTest] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const fetchAll = useCallback(
    async (searchQuery = "", showLt = false) => {
      setLoading(true);
      try {
        const [statsRes, usersRes, sessRes, chatsRes, msgsRes, repRes, logRes] =
          await Promise.all([
            axios.get(`${server}/api/v1/admin/stats`, { withCredentials: true }),
            axios.get(`${server}/api/v1/admin/users`, {
              params: {
                ...(searchQuery ? { q: searchQuery } : {}),
                ...(showLt || searchQuery ? { include_loadtest: "1" } : {}),
              },
              withCredentials: true,
            }),
            axios.get(`${server}/api/v1/admin/sessions`, { withCredentials: true }),
            axios.get(`${server}/api/v1/admin/chats`, { withCredentials: true }),
            axios.get(`${server}/api/v1/admin/messages`, { withCredentials: true }),
            axios.get(`${server}/api/v1/admin/reports`, { withCredentials: true }),
            axios.get(`${server}/api/v1/admin/audit-logs`, { withCredentials: true }),
          ]);
        setStats(statsRes.data.stats);
        setUsers(usersRes.data.users || []);
        setSessions(sessRes.data.sessions || []);
        setChats(chatsRes.data.chats || []);
        setMessages(msgsRes.data.messages || []);
        setReports(repRes.data.reports || []);
        setAuditLogs(logRes.data.auditLogs || []);
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load admin analytics");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchAll("", false);
  }, [isSuperAdmin, fetchAll]);

  const handleToggleSuspend = async (uid) => {
    try {
      const { data } = await axios.post(
        `${server}/api/v1/admin/users/${uid}/suspend`,
        {},
        { withCredentials: true }
      );
      toast.success(data.message || "User status updated");
      fetchAll(userSearch, includeLoadTest);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update user status");
    }
  };

  const handleToggleRole = async (uid) => {
    try {
      const { data } = await axios.post(
        `${server}/api/v1/admin/users/${uid}/role`,
        {},
        { withCredentials: true }
      );
      toast.success(data.message || "Role updated");
      fetchAll(userSearch, includeLoadTest);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update role");
    }
  };

  const handleRevokeUserSessions = async (uid) => {
    try {
      const { data } = await axios.post(
        `${server}/api/v1/admin/users/${uid}/revoke-sessions`,
        {},
        { withCredentials: true }
      );
      toast.success(data.message || "User sessions revoked");
      fetchAll(userSearch, includeLoadTest);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to revoke sessions");
    }
  };

  const handleRevokeSession = async (sid) => {
    try {
      await axios.delete(`${server}/api/v1/admin/sessions/${sid}`, { withCredentials: true });
      toast.success("Device session revoked");
      fetchAll(userSearch, includeLoadTest);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to revoke session");
    }
  };

  const handleUpdateReport = async (rid, nextStatus) => {
    try {
      const { data } = await axios.post(
        `${server}/api/v1/admin/reports/${rid}/status`,
        { status: nextStatus },
        { withCredentials: true }
      );
      toast.success(data.message || "Report updated");
      fetchAll(userSearch, includeLoadTest);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update report");
    }
  };

  const chartAxisOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, boxWidth: 12, font: { weight: "600" } } },
      },
      scales: {
        x: {
          ticks: { color: subTextColor },
          grid: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: subTextColor, precision: 0 },
          grid: { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
        },
      },
    }),
    [isDark, subTextColor, textColor]
  );

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const adminUrls = stats?.djangoAdminUrls || {
    index: "/admin/",
    users: "/admin/authentication/user/",
    sessions: "/admin/authentication/usersession/",
    devices: "/admin/authentication/device/",
    mfa: "/admin/authentication/usermfa/",
    qrLogins: "/admin/authentication/qrloginsession/",
    chats: "/admin/chat/conversation/",
    messages: "/admin/messages_app/message/",
    outbox: "/admin/outbox/messageoutbox/",
    storage: "/admin/storage_app/userstorageusage/",
    auditLogs: "/admin/authentication/auditlog/",
    reports: "/admin/authentication/report/",
  };

  const daily = stats?.dailyActivity || [];
  const lineData = {
    labels: daily.map((d) => d.label),
    datasets: [
      {
        label: "Messages",
        data: daily.map((d) => d.messages),
        borderColor: actionColor,
        backgroundColor: isDark ? "rgba(75, 155, 112, 0.22)" : "rgba(35, 107, 74, 0.16)",
        fill: true,
        tension: 0.35,
      },
      {
        label: "New Signups",
        data: daily.map((d) => d.users),
        borderColor: "#0D9488",
        backgroundColor: "rgba(13, 148, 136, 0.14)",
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const platformRows = stats?.devicePlatforms || [];
  const platformData = {
    labels: platformRows.length ? platformRows.map((p) => p.label.toUpperCase()) : ["NONE"],
    datasets: [
      {
        data: platformRows.length ? platformRows.map((p) => p.count) : [1],
        backgroundColor: CHART_SERIES_COLORS,
        borderColor: cardBg,
        borderWidth: 2,
      },
    ],
  };

  const authRows = stats?.authMethods || [];
  const msgRows = stats?.messageTypes || [];
  const barData = {
    labels: [
      ...authRows.map((a) => `Auth: ${a.label}`),
      ...msgRows.map((m) => `Msg: ${m.label}`),
    ],
    datasets: [
      {
        label: "Records",
        data: [...authRows.map((a) => a.count), ...msgRows.map((m) => m.count)],
        backgroundColor: CHART_SERIES_COLORS,
        borderRadius: 6,
      },
    ],
  };

  const infraData = {
    labels: ["Outbox Processed", "Outbox Pending", "Outbox Failed", "Redis Clients", "2FA Active"],
    datasets: [
      {
        label: "Count",
        data: [
          stats?.processedOutboxEvents ?? 0,
          stats?.pendingOutboxEvents ?? 0,
          stats?.failedOutboxEvents ?? 0,
          stats?.redisClients ?? 0,
          stats?.mfaEnabledCount ?? 0,
        ],
        backgroundColor: ["#236B4A", "#B7791F", "#C0392B", "#0D9488", "#27834A"],
        borderRadius: 6,
      },
    ],
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: 3 }}>
      <Container maxWidth="xl">
        {/* Top Command Header */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 3,
            bgcolor: cardBg,
            border: `1px solid ${borderColor}`,
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            spacing={2}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                startIcon={<BackIcon />}
                variant="outlined"
                size="small"
                onClick={() => navigate("/")}
                sx={{ borderColor, color: textColor }}
              >
                Back to Chats
              </Button>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: isDark ? darkSurfaceSecondary : "#E8F3ED",
                  color: actionColor,
                  display: "flex",
                }}
              >
                <AdminIcon fontSize="medium" />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" fontWeight={800} color={textColor}>
                    ChitChat Superadmin Console
                  </Typography>
                  <Chip label="Superadmin Only" size="small" color="primary" />
                </Stack>
                <Typography variant="caption" sx={{ color: subTextColor }}>
                  {user?.email} · Redis: {stats?.redisStatus || "..."} ({stats?.redisMemory || "N/A"},{" "}
                  {stats?.redisClients ?? 0} clients)
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1.2} flexWrap="wrap" alignItems="center">
              <Tooltip title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}>
                <IconButton onClick={() => dispatch(toggleTheme())} sx={{ border: `1px solid ${borderColor}` }}>
                  {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchAll(userSearch, includeLoadTest)}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                color="primary"
                component="a"
                href={`${server}${adminUrls.index}`}
                target="_blank"
                rel="noreferrer"
                endIcon={<ExternalIcon />}
              >
                Open Django Admin (/admin/)
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {loading && !stats ? (
          <Box py={10} textAlign="center">
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* KPI Summary Row */}
            <Grid container spacing={2} mb={3}>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Real Users"
                  value={stats?.realUsersCount ?? 0}
                  sub={`DB total: ${stats?.usersCount ?? 0}`}
                  adminHref={`${server}${adminUrls.users}`}
                  icon={UsersIcon}
                  isDark={isDark}
                  accent={actionColor}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Active Sessions"
                  value={stats?.activeSessions ?? 0}
                  sub={`2FA active: ${stats?.mfaEnabledCount ?? 0}`}
                  adminHref={`${server}${adminUrls.sessions}`}
                  icon={DevicesIcon}
                  isDark={isDark}
                  accent={successColor}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Shared Sessions"
                  value={stats?.qrApprovedCount ?? 0}
                  sub="Linked companions"
                  adminHref={`${server}${adminUrls.qrLogins}`}
                  icon={QrIcon}
                  isDark={isDark}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Conversations"
                  value={stats?.totalChatsCount ?? 0}
                  sub={`Groups: ${stats?.groupChatsCount ?? 0}`}
                  adminHref={`${server}${adminUrls.chats}`}
                  icon={ChatIcon}
                  isDark={isDark}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Messages"
                  value={stats?.messagesCount ?? 0}
                  sub={`Outbox fail: ${stats?.failedOutboxEvents ?? 0}`}
                  adminHref={`${server}${adminUrls.messages}`}
                  icon={MessagesIcon}
                  isDark={isDark}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Storage Used"
                  value={`${stats?.storageUsedMB ?? 0} MB`}
                  sub={`Outbox pending: ${stats?.pendingOutboxEvents ?? 0}`}
                  adminHref={`${server}${adminUrls.storage}`}
                  icon={StorageIcon}
                  isDark={isDark}
                  accent={warningColor}
                />
              </Grid>
            </Grid>

            {/* Analytics Graphs Grid (4 Interactive Charts) */}
            <Grid container spacing={2.5} mb={3}>
              <Grid item xs={12} lg={6}>
                <Paper
                  elevation={0}
                  sx={{ p: 2.5, borderRadius: 2.5, height: 320, bgcolor: cardBg, border: `1px solid ${borderColor}` }}
                >
                  <Typography variant="subtitle1" fontWeight={700} color={textColor} mb={1.5}>
                    7-Day Messages &amp; Real User Growth
                  </Typography>
                  <Box sx={{ height: 240 }}>
                    <Line data={lineData} options={chartAxisOptions} />
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} lg={3}>
                <Paper
                  elevation={0}
                  sx={{ p: 2.5, borderRadius: 2.5, height: 320, bgcolor: cardBg, border: `1px solid ${borderColor}` }}
                >
                  <Typography variant="subtitle1" fontWeight={700} color={textColor} mb={1.5}>
                    Device Platforms
                  </Typography>
                  <Box sx={{ height: 240, display: "flex", justifyContent: "center" }}>
                    <Doughnut
                      data={platformData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: "bottom", labels: { color: textColor } } },
                      }}
                    />
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} lg={3}>
                <Paper
                  elevation={0}
                  sx={{ p: 2.5, borderRadius: 2.5, height: 320, bgcolor: cardBg, border: `1px solid ${borderColor}` }}
                >
                  <Typography variant="subtitle1" fontWeight={700} color={textColor} mb={1.5}>
                    Outbox &amp; Security Telemetry
                  </Typography>
                  <Box sx={{ height: 240 }}>
                    <Bar
                      data={infraData}
                      options={{
                        ...chartAxisOptions,
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Paper
                  elevation={0}
                  sx={{ p: 2.5, borderRadius: 2.5, height: 280, bgcolor: cardBg, border: `1px solid ${borderColor}` }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="subtitle1" fontWeight={700} color={textColor}>
                      Session Authentication Methods &amp; Message Format Distribution
                    </Typography>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.outbox}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon sx={{ fontSize: 14 }} />}
                    >
                      Outbox Queue in Django Admin
                    </Button>
                  </Stack>
                  <Box sx={{ height: 200 }}>
                    <Bar
                      data={barData}
                      options={{
                        ...chartAxisOptions,
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Full Management Tabs Mapped 1:1 to Django Admin */}
            <Paper
              elevation={0}
              sx={{ borderRadius: 2.5, overflow: "hidden", bgcolor: cardBg, border: `1px solid ${borderColor}` }}
            >
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ borderBottom: `1px solid ${borderColor}`, px: 2 }}
              >
                <Tab label={`Users (${users.length})`} />
                <Tab label={`Active Sessions (${sessions.length})`} />
                <Tab label={`Chats & Groups (${chats.length})`} />
                <Tab label={`Messages (${messages.length})`} />
                <Tab label={`Reports (${reports.length})`} />
                <Tab label={`Audit Logs (${auditLogs.length})`} />
              </Tabs>

              {/* TAB 0: USERS */}
              {tab === 0 && (
                <Box p={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ sm: "center" }}
                    mb={2}
                    spacing={1.5}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                      <TextField
                        size="small"
                        placeholder="Search email, username or name..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchAll(userSearch, includeLoadTest)}
                        sx={{ minWidth: 260 }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Button variant="outlined" size="small" onClick={() => fetchAll(userSearch, includeLoadTest)}>
                        Search
                      </Button>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={includeLoadTest}
                            onChange={(e) => {
                              setIncludeLoadTest(e.target.checked);
                              fetchAll(userSearch, e.target.checked);
                            }}
                          />
                        }
                        label={<Typography variant="caption">Include @loadtest.local</Typography>}
                      />
                    </Stack>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.users}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Manage in Django Admin
                    </Button>
                  </Stack>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Role</TableCell>
                          <TableCell>2FA</TableCell>
                          <TableCell>Account Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u._id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{u.email}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                @{u.username} · {u.name || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                icon={u.isSuperuser ? <VerifiedIcon /> : undefined}
                                label={u.isSuperuser ? "superadmin" : u.role}
                                size="small"
                                color={u.isSuperuser || u.role === "admin" ? "primary" : "default"}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                icon={<SecurityIcon />}
                                label={u.mfaEnabled ? "Enabled" : "Off"}
                                size="small"
                                color={u.mfaEnabled ? "success" : "default"}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={u.isActive ? "Active" : "Suspended"}
                                size="small"
                                color={u.isActive ? "success" : "error"}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title={u.isSuperuser ? "Demote to standard user" : "Promote to Superadmin"}>
                                <IconButton
                                  size="small"
                                  color={u.isSuperuser ? "warning" : "primary"}
                                  onClick={() => handleToggleRole(u._id)}
                                  disabled={u.email === user?.email}
                                >
                                  <ShieldIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Revoke all active device sessions">
                                <IconButton size="small" color="warning" onClick={() => handleRevokeUserSessions(u._id)}>
                                  <RevokeIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={u.isActive ? "Suspend account" : "Restore account"}>
                                <IconButton
                                  size="small"
                                  color={u.isActive ? "error" : "success"}
                                  onClick={() => handleToggleSuspend(u._id)}
                                  disabled={u.email === user?.email}
                                >
                                  {u.isActive ? <SuspendIcon fontSize="small" /> : <RestoreIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit user in Django Admin">
                                <IconButton
                                  size="small"
                                  component="a"
                                  href={`${server}${adminUrls.users}${u._id}/change/`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* TAB 1: ACTIVE SESSIONS */}
              {tab === 1 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="space-between" mb={1.5}>
                    <Typography variant="body2" color="text.secondary">
                      Enforced max 3 active devices per user · Immediate JWT revocation on disconnect
                    </Typography>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.sessions}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      All Sessions in Django Admin
                    </Button>
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Device / Platform</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>IP Address</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell align="right">Revoke</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id} hover>
                            <TableCell>{s.userEmail}</TableCell>
                            <TableCell>{s.deviceName} ({s.platform})</TableCell>
                            <TableCell><Chip label={s.authMethod} size="small" /></TableCell>
                            <TableCell>{s.ipAddress || "N/A"}</TableCell>
                            <TableCell>{new Date(s.createdAt).toLocaleString()}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" color="error" onClick={() => handleRevokeSession(s.id)}>
                                <RevokeIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* TAB 2: CHATS & GROUPS */}
              {tab === 2 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="flex-end" mb={1}>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.chats}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Manage Conversations in Django Admin
                    </Button>
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Conversation</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Members</TableCell>
                          <TableCell>Messages</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell align="right">Django</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {chats.map((c) => (
                          <TableRow key={c._id} hover>
                            <TableCell>{c.name}</TableCell>
                            <TableCell>
                              <Chip label={c.groupChat ? "Group" : "Direct"} size="small" color={c.groupChat ? "primary" : "default"} />
                            </TableCell>
                            <TableCell>{c.totalMembers}</TableCell>
                            <TableCell>{c.totalMessages}</TableCell>
                            <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                component="a"
                                href={`${server}${adminUrls.chats}${c._id}/change/`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* TAB 3: MESSAGES METADATA */}
              {tab === 3 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      Privacy-preserving metadata view (message content remains encrypted at rest)
                    </Typography>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.messages}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Inspect in Django Admin
                    </Button>
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Sender</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Edited / Deleted</TableCell>
                          <TableCell>Timestamp</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {messages.map((m) => (
                          <TableRow key={m._id} hover>
                            <TableCell>{m.senderName}</TableCell>
                            <TableCell><Chip label={m.messageType} size="small" variant="outlined" /></TableCell>
                            <TableCell>
                              {m.isDeleted ? "Deleted" : m.isEdited ? "Edited" : "Normal"}
                            </TableCell>
                            <TableCell>{new Date(m.createdAt).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* TAB 4: REPORTS */}
              {tab === 4 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="flex-end" mb={1}>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.reports}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Reports in Django Admin
                    </Button>
                  </Stack>
                  {reports.length === 0 ? (
                    <Alert severity="info">No abuse or moderation reports submitted.</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Reporter</TableCell>
                            <TableCell>Reported User</TableCell>
                            <TableCell>Reason</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {reports.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>{r.reporter}</TableCell>
                              <TableCell>{r.reportedUser}</TableCell>
                              <TableCell>{r.reason}</TableCell>
                              <TableCell><Chip label={r.status} size="small" /></TableCell>
                              <TableCell align="right">
                                <Tooltip title="Mark resolved">
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => handleUpdateReport(r.id, "resolved")}
                                  >
                                    <ResolveIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}

              {/* TAB 5: AUDIT LOGS */}
              {tab === 5 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="flex-end" mb={1}>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.auditLogs}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Full Audit Logs in Django Admin
                    </Button>
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Action</TableCell>
                          <TableCell>User</TableCell>
                          <TableCell>IP Address</TableCell>
                          <TableCell>Timestamp</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {auditLogs.map((l) => (
                          <TableRow key={l.id} hover>
                            <TableCell><Chip label={l.action} size="small" variant="outlined" /></TableCell>
                            <TableCell>{l.user}</TableCell>
                            <TableCell>{l.ipAddress || "N/A"}</TableCell>
                            <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Paper>
          </>
        )}
      </Container>
    </Box>
  );
};

export default AdminDashboard;
