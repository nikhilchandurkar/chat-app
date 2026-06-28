import { useFileHandler, useInputValidation, useStrongPassword } from "6pp";
import { CameraAlt as CameraAltIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import {
  Avatar, Button, Container, IconButton, InputAdornment,
  Paper, Stack, TextField, Typography, Link as MuiLink,
} from "@mui/material";
import axios from "axios";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { VisuallyHiddenInput } from "../components/styles/StyledComponents.jsx";
import { server } from "../constants/config.js";
import { userExists } from "../redux/reducers/auth.js";
import { usernamevalidator } from "../utils/validators.js";

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const toggleLogin = () => setIsLogin((prev) => !prev);

  const name = useInputValidation("");
  const bio = useInputValidation("");
  const email = useInputValidation("");
  const username = useInputValidation("", usernamevalidator);
  const password = useInputValidation("", useStrongPassword);
  const avatar = useFileHandler("single");

  const handleLogin = async (e) => {
    e.preventDefault();
    const toastId = toast.loading("Logging In...");
    setIsLoading(true);
    try {
      const { data } = await axios.post(
        `${server}/api/v1/user/login`,
        { username: username.value, password: password.value },
        { withCredentials: true, headers: { "Content-Type": "application/json" } }
      );
      dispatch(userExists(data.user));
      toast.success(data.message, { id: toastId });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Something Went Wrong", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const toastId = toast.loading("Signing Up...");
    setIsLoading(true);

    const formData = new FormData();
    if (avatar.file) formData.append("avatar", avatar.file);
    formData.append("name", name.value);
    formData.append("bio", bio.value);
    formData.append("email", email.value);
    formData.append("username", username.value);
    formData.append("password", password.value);

    try {
      const { data } = await axios.post(
        `${server}/api/v1/user/newuser`,
        formData,
        { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
      );
      dispatch(userExists(data.user));
      toast.success(data.message, { id: toastId });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Something Went Wrong", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ backgroundImage: "linear-gradient(135deg, rgb(102,126,234) 0%, rgb(118,75,162) 100%)" }}>
      <Container component="main" maxWidth="xs" sx={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Paper elevation={3} sx={{ padding: 4, display: "flex", flexDirection: "column", alignItems: "center", borderRadius: 3 }}>
          {isLogin ? (
            <>
              <Typography variant="h5" fontWeight={700}>Welcome Back </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>Sign in with your username or email</Typography>
              <form style={{ width: "100%", marginTop: "1rem" }} onSubmit={handleLogin}>
                <TextField
                  required fullWidth label="Username or Email" margin="normal" variant="outlined"
                  value={username.value} onChange={username.changeHandler}
                />
                <TextField
                  required fullWidth label="Password" type={showPassword ? "text" : "password"}
                  margin="normal" variant="outlined"
                  value={password.value} onChange={password.changeHandler}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((s) => !s)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Stack direction="row" justifyContent="flex-end" mt={0.5}>
                  <MuiLink component={Link} to="/forgot-password" variant="caption" underline="hover">
                    Forgot Password?
                  </MuiLink>
                </Stack>
                <Button sx={{ marginTop: "1rem" }} variant="contained" color="primary" type="submit" fullWidth disabled={isLoading}>
                  Login
                </Button>
                <Typography textAlign="center" m="1rem">OR</Typography>
                <Button disabled={isLoading} fullWidth variant="text" onClick={toggleLogin}>
                  Sign Up Instead
                </Button>
              </form>
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={700}>Create Account</Typography>
              <form style={{ width: "100%", marginTop: "1rem" }} onSubmit={handleSignUp}>
                <Stack position="relative" width="10rem" margin="auto">
                  <Avatar sx={{ width: "10rem", height: "10rem", objectFit: "contain" }} src={avatar.preview} />
                  <IconButton
                    sx={{ position: "absolute", bottom: "0", right: "0", color: "white", bgcolor: "rgba(0,0,0,0.5)", ":hover": { bgcolor: "rgba(0,0,0,0.7)" } }}
                    component="label"
                  >
                    <CameraAltIcon />
                    <VisuallyHiddenInput type="file" onChange={avatar.changeHandler} />
                  </IconButton>
                </Stack>
                <Typography textAlign="center" variant="caption" color="textSecondary" mb="0.5rem" display="block">
                  Avatar (Optional)
                </Typography>

                <TextField required fullWidth label="Name" margin="normal" variant="outlined" value={name.value} onChange={name.changeHandler} />
                <TextField required fullWidth label="Email" type="email" margin="normal" variant="outlined" value={email.value} onChange={email.changeHandler} />
                <TextField fullWidth label="Bio" margin="normal" variant="outlined" value={bio.value} onChange={bio.changeHandler} />
                <TextField required fullWidth label="Username" margin="normal" variant="outlined" value={username.value} onChange={username.changeHandler} />
                {username.error && <Typography color="error" variant="caption">{username.error}</Typography>}
                <TextField
                  required fullWidth label="Password" type={showPassword ? "text" : "password"}
                  margin="normal" variant="outlined"
                  value={password.value} onChange={password.changeHandler}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((s) => !s)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button sx={{ marginTop: "1rem" }} variant="contained" color="primary" type="submit" fullWidth disabled={isLoading}>
                  Sign Up
                </Button>
                <Typography textAlign="center" m="1rem">OR</Typography>
                <Button disabled={isLoading} fullWidth variant="text" onClick={toggleLogin}>
                  Login Instead
                </Button>
              </form>
            </>
          )}
        </Paper>
      </Container>
    </div>
  );
};

export default Login;