import { createSlice } from "@reduxjs/toolkit"; 

const initialState = {
  user: null,
  token: null,       // JWT access token – used by WebSocket provider
  isAdmin: false,
  loader: true,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    userExists: (state, action) => {
      state.user = action.payload.user ?? action.payload;
      // If the server returned a token in the response body, persist it
      if (action.payload.token) {
        state.token = action.payload.token;
      }
      state.loader = false;
    },
    userNotExists: (state) => {
      state.user = null;
      state.token = null;
      state.loader = false;
    },
    tokenUpdated: (state, action) => {
      state.token = action.payload;
    },
  },
});

export const { userExists, userNotExists, tokenUpdated } = authSlice.actions;
export default authSlice;
