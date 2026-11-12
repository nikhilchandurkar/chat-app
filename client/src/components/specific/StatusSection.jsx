import React, { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  Visibility as ViewersIcon,
} from "@mui/icons-material";
import moment from "moment";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { resolveMediaUrl, transformImage } from "../../lib/feature";
import {
  useCreateStatusMutation,
  useDeleteStatusMutation,
  useGetMyStatusesQuery,
  useGetStatusFeedQuery,
  useLazyGetStatusViewersQuery,
  useReactStatusMutation,
  useRecordStatusViewMutation,
} from "../../redux/api/api";
import { retainProtectedSurface } from "../../utils/screenPrivacy";

const STORY_BG_COLORS = ["#236B4A", "#1E3A8A", "#7C2D12", "#6D28D9", "#9F1239", "#0F172A"];
const STORY_REACTIONS = ["❤️", "🔥", "😂", "👏", "😮"];

const StatusSection = () => {
  const { user } = useSelector((state) => state.auth);
  const { data: myData } = useGetMyStatusesQuery();
  const { data: feedData } = useGetStatusFeedQuery();

  const [createStatus, { isLoading: isCreating }] = useCreateStatusMutation();
  const [deleteStatus] = useDeleteStatusMutation();
  const [recordView] = useRecordStatusViewMutation();
  const [reactStatus] = useReactStatusMutation();
  const [fetchViewers, { data: viewersData, isFetching: viewersLoading }] = useLazyGetStatusViewersQuery();

  const myStatuses = myData?.statuses || [];
  const feedGroups = feedData?.feed || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [storyType, setStoryType] = useState("text");
  const [storyText, setStoryText] = useState("");
  const [bgColor, setBgColor] = useState(STORY_BG_COLORS[0]);
  const [privacy, setPrivacy] = useState("everyone");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");

  // Active viewer stack: { ownerName, ownerAvatar, isMine, items: [...] }
  const [viewerGroup, setViewerGroup] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [viewersOpen, setViewersOpen] = useState(false);
  const recordedIdsRef = useRef(new Set());

  const activeStory = viewerGroup?.items?.[storyIndex] || null;

  useEffect(() => {
    if (!viewerGroup) return undefined;
    return retainProtectedSurface();
  }, [viewerGroup]);

  useEffect(() => {
    if (!activeStory) return undefined;
    if (!viewerGroup.isMine && !recordedIdsRef.current.has(activeStory.id)) {
      recordedIdsRef.current.add(activeStory.id);
      recordView(activeStory.id);
    }
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (storyIndex + 1 < viewerGroup.items.length) {
            setStoryIndex((i) => i + 1);
          } else {
            setViewerGroup(null);
          }
          return 0;
        }
        return prev + 2.5;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [activeStory, recordView, storyIndex, viewerGroup]);

  const handleFilePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const lowerName = (f.name || "").toLowerCase();
    const isVideo = f.type.startsWith("video/") || /\.(mp4|webm|ogg|mov|mkv|m4v)$/.test(lowerName);
    const isImage =
      f.type.startsWith("image/") || /\.(jpg|jpeg|jfif|png|gif|webp|bmp|heic|heif|avif)$/.test(lowerName);
    if (!isVideo && !isImage) {
      toast.error("Please select an image, GIF, or video file.");
      return;
    }
    setMediaFile(f);
    setStoryType(isVideo ? "video" : "image");
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && /^data:(image|video)\//i.test(reader.result)) {
        setMediaPreview(reader.result);
      }
    };
    reader.readAsDataURL(f);
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    try {
      if (mediaFile) {
        const fd = new FormData();
        fd.append("status_type", storyType);
        fd.append("content", storyText.trim());
        fd.append("privacy", privacy);
        fd.append("media", mediaFile);
        await createStatus(fd).unwrap();
      } else {
        if (!storyText.trim()) {
          toast.error("Write a status or pick an image/GIF/video.");
          return;
        }
        await createStatus({
          status_type: "text",
          content: storyText.trim(),
          background_color: bgColor,
          privacy,
        }).unwrap();
      }
      toast.success("24h Status published!");
      setCreateOpen(false);
      setStoryText("");
      setMediaFile(null);
      setMediaPreview("");
      setStoryType("text");
    } catch (err) {
      toast.error(err?.data?.message || "Failed to publish status");
    }
  };

  const openMyStories = () => {
    if (!myStatuses.length) {
      setCreateOpen(true);
      return;
    }
    setStoryIndex(0);
    setViewerGroup({
      isMine: true,
      ownerName: "My Status",
      ownerAvatar: typeof user?.avatar === "string" ? user.avatar : user?.avatar?.url,
      items: myStatuses,
    });
  };

  const openContactStories = (grp) => {
    if (!grp?.statuses?.length) return;
    setStoryIndex(0);
    const av = grp.user?.avatar;
    setViewerGroup({
      isMine: false,
      ownerName: grp.user?.name || grp.user?.username || "Contact",
      ownerAvatar: typeof av === "string" ? av : av?.url,
      items: grp.statuses,
    });
  };

  const handleReact = async (emoji) => {
    if (!activeStory) return;
    try {
      const res = await reactStatus({ statusId: activeStory.id, reaction: emoji }).unwrap();
      if (Array.isArray(res?.reactions)) {
        setViewerGroup((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === activeStory.id ? { ...item, reactions: res.reactions } : item
                ),
              }
            : prev
        );
      }
      toast.success(`Reacted ${emoji}`);
    } catch {
      toast.error("Failed to react");
    }
  };

  const handleDeleteActive = async () => {
    if (!activeStory) return;
    try {
      await deleteStatus(activeStory.id).unwrap();
      toast.success("Status deleted");
      setViewerGroup(null);
    } catch {
      toast.error("Could not delete status");
    }
  };

  const handleShowViewers = async () => {
    if (!activeStory) return;
    setViewersOpen(true);
    fetchViewers(activeStory.id);
  };

  const myAvatar = typeof user?.avatar === "string" ? user.avatar : user?.avatar?.url;

  return (
    <>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {/* Create Story CTA tile (always easy to tap on mobile) */}
        <Box
          onClick={() => setCreateOpen(true)}
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", flexShrink: 0, width: 54 }}
        >
          <Avatar
            sx={{
              width: 44,
              height: 44,
              bgcolor: "primary.main",
              color: "#fff",
              border: "2px solid",
              borderColor: "primary.light",
            }}
          >
            <AddIcon />
          </Avatar>
          <Typography variant="caption" sx={{ fontSize: "0.68rem", mt: 0.3, fontWeight: 600 }} noWrap>
            Add Story
          </Typography>
        </Box>

        {/* My Active Story Ring (when at least 1 story exists) */}
        {myStatuses.length > 0 && (
          <Box
            onClick={openMyStories}
            sx={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", flexShrink: 0, width: 54 }}
          >
            <Avatar
              src={transformImage(myAvatar)}
              sx={{
                width: 44,
                height: 44,
                bgcolor: "#236B4A",
                border: "2.5px solid #22C55E",
              }}
            >
              {(user?.name || "M")[0].toUpperCase()}
            </Avatar>
            <Typography variant="caption" sx={{ fontSize: "0.68rem", mt: 0.3 }} noWrap>
              My ({myStatuses.length})
            </Typography>
          </Box>
        )}

        {/* Contact Stories */}
        {feedGroups.map((grp) => {
          const av = grp.user?.avatar;
          const avUrl = typeof av === "string" ? av : av?.url;
          const hasUnviewed = grp.statuses.some((s) => !s.has_viewed);
          return (
            <Box
              key={grp.user.id}
              onClick={() => openContactStories(grp)}
              sx={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", flexShrink: 0, maxWidth: 58 }}
            >
              <Avatar
                src={transformImage(avUrl)}
                sx={{
                  width: 44,
                  height: 44,
                  bgcolor: "#1E3A8A",
                  border: hasUnviewed ? "2.5px solid #22C55E" : "2px solid #9CA3AF",
                }}
              >
                {(grp.user?.name || "U")[0].toUpperCase()}
              </Avatar>
              <Typography variant="caption" sx={{ fontSize: "0.68rem", mt: 0.3, maxWidth: 56 }} noWrap>
                {grp.user?.name?.split(" ")[0] || grp.user?.username}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Create 24h Status Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" fontWeight={700}>Share 24h Status</Typography>
          <IconButton size="small" onClick={() => setCreateOpen(false)}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack component="form" onSubmit={handlePublish} spacing={2} pt={0.5}>
            {mediaPreview ? (
              <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden", bgcolor: "#000", maxHeight: 220, textAlign: "center" }}>
                {storyType === "video" ? (
                  <video src={/^data:video\//i.test(mediaPreview) ? mediaPreview : ""} controls style={{ maxHeight: 220, maxWidth: "100%" }} />
                ) : (
                  <img src={/^data:image\//i.test(mediaPreview) ? mediaPreview : ""} alt="preview" style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain" }} />
                )}
                <IconButton
                  size="small"
                  onClick={() => { setMediaFile(null); setMediaPreview(""); setStoryType("text"); }}
                  sx={{ position: "absolute", top: 6, right: 6, bgcolor: "rgba(0,0,0,0.6)", color: "#fff" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">Card Color:</Typography>
                {STORY_BG_COLORS.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setBgColor(c)}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      bgcolor: c,
                      cursor: "pointer",
                      border: bgColor === c ? "2.5px solid #22C55E" : "1px solid #ccc",
                    }}
                  />
                ))}
              </Box>
            )}

            <TextField
              fullWidth
              multiline
              minRows={mediaPreview ? 1 : 3}
              placeholder={mediaPreview ? "Add a caption..." : "What's on your mind? (visible for 24h)"}
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
            />

            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
              <Stack direction="row" spacing={0.75}>
                <Button component="label" size="small" variant="outlined" startIcon={<ImageIcon />}>
                  Gallery
                  <input type="file" hidden accept="image/*,video/*" onChange={handleFilePick} />
                </Button>
                <Button component="label" size="small" variant="outlined">
                  Camera
                  <input type="file" hidden accept="image/*" capture="environment" onChange={handleFilePick} />
                </Button>
              </Stack>
              <Select size="small" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <MenuItem value="everyone">Everyone</MenuItem>
                <MenuItem value="contacts">Contacts Only</MenuItem>
              </Select>
            </Stack>

            <Button type="submit" variant="contained" disabled={isCreating} fullWidth sx={{ borderRadius: 2 }}>
              {isCreating ? <CircularProgress size={20} color="inherit" /> : "Publish 24h Story"}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Story Viewer Dialog */}
      <Dialog
        open={Boolean(viewerGroup)}
        onClose={() => { setViewerGroup(null); setViewersOpen(false); }}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { bgcolor: "#0F1411", color: "#fff", borderRadius: 3, overflow: "hidden" } }}
      >
        {activeStory && (
          <Box sx={{ position: "relative", minHeight: 460, display: "flex", flexDirection: "column" }}>
            {/* Top Progress Bars */}
            <Stack direction="row" spacing={0.5} p={1.25}>
              {viewerGroup.items.map((st, idx) => (
                <LinearProgress
                  key={st.id}
                  variant="determinate"
                  value={idx < storyIndex ? 100 : idx === storyIndex ? progress : 0}
                  sx={{ flex: 1, height: 3, borderRadius: 2, bgcolor: "rgba(255,255,255,0.25)" }}
                />
              ))}
            </Stack>

            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" px={1.5} pb={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Avatar src={transformImage(viewerGroup.ownerAvatar)} sx={{ width: 32, height: 32 }}>
                  {viewerGroup.ownerName[0]}
                </Avatar>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>{viewerGroup.ownerName}</Typography>
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)" }}>
                    {moment(activeStory.created_at).fromNow()}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                {viewerGroup.isMine && (
                  <>
                    <Tooltip title="Viewers">
                      <IconButton size="small" onClick={handleShowViewers} sx={{ color: "#fff" }}>
                        <ViewersIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Story">
                      <IconButton size="small" onClick={handleDeleteActive} sx={{ color: "#FCA5A5" }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <IconButton size="small" onClick={() => setViewerGroup(null)} sx={{ color: "#fff" }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>

            {/* Main Content */}
            <Box
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (e.clientX - rect.left < rect.width * 0.35) {
                  if (storyIndex > 0) setStoryIndex((i) => i - 1);
                } else if (storyIndex + 1 < viewerGroup.items.length) {
                  setStoryIndex((i) => i + 1);
                } else {
                  setViewerGroup(null);
                }
              }}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
                cursor: "pointer",
                bgcolor: activeStory.status_type === "text" ? activeStory.background_color || "#236B4A" : "#000",
                textAlign: "center",
              }}
            >
              {activeStory.status_type === "image" && activeStory.media_url && (
                <img
                  src={resolveMediaUrl(activeStory.media_url)}
                  alt="story"
                  draggable={false}
                  style={{ maxHeight: 300, maxWidth: "100%", borderRadius: 8, objectFit: "contain" }}
                />
              )}
              {activeStory.status_type === "video" && activeStory.media_url && (
                <video
                  src={resolveMediaUrl(activeStory.media_url)}
                  controls
                  autoPlay
                  style={{ maxHeight: 300, maxWidth: "100%", borderRadius: 8 }}
                />
              )}
              {activeStory.content && (
                <Typography
                  variant={activeStory.status_type === "text" ? "h5" : "body1"}
                  fontWeight={600}
                  mt={activeStory.media_url ? 1.5 : 0}
                  sx={{ wordBreak: "break-word" }}
                >
                  {activeStory.content}
                </Typography>
              )}
            </Box>

            {/* Footer: View count & Reactions */}
            <Box p={1.25} bgcolor="rgba(0,0,0,0.52)">
              {(() => {
                const rawReacts = Array.isArray(activeStory.reactions) ? activeStory.reactions : [];
                const counts = {};
                let myReaction = "";
                const myUid = String(user?._id || user?.id || "");
                rawReacts.forEach((r) => {
                  if (!r?.reaction) return;
                  counts[r.reaction] = (counts[r.reaction] || 0) + 1;
                  if (myUid && String(r.user_id || r.user?.id || "") === myUid) {
                    myReaction = r.reaction;
                  }
                });

                if (viewerGroup.isMine) {
                  return (
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button size="small" startIcon={<ViewersIcon />} onClick={handleShowViewers} sx={{ color: "#fff" }}>
                        Viewed by {activeStory.views_count || 0} · {rawReacts.length} reaction{rawReacts.length === 1 ? "" : "s"}
                      </Button>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {Object.entries(counts).map(([em, cnt]) => (
                          <Chip
                            key={em}
                            size="small"
                            clickable
                            onClick={handleShowViewers}
                            label={`${em} ${cnt}`}
                            sx={{ bgcolor: "rgba(255,255,255,0.16)", color: "#fff", height: 24 }}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  );
                }

                return (
                  <Stack spacing={0.6}>
                    <Stack direction="row" justifyContent="space-around" alignItems="center">
                      {STORY_REACTIONS.map((em) => {
                        const cnt = counts[em] || 0;
                        const isMineRx = myReaction === em;
                        return (
                          <Button
                            key={em}
                            size="small"
                            onClick={() => handleReact(em)}
                            sx={{
                              minWidth: 0,
                              px: 1,
                              py: 0.4,
                              borderRadius: 99,
                              color: "#fff",
                              fontSize: "1.15rem",
                              bgcolor: isMineRx ? "rgba(34, 197, 94, 0.35)" : "transparent",
                              border: isMineRx ? "1px solid #4ADE80" : "1px solid transparent",
                            }}
                          >
                            {em}
                            {cnt > 0 && (
                              <Typography component="span" variant="caption" sx={{ ml: 0.4, color: "#fff", fontWeight: 700 }}>
                                {cnt}
                              </Typography>
                            )}
                          </Button>
                        );
                      })}
                    </Stack>
                  </Stack>
                );
              })()}
            </Box>
          </Box>
        )}
      </Dialog>

      {/* Viewers & Reactions Modal */}
      <Dialog open={viewersOpen} onClose={() => setViewersOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Story Viewers &amp; Reactions</DialogTitle>
        <DialogContent>
          {viewersLoading ? (
            <CircularProgress size={24} />
          ) : (
            <Stack spacing={1.75}>
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.75}>
                  VIEWED BY ({(viewersData?.viewers || []).length})
                </Typography>
                {!(viewersData?.viewers || []).length ? (
                  <Typography variant="body2" color="text.secondary">No views recorded yet.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {(viewersData?.viewers || []).map((v) => {
                      const viewerReaction = (viewersData?.reactions || []).find(
                        (r) => String(r.user?.id || "") === String(v.viewer?.id || "")
                      );
                      return (
                        <Stack key={v.id} direction="row" alignItems="center" justifyContent="space-between">
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Avatar src={transformImage(v.viewer?.avatar?.url)} sx={{ width: 30, height: 30 }}>
                              {(v.viewer?.name || "U")[0]}
                            </Avatar>
                            <Typography variant="body2" fontWeight={600}>
                              {v.viewer?.name || v.viewer?.username}
                            </Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            {viewerReaction && (
                              <Chip size="small" label={viewerReaction.reaction} color="primary" variant="outlined" />
                            )}
                            <Chip size="small" label={moment(v.viewed_at).fromNow()} />
                          </Stack>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              {(viewersData?.reactions || []).length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.75}>
                    REACTIONS ({viewersData.reactions.length})
                  </Typography>
                  <Stack spacing={1}>
                    {viewersData.reactions.map((r) => (
                      <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Avatar src={transformImage(r.user?.avatar?.url)} sx={{ width: 28, height: 28 }}>
                            {(r.user?.name || "U")[0]}
                          </Avatar>
                          <Typography variant="body2" fontWeight={600}>
                            {r.user?.name || r.user?.username}
                          </Typography>
                        </Stack>
                        <Typography fontSize="1.2rem">{r.reaction}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusSection;

