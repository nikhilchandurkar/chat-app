import React from 'react'
import { styled } from '@mui/system';
import { Link as LinkComponent } from "react-router-dom";

// Styled component for visually hidden input
export const VisuallyHiddenInput = styled("input")({
    border: 0,
    clip: "rect(0 0 0 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",  // Fixed typo from "whitespaces" to "whiteSpace"
    width: 1
});

// Styled component for Link with hover effect
export const Link = styled(LinkComponent)`
  text-decoration: none;
  color: black;
  padding: 1rem;
  &:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }
`;

// Styled component for custom input box with specific styles
export const InputBox = styled("input")`
  width: 200%;
  height: 100%;
  border: none;
  outline: none;
  padding: 0 3rem;
  border-radius: 1.5rem;
`;

