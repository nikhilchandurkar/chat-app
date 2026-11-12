import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon, Delete as RemoveIcon, Poll as PollIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import { useCreatePollMutation } from "../../redux/api/api";

const CreatePollDialog = ({ open, onClose, chatId }) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [createPoll, { isLoading }] = useCreatePollMutation();

  const handleOptionChange = (idx, val) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  };

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (idx) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      toast.error("Enter a question and at least 2 options.");
      return;
    }
    try {
      await createPoll({ chatId, question: question.trim(), options: cleanOptions, allowMultiple }).unwrap();
      toast.success("Poll created");
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      onClose();
    } catch (err) {
      toast.error(err?.data?.message || "Failed to create poll");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PollIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>Create Poll</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack component="form" onSubmit={handleSubmit} spacing={1.5} pt={0.5}>
          <TextField
            label="Poll Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            fullWidth
            autoFocus
            size="small"
          />
          {options.map((opt, idx) => (
            <Stack key={idx} direction="row" spacing={0.5} alignItems="center">
              <TextField
                label={`Option ${idx + 1}`}
                value={opt}
                onChange={(e) => handleOptionChange(idx, e.target.value)}
                fullWidth
                size="small"
              />
              {options.length > 2 && (
                <IconButton size="small" color="error" onClick={() => handleRemoveOption(idx)}>
                  <RemoveIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          ))}
          {options.length < 6 && (
            <Button size="small" startIcon={<AddIcon />} onClick={handleAddOption} sx={{ alignSelf: "flex-start" }}>
              Add Option
            </Button>
          )}
          <FormControlLabel
            control={<Switch checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />}
            label="Allow multiple selections"
          />
          <Button type="submit" variant="contained" disabled={isLoading} fullWidth sx={{ borderRadius: 2 }}>
            {isLoading ? "Sending..." : "Post Poll"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePollDialog;

