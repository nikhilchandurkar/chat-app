import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, MenuList, Switch } from "@mui/material";
import React, { lazy, Suspense, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setIsFileMenu, setUploadingLoader } from "../../redux/reducers/misc";

const MediaEditorDialog = lazy(() => import("./MediaEditorDialog"));
import {
  AudioFile as AudioFileIcon,
  Brush as BrushIcon,
  CheckBox as TodoWidgetIcon,
  GifBox as GifIcon,
  Headphones as HeadphonesIcon,
  Image as ImageIcon,
  KeyboardReturn as EnterKeyIcon,
  LocationOn as LocationIcon,
  Mic as MicIcon,
  Poll as PollIcon,
  ScheduleSend as ScheduleIcon,
  SportsEsports as GameIcon,
  UploadFile as UploadFileIcon,
  VideoFile as VideoFileIcon,
  Whatshot as FlameIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { useSendAttachmentsMutation } from "../../redux/api/api";

const FileMenu = ({
  anchorEl,
  chatId,
  activeTopic = "",
  onStartVoiceNote,
  onOpenGifStudio,
  onOpenCreatePoll,
  onOpenMiniGame,
  onOpenWatchParty,
  onOpenWhiteboard,
  onShareLiveLocation,
  onOpenSchedule,
  onOpenWidgetDialog,
  enterToSend = true,
  onToggleEnterToSend,
}) => {
  const { isFileMenu } = useSelector((state) => state.misc);

  const dispatch = useDispatch();
  const [viewOnce, setViewOnce] = useState(false);
  const [editorState, setEditorState] = useState(null);

  const imageRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);

  const [sendAttachments] = useSendAttachmentsMutation();

  const closeFileMenu = () => dispatch(setIsFileMenu(false));

  const selectImage = () => imageRef.current?.click();
  const selectAudio = () => audioRef.current?.click();
  const selectVideo = () => videoRef.current?.click();
  const selectFile = () => fileRef.current?.click();

  const handleVoicePick = () => {
    closeFileMenu();
    onStartVoiceNote?.();
  };

  const uploadPreparedFiles = async (files, key, captionText = "", isViewOnce = viewOnce) => {
    dispatch(setUploadingLoader(true));
    const toastId = toast.loading(isViewOnce ? `Sending View-Once ${key}...` : `Sending ${key}...`);
    try {
      const myForm = new FormData();
      myForm.append("chatId", chatId);
      if (isViewOnce) myForm.append("view_once", "true");
      if (captionText) myForm.append("message", captionText);
      if (activeTopic && activeTopic !== "all") myForm.append("topic_name", activeTopic);
      files.forEach((file) => myForm.append("files", file));

      const res = await sendAttachments(myForm);

      if (res.data?.success) {
        toast.success(`${isViewOnce ? "View-Once " : ""}${key} sent!`, { id: toastId });
        setViewOnce(false);
      } else {
        toast.error(res.error?.data?.message || `Failed to send ${key}`, { id: toastId });
      }
    } catch {
      toast.error("Failed to upload attachments", { id: toastId });
    } finally {
      dispatch(setUploadingLoader(false));
    }
  };

  const fileChangeHandler = async (e, key) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";

    if (files.length <= 0) return;

    if (files.length > 5) {
      return toast.error(`You can only send 5 ${key} at a time`);
    }

    const hasLargeFile = files.some((file) => file.size > 1024 * 1024 * 25);
    if (hasLargeFile) {
      return toast.error("Files must be smaller than 25MB");
    }

    closeFileMenu();

    if (key === "Images" || key === "Videos") {
      setEditorState({
        files,
        key,
        mediaKind: key === "Videos" ? "video" : "image",
        viewOnce,
      });
      return;
    }

    await uploadPreparedFiles(files, key, "", viewOnce);
  };

  return (
    <>
      <Menu anchorEl={anchorEl} open={isFileMenu} onClose={closeFileMenu}>
      <div style={{ minWidth: "15rem", maxHeight: "75vh", overflowY: "auto" }}>
        <MenuList dense>
          <MenuItem onClick={() => setViewOnce((v) => !v)}>
            <ListItemIcon><FlameIcon fontSize="small" color={viewOnce ? "error" : "action"} /></ListItemIcon>
            <ListItemText
              primary="Send as View-Once"
              secondary={viewOnce ? "Next photo/video expires after open" : "Tap to lock next media upload"}
            />
            <Switch size="small" color="error" checked={viewOnce} />
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />

          <MenuItem onClick={selectImage}>
            <ListItemIcon><ImageIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>{viewOnce ? "🔥 View-Once Photo" : "Photo / Image"}</ListItemText>
            <input
              type="file"
              multiple
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => fileChangeHandler(e, "Images")}
              ref={imageRef}
            />
          </MenuItem>

          <MenuItem onClick={selectVideo}>
            <ListItemIcon><VideoFileIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>{viewOnce ? "🔥 View-Once Video" : "Video"}</ListItemText>
            <input
              type="file"
              multiple
              accept="video/mp4, video/webm, video/ogg"
              style={{ display: "none" }}
              onChange={(e) => fileChangeHandler(e, "Videos")}
              ref={videoRef}
            />
          </MenuItem>

          <MenuItem onClick={selectAudio}>
            <ListItemIcon><AudioFileIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Audio File</ListItemText>
            <input
              type="file"
              multiple
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => fileChangeHandler(e, "Audios")}
              ref={audioRef}
            />
          </MenuItem>

          <MenuItem onClick={selectFile}>
            <ListItemIcon><UploadFileIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Document / File</ListItemText>
            <input
              type="file"
              multiple
              accept="*"
              style={{ display: "none" }}
              onChange={(e) => fileChangeHandler(e, "Files")}
              ref={fileRef}
            />
          </MenuItem>

          {onStartVoiceNote && (
            <MenuItem onClick={handleVoicePick}>
              <ListItemIcon><MicIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Record Voice Note</ListItemText>
            </MenuItem>
          )}

          <Divider sx={{ my: 0.5 }} />

          {onOpenMiniGame && (
            <MenuItem onClick={() => { closeFileMenu(); onOpenMiniGame(); }}>
              <ListItemIcon><GameIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>Play Mini-Game</ListItemText>
            </MenuItem>
          )}

          {onOpenWatchParty && (
            <MenuItem onClick={() => { closeFileMenu(); onOpenWatchParty(); }}>
              <ListItemIcon><HeadphonesIcon fontSize="small" color="secondary" /></ListItemIcon>
              <ListItemText>Listen / Watch Together</ListItemText>
            </MenuItem>
          )}

          {onOpenWhiteboard && (
            <MenuItem onClick={() => { closeFileMenu(); onOpenWhiteboard(); }}>
              <ListItemIcon><BrushIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>Live Whiteboard Doodle</ListItemText>
            </MenuItem>
          )}

          {onShareLiveLocation && (
            <MenuItem onClick={() => { closeFileMenu(); onShareLiveLocation(); }}>
              <ListItemIcon><LocationIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Share Live Location</ListItemText>
            </MenuItem>
          )}

          {onOpenSchedule && (
            <MenuItem onClick={() => { closeFileMenu(); onOpenSchedule(); }}>
              <ListItemIcon><ScheduleIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>Schedule / Reminder</ListItemText>
            </MenuItem>
          )}

          {onOpenGifStudio && (
            <MenuItem
              onClick={() => {
                closeFileMenu();
                onOpenGifStudio();
              }}
            >
              <ListItemIcon><GifIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>GIFs &amp; Create GIF</ListItemText>
            </MenuItem>
          )}

          {onOpenCreatePoll && (
            <MenuItem
              onClick={() => {
                closeFileMenu();
                onOpenCreatePoll();
              }}
            >
              <ListItemIcon><PollIcon fontSize="small" color="secondary" /></ListItemIcon>
              <ListItemText>Create Poll</ListItemText>
            </MenuItem>
          )}

          {onOpenWidgetDialog && (
            <MenuItem
              onClick={() => {
                closeFileMenu();
                onOpenWidgetDialog();
              }}
            >
              <ListItemIcon><TodoWidgetIcon fontSize="small" color="primary" /></ListItemIcon>
              <ListItemText>Checklist / Spin Wheel / Timer</ListItemText>
            </MenuItem>
          )}

          {onToggleEnterToSend && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={onToggleEnterToSend}>
                <ListItemIcon><EnterKeyIcon fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary="Enter sends message"
                  secondary={enterToSend ? "Shift+Enter for new line" : "Tap Send button to send"}
                />
                <Switch size="small" checked={enterToSend} />
              </MenuItem>
            </>
          )}
        </MenuList>
      </div>
    </Menu>

    {editorState && (
      <Suspense fallback={null}>
        <MediaEditorDialog
          open={Boolean(editorState)}
          files={editorState.files}
          mediaKind={editorState.mediaKind}
          initialViewOnce={editorState.viewOnce}
          onClose={() => setEditorState(null)}
          onConfirmSend={(editedFiles, captionText, isViewOnce) =>
            uploadPreparedFiles(editedFiles, editorState.key, captionText, isViewOnce)
          }
        />
      </Suspense>
    )}
    </>
  );
};

export default FileMenu;
