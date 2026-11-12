import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, MenuList, Switch } from "@mui/material";
import React, { useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setIsFileMenu, setUploadingLoader } from "../../redux/reducers/misc";
import {
  AudioFile as AudioFileIcon,
  GifBox as GifIcon,
  Image as ImageIcon,
  KeyboardReturn as EnterKeyIcon,
  Mic as MicIcon,
  Poll as PollIcon,
  UploadFile as UploadFileIcon,
  VideoFile as VideoFileIcon,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { useSendAttachmentsMutation } from "../../redux/api/api";

const FileMenu = ({
  anchorEl,
  chatId,
  onStartVoiceNote,
  onOpenGifStudio,
  onOpenCreatePoll,
  enterToSend = true,
  onToggleEnterToSend,
}) => {
  const { isFileMenu } = useSelector((state) => state.misc);

  const dispatch = useDispatch();

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

  const fileChangeHandler = async (e, key) => {
    const files = Array.from(e.target.files || []);

    if (files.length <= 0) return;

    if (files.length > 5) {
      return toast.error(`You can only send 5 ${key} at a time`);
    }

    const hasLargeFile = files.some((file) => file.size > 1024 * 1024 * 25);
    if (hasLargeFile) {
      return toast.error("Files must be smaller than 25MB");
    }

    dispatch(setUploadingLoader(true));

    const toastId = toast.loading(`Sending ${key}...`);
    closeFileMenu();

    try {
      const myForm = new FormData();
      myForm.append("chatId", chatId);
      files.forEach((file) => myForm.append("files", file));

      const res = await sendAttachments(myForm);

      if (res.data?.success) {
        toast.success(`${key} sent successfully`, { id: toastId });
      } else {
        toast.error(res.error?.data?.message || `Failed to send ${key}`, { id: toastId });
      }
    } catch {
      toast.error("Failed to upload attachments", { id: toastId });
    } finally {
      if (e.target) e.target.value = "";
      dispatch(setUploadingLoader(false));
    }
  };

  return (
    <Menu anchorEl={anchorEl} open={isFileMenu} onClose={closeFileMenu}>
      <div style={{ minWidth: "13rem" }}>
        <MenuList dense>
          <MenuItem onClick={selectImage}>
            <ListItemIcon><ImageIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Photo / Image</ListItemText>
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
            <ListItemText>Video</ListItemText>
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
  );
};

export default FileMenu;
