import React, { memo } from "react";
import { server } from "../../constants/config";
import { useGetLinkPreviewQuery } from "../../redux/api/api";
import { Box, Typography, Link, Skeleton } from "@mui/material";
import { OpenInNew as OpenInNewIcon } from "@mui/icons-material";

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export const extractUrls = (text) => {
  if (!text) return [];
  return [...new Set(text.match(URL_REGEX) || [])];
};

const LinkPreviewCard = ({ url }) => {
  const { data, isLoading } = useGetLinkPreviewQuery(url, { skip: !url });

  if (isLoading) return (
    <Box sx={{ mt: 1, p: 1, borderRadius: 1, border: "1px solid rgba(0,0,0,0.1)", width: 240 }}>
      <Skeleton variant="rectangular" height={100} />
      <Skeleton width="80%" sx={{ mt: 0.5 }} />
      <Skeleton width="60%" />
    </Box>
  );

  if (!data?.success || !data?.preview) return null;

  const { title, description, image, siteName, url: previewUrl } = data.preview;

  return (
    <Link
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      underline="none"
      sx={{ display: "block", mt: 0.5, color: "inherit" }}
    >
      <Box
        sx={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: "8px",
          overflow: "hidden",
          maxWidth: 280,
          bgcolor: "rgba(255,255,255,0.8)",
          transition: "box-shadow 0.2s",
          "&:hover": { boxShadow: "0 2px 12px rgba(0,0,0,0.15)" },
        }}
      >
        {image && (
          <Box
            component="img"
            src={image}
            alt={title}
            sx={{ width: "100%", height: 130, objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <Box sx={{ p: 1 }}>
          {siteName && (
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
              {siteName}
            </Typography>
          )}
          {title && (
            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.2, lineHeight: 1.3 }} noWrap>
              {title}
            </Typography>
          )}
          {description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {description}
            </Typography>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, mt: 0.5 }}>
            <OpenInNewIcon sx={{ fontSize: 10, color: "text.disabled" }} />
            <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 220 }}>
              {previewUrl}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Link>
  );
};

const LinkPreview = ({ content }) => {
  const urls = extractUrls(content);
  if (!urls.length) return null;
  // Show preview for the first URL only to keep UI clean
  return <LinkPreviewCard url={urls[0]} />;
};

export default memo(LinkPreview);
