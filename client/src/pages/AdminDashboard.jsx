import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
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
  CheckCircle as RestoreIcon,
  DeleteOutline as RevokeIcon,
  OpenInNew as ExternalIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
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
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { server } from "../constants/config";

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

const CHART_COLORS = ["#236B4A", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#0D9488"];

const StatCard = ({ label, value, sub, adminHref, color = "primary.main" }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, height: "100%" }}>
    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase" }}>
      {label}
    </Typography>
    <Typography variant="h4" fontWeight={800} sx={{ my: 0.5, color }}>
      {value}
    </Typography>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="caption" color="text.secondary">{sub}</Typography>
      {adminHref && (
        <Button
          size="small"
          component="a"
          href={adminHref}
          target="_blank"
          rel="noreferrer"
          endIcon={<ExternalIcon sx={{ fontSize: 13 }} />}
          sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.3 }}
        >
          Django Admin
        </Button>
      )}
    </Stack>
  </Paper>
);

const AdminDashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const navigate = useNavigate();

  const isAdmin = Boolean(
    user && (user.role === "admin" || user.is_superuser || user.is_staff)
  );

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [sessions, setSessions] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const fetchAll = useCallback(async (searchQuery = "") => {
    setLoading(true);
    try {
      const [statsRes, usersRes, sessRes, repRes, logRes] = await Promise.all([
        axios.get(`${server}/api/v1/admin/stats`, { withCredentials: true }),
        axios.get(`${server}/api/v1/admin/users`, {
          params: searchQuery ? { q: searchQuery, include_loadtest: "1" } : {},
          withCredentials: true,
        }),
        axios.get(`${server}/api/v1/admin/sessions`, { withCredentials: true }),
        axios.get(`${server}/api/v1/admin/reports`, { withCredentials: true }),
        axios.get(`${server}/api/v1/admin/audit-logs`, { withCredentials: true }),
      ]);
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users || []);
      setSessions(sessRes.data.sessions || []);
      setReports(repRes.data.reports || []);
      setAuditLogs(logRes.data.auditLogs || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load admin analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAll("");
  }, [isAdmin, fetchAll]);

  const handleToggleSuspend = async (uid) => {
    try {
      const { data } = await axios.post(
        `${server}/api/v1/admin/users/${uid}/suspend`,
        {},
        { withCredentials: true }
      );
      toast.success(data.message || "User status updated");
      fetchAll(userSearch);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Action failed");
    }
  };

  const handleRevokeSession = async (sid) => {
    try {
      await axios.delete(`${server}/api/v1/admin/sessions/${sid}`, { withCredentials: true });
      toast.success("Session revoked");
      fetchAll(userSearch);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to revoke session");
    }
  };

  if (!isAdmin) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Administrator privileges required to view the Superadmin Dashboard.
        </Alert>
        <Button variant="contained" startIcon={<BackIcon />} onClick={() => navigate("/")}>
          Back to Chats
        </Button>
      </Container>
    );
  }

  const adminUrls = stats?.djangoAdminUrls || {
    index: "/admin/",
    users: "/admin/authentication/user/",
    sessions: "/admin/authentication/usersession/",
    mfa: "/admin/authentication/usermfa/",
    qrLogins: "/admin/authentication/qrloginsession/",
    chats: "/admin/chat/conversation/",
    messages: "/admin/messages_app/message/",
    outbox: "/admin/outbox/messageoutbox/",
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
        borderColor: "#236B4A",
        backgroundColor: "rgba(35, 107, 74, 0.16)",
        fill: true,
        tension: 0.35,
      },
      {
        label: "New Users",
        data: daily.map((d) => d.users),
        borderColor: "#3B82F6",
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const platformRows = stats?.devicePlatforms || [];
  const platformData = {
    labels: platformRows.length ? platformRows.map((p) => p.label.toUpperCase()) : ["No Devices"],
    datasets: [
      {
        data: platformRows.length ? platformRows.map((p) => p.count) : [1],
        backgroundColor: CHART_COLORS,
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
        label: "Count",
        data: [...authRows.map((a) => a.count), ...msgRows.map((m) => m.count)],
        backgroundColor: CHART_COLORS,
        borderRadius: 6,
      },
    ],
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: 3 }}>
      <Container maxWidth="xl">
        {/* Header Bar */}
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button startIcon={<BackIcon />} variant="outlined" size="small" onClick={() => navigate("/")}>
                Chats
              </Button>
              <AdminIcon color="primary" fontSize="large" />
              <Box>
                <Typography variant="h5" fontWeight={800}>ChitChat Admin Dashboard</Typography>
                <Typography variant="caption" color="text.secondary">
                  Signed in as {user?.email} · Redis: {stats?.redisStatus || "..."} ({stats?.redisMemory || "N/A"})
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchAll(userSearch)}
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
          <Box py={8} textAlign="center"><CircularProgress /></Box>
        ) : (
          <>
            {/* KPI Row */}
            <Grid container spacing={2} mb={3}>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Users (Real / Total)"
                  value={`${stats?.realUsersCount ?? 0}`}
                  sub={`Total DB: ${stats?.usersCount ?? 0}`}
                  adminHref={`${server}${adminUrls.users}`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Active Sessions"
                  value={stats?.activeSessions ?? 0}
                  sub={`2FA Enabled: ${stats?.mfaEnabledCount ?? 0}`}
                  adminHref={`${server}${adminUrls.sessions}`}
                  color="success.main"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="QR Linked Logins"
                  value={stats?.qrApprovedCount ?? 0}
                  sub="Authorized devices"
                  adminHref={`${server}${adminUrls.qrLogins}`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Chats (Groups)"
                  value={stats?.totalChatsCount ?? 0}
                  sub={`Groups: ${stats?.groupChatsCount ?? 0}`}
                  adminHref={`${server}${adminUrls.chats}`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Total Messages"
                  value={stats?.messagesCount ?? 0}
                  sub={`Outbox fail: ${stats?.failedOutboxEvents ?? 0}`}
                  adminHref={`${server}${adminUrls.messages}`}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <StatCard
                  label="Storage Used"
                  value={`${stats?.storageUsedMB ?? 0} MB`}
                  sub={`Redis clients: ${stats?.redisClients ?? 0}`}
                  adminHref={`${server}${adminUrls.storage}`}
                />
              </Grid>
            </Grid>

            {/* Charts Row */}
            <Grid container spacing={2.5} mb={3}>
              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: 320 }}>
                  <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
                    7-Day Messages &amp; User Signups
                  </Typography>
                  <Box sx={{ height: 245 }}>
                    <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false }} />
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: 320 }}>
                  <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
                    Device Platforms
                  </Typography>
                  <Box sx={{ height: 245, display: "flex", justifyContent: "center" }}>
                    <Doughnut data={platformData} options={{ responsive: true, maintainAspectRatio: false }} />
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: 320 }}>
                  <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
                    Auth Methods &amp; Message Types
                  </Typography>
                  <Box sx={{ height: 245 }}>
                    <Bar
                      data={barData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Management Tabs Mapped to Django Admin */}
            <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden" }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
                <Tab label={`Users (${users.length})`} />
                <Tab label={`Active Sessions (${sessions.length})`} />
                <Tab label={`Reports (${reports.length})`} />
                <Tab label={`Audit Logs (${auditLogs.length})`} />
              </Tabs>

              {/* TAB 0: USERS */}
              {tab === 0 && (
                <Box p={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} spacing={1} flexWrap="wrap">
                    <TextField
                      size="small"
                      placeholder="Search users by email, username or name..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchAll(userSearch)}
                      sx={{ minWidth: 280 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" size="small" onClick={() => fetchAll(userSearch)}>Search</Button>
                      <Button
                        size="small"
                        component="a"
                        href={`${server}${adminUrls.users}`}
                        target="_blank"
                        rel="noreferrer"
                        endIcon={<ExternalIcon fontSize="small" />}
                      >
                        Edit in Django Admin
                      </Button>
                    </Stack>
                  </Stack>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Email / Username</TableCell>
                          <TableCell>Role</TableCell>
                          <TableCell>2FA</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u._id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{u.email}</Typography>
                              <Typography variant="caption" color="text.secondary">@{u.username} · {u.name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={u.isSuperuser ? "superadmin" : u.role}
                                size="small"
                                color={u.isSuperuser || u.role === "admin" ? "secondary" : "default"}
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
                              <Tooltip title={u.isActive ? "Suspend user" : "Restore user"}>
                                <IconButton
                                  size="small"
                                  color={u.isActive ? "error" : "success"}
                                  onClick={() => handleToggleSuspend(u._id)}
                                >
                                  {u.isActive ? <SuspendIcon fontSize="small" /> : <RestoreIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Open user in Django Admin">
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
                  <Stack direction="row" justifyContent="flex-end" mb={1}>
                    <Button
                      size="small"
                      component="a"
                      href={`${server}${adminUrls.sessions}`}
                      target="_blank"
                      rel="noreferrer"
                      endIcon={<ExternalIcon fontSize="small" />}
                    >
                      Manage All in Django Admin
                    </Button>
                  </Stack>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          <TableCell>Device / Platform</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>IP</TableCell>
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

              {/* TAB 2: REPORTS */}
              {tab === 2 && (
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
                      Open Reports in Django Admin
                    </Button>
                  </Stack>
                  {reports.length === 0 ? (
                    <Alert severity="info">No abuse or moderation reports submitted.</Alert>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Reporter</TableCell>
                          <TableCell>Reported User</TableCell>
                          <TableCell>Reason</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reports.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.reporter}</TableCell>
                            <TableCell>{r.reportedUser}</TableCell>
                            <TableCell>{r.reason}</TableCell>
                            <TableCell><Chip label={r.status} size="small" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              )}

              {/* TAB 3: AUDIT LOGS */}
              {tab === 3 && (
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
                      Open Audit Logs in Django Admin
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

