import { Box, Typography } from "@mui/material";
import React, { memo } from "react";
import { lightBlue } from "../../constants/color";
import moment from "moment";
import { fileFormat } from "../../lib/feature";
import RenderAttachment from "./RenderAttachment";
import { motion } from "framer-motion";
import { useSelector } from "react-redux";

const MessageComponent = ({ message}) => {
  const { user } = useSelector((state) => state.auth); 
  const { sender, content, attachments = [], createdAt } = message;

  const sameSender = sender?._id === user?._id;
  const timeAgo = createdAt ? moment(createdAt).fromNow() : "Just now";

  return (
    <motion.div
      initial={{ opacity: 0, x: "-100%" }}
      whileInView={{ opacity: 1, x: 0 }}
      style={{
        alignSelf: sameSender ? "flex-end" : "flex-start",
        backgroundColor: "white",
        color: "black",
        borderRadius: "5px",
        padding: "0.5rem",
        width: "fit-content",
      }}
    >
      {!sameSender && sender?.name && (
        <Typography color={lightBlue} fontWeight="600" variant="caption">
          {sender.name}
        </Typography>
      )}

      {content && <Typography>{content}</Typography>}

      {attachments?.length > 0 &&
        attachments.map((attachment) => {
          const url = attachment.url;
          const file = fileFormat(url);

          return (
            <Box key={url}>
              <a
                href={url}
                target="_blank"
                download={`attachment_${url}`}
                style={{
                  color: "black",
                }}
              >
                {RenderAttachment(file, url)}
              </a>
            </Box>
          );
        })}

      <Typography variant="caption" color="text.secondary">
        {timeAgo}
      </Typography>
    </motion.div>
  );
};

export default memo(MessageComponent);
