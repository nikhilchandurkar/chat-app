import React from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { ContentCopy as CopyIcon } from "@mui/icons-material";
import toast from "react-hot-toast";

const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|@[a-zA-Z0-9_.-]{2,32}|https?:\/\/[^\s<]+)/g;

function renderInlineTokens(text, { isDark, onMentionClick, keyPrefix }) {
  const parts = String(text || "").split(INLINE_TOKEN_RE);
  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <del key={key}>{part.slice(2, -2)}</del>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Box
          key={key}
          component="code"
          sx={{
            px: 0.6,
            py: 0.1,
            borderRadius: 0.75,
            fontFamily: "monospace",
            fontSize: "0.86em",
            bgcolor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)",
          }}
        >
          {part.slice(1, -1)}
        </Box>
      );
    }
    if (part.startsWith("@") && part.length > 2) {
      const uname = part.slice(1);
      return (
        <Chip
          key={key}
          label={part}
          size="small"
          clickable={Boolean(onMentionClick)}
          onClick={(e) => {
            if (onMentionClick) {
              e.stopPropagation();
              onMentionClick(uname);
            }
          }}
          sx={{
            height: 20,
            fontSize: "0.82em",
            fontWeight: 700,
            color: isDark ? "#86EFAC" : "#166534",
            bgcolor: isDark ? "rgba(75,155,112,0.22)" : "rgba(35,107,74,0.12)",
            "& .MuiChip-label": { px: 0.75 },
            verticalAlign: "baseline",
          }}
        />
      );
    }
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: isDark ? "#6EE7B7" : "#166534",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

/**
 * Splits fenced ```code``` blocks cleanly and renders XSS-safe formatted message elements.
 */
export function parseMessageSegments(text) {
  const input = String(text || "");
  const segments = [];
  const fenceRe = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = fenceRe.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "code", content: match[2].replace(/\n$/, "") });
    lastIndex = fenceRe.lastIndex;
  }
  if (lastIndex < input.length) {
    segments.push({ type: "text", content: input.slice(lastIndex) });
  }
  return segments;
}

export const FormattedMessageContent = ({ content, fontSize = 15, isDark = false, onMentionClick }) => {
  const segments = parseMessageSegments(content);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
      {segments.map((seg, i) => {
        if (seg.type === "code") {
          return (
            <Box
              key={`code-${i}`}
              onTouchStart={(e) => e.stopPropagation()}
              sx={{
                position: "relative",
                bgcolor: isDark ? "#111613" : "#1E2420",
                color: "#E5EFE8",
                borderRadius: 1.5,
                p: 1.1,
                pr: 4,
                fontFamily: "monospace",
                fontSize: "0.82rem",
                overflowX: "auto",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Typography
                variant="caption"
                sx={{ display: "block", color: "#86EFAC", fontSize: "0.66rem", mb: 0.4, textTransform: "uppercase" }}
              >
                {seg.lang}
              </Typography>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{seg.content}</pre>
              <Tooltip title="Copy code">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(seg.content);
                    toast.success("Code copied");
                  }}
                  sx={{ position: "absolute", top: 4, right: 4, color: "#9CA3AF" }}
                >
                  <CopyIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        }

        return (
          <Typography
            key={`txt-${i}`}
            sx={{
              fontSize: `${fontSize}px`,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              lineHeight: 1.45,
              color: isDark ? "#F1F3F0" : "#202421",
            }}
          >
            {renderInlineTokens(seg.content, { isDark, onMentionClick, keyPrefix: `seg-${i}` })}
          </Typography>
        );
      })}
    </Box>
  );
};

