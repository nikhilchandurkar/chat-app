import React, { useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { ContentCopy as CopyIcon, Check as CheckIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import { triggerHaptic } from "./feedback";

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
      const isAllMention = uname.toLowerCase() === "all" || uname.toLowerCase() === "everyone";
      return (
        <Chip
          key={key}
          label={part}
          size="small"
          clickable={Boolean(onMentionClick) && !isAllMention}
          onClick={(e) => {
            if (onMentionClick && !isAllMention) {
              e.stopPropagation();
              onMentionClick(uname);
            }
          }}
          sx={{
            height: 20,
            fontSize: "0.82em",
            fontWeight: 700,
            color: isAllMention ? (isDark ? "#FDE68A" : "#92400E") : isDark ? "#86EFAC" : "#166534",
            bgcolor: isAllMention
              ? isDark
                ? "rgba(245,158,11,0.24)"
                : "rgba(245,158,11,0.16)"
              : isDark
              ? "rgba(75,155,112,0.22)"
              : "rgba(35,107,74,0.12)",
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

const CodeBlock = ({ lang, content, isDark }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(content);
      setCopied(true);
      triggerHaptic(10);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <Box
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        position: "relative",
        bgcolor: isDark ? "#111613" : "#1B221E",
        color: "#E5EFE8",
        borderRadius: 2,
        p: 1.25,
        pr: 4.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: "0.82rem",
        overflowX: "auto",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            display: "inline-block",
            color: "#6EE7B7",
            fontSize: "0.68rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {lang || "code"}
        </Typography>
      </Box>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>{content}</pre>
      <Tooltip title={copied ? "Copied!" : "Copy code"}>
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            color: copied ? "#10B981" : "#9CA3AF",
            transition: "all 0.2s ease",
            "&:hover": { color: "#FFFFFF", bgcolor: "rgba(255,255,255,0.1)" },
          }}
        >
          {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <CopyIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export const FormattedMessageContent = ({ content, fontSize = 15, isDark = false, onMentionClick }) => {
  const segments = parseMessageSegments(content);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
      {segments.map((seg, i) => {
        if (seg.type === "code") {
          return <CodeBlock key={`code-${i}`} lang={seg.lang} content={seg.content} isDark={isDark} />;
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

