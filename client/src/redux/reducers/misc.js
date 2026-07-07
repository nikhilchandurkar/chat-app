import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  themeMode: localStorage.getItem("themeMode") || "light",
  fontFamily: localStorage.getItem("fontFamily") || "Inter",
  isNewGroup: false,
  isAddMember: false,
  isNotification: false,
  isMobile: false,
  isMobileProfile: false,
  isSearch: false,
  isFileMenu: false,
  isDeleteMenu: false,
  uploadingLoader: false,
  selectedDeleteChat: {
    chatId: "",
    groupChat: false,
  },
  notificationCount: 0,
  activeChatId: null,
};

const miscSlice = createSlice({
  name: "misc",
  initialState,
  reducers: {
    setIsNewGroup: (state, action) => {
      state.isNewGroup = action.payload;
    },
    setIsAddMember: (state, action) => {
      state.isAddMember = action.payload;
    },
    setIsNotification: (state, action) => {
      state.isNotification = action.payload;
    },
    setIsMobile: (state, action) => {
      state.isMobile = action.payload;
    },
    setIsMobileProfile: (state, action) => {
      state.isMobileProfile = action.payload;
    },
    setIsSearch: (state, action) => {
      state.isSearch = action.payload;
    },
    setIsFileMenu: (state, action) => {
      state.isFileMenu = action.payload;
    },
    setIsDeleteMenu: (state, action) => {
      state.isDeleteMenu = action.payload;
    },
    setUploadingLoader: (state, action) => {
      state.uploadingLoader = action.payload;
    },
    setSelectedDeleteChat: (state, action) => {
      state.selectedDeleteChat = action.payload;
    },
    incrementNotificationCount: (state) => {
      state.notificationCount += 1;
    },
    resetNotificationCount: (state) => {
      state.notificationCount = 0;
    },
    setNotificationCount: (state, action) => {
      state.notificationCount = action.payload;
    },
    setActiveChatId: (state, action) => {
      state.activeChatId = action.payload;
    },
    toggleTheme: (state) => {
      state.themeMode = state.themeMode === "light" ? "dark" : "light";
      localStorage.setItem("themeMode", state.themeMode);
    },
    setFontFamily: (state, action) => {
      state.fontFamily = action.payload;
      localStorage.setItem("fontFamily", action.payload);
    }
  },
});

export default miscSlice;
export const {
  setIsNewGroup,
  setIsAddMember,
  setIsNotification,
  setIsMobile,
  setIsMobileProfile,
  setIsSearch,
  setIsFileMenu,
  setIsDeleteMenu,
  setUploadingLoader,
  setSelectedDeleteChat,
  incrementNotificationCount,
  resetNotificationCount,
  setNotificationCount,
  setActiveChatId,
  toggleTheme,
  setFontFamily,
} = miscSlice.actions;
