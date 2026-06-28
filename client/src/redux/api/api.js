import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { server } from "../../constants/config";

const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: `${server}/api/v1/` }),
  tagTypes: ["Chat", "User", "Message"],

  endpoints: (builder) => ({
    myChats: builder.query({
      query: () => ({
        url: "chat/my",
        credentials: "include",
      }),
      providesTags: ["Chat"],
    }),

    searchUser: builder.query({
      query: (name) => ({
        url: `user/search?name=${name}`,
        credentials: "include",
      }),
      providesTags: ["User"],
    }),

    sendFriendRequest: builder.mutation({
      query: (data) => ({
        url: "user/sendrequest",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
      invalidatesTags: ["User"],
    }),

    getNotifications: builder.query({
      query: () => ({
        url: `user/notifications`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    acceptFriendRequest: builder.mutation({
      query: (data) => ({
        url: "user/acceptrequest",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
      invalidatesTags: ["Chat"],
    }),

    chatDetails: builder.query({
      query: ({ chatId, populate = false }) => {
        let url = `chat/${chatId}`;
        if (populate) url += "?populate=true";

        return {
          url,
          credentials: "include",
        };
      },
      providesTags: ["Chat"],
    }),

    getMessages: builder.query({
      query: ({ chatId, page }) => ({
        url: `chat/message/${chatId}?page=${page}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    sendAttachments: builder.mutation({
      query: (data) => ({
        url: "chat/message",
        method: "POST",
        credentials: "include",
        body: data,
      }),
    }),

    myGroups: builder.query({
      query: () => ({
        url: "chat/my/groups",
        credentials: "include",
      }),
      providesTags: ["Chat"],
    }),

    availableFriends: builder.query({
      query: (chatId) => {
        let url = `user/friends`;
        if (chatId) url += `?chatId=${chatId}`;

        return {
          url,
          credentials: "include",
        };
      },
      providesTags: ["Chat"],
    }),

    newGroup: builder.mutation({
      query: ({ name, members }) => ({
        url: "chat/new",
        method: "POST",
        credentials: "include",
        body: { name, members },
      }),
      invalidatesTags: ["Chat"],
    }),

    renameGroup: builder.mutation({
      query: ({ chatId, formData }) => ({
        url: `chat/${chatId}`,
        method: "PUT",
        credentials: "include",
        body: formData,
      }),
      invalidatesTags: ["Chat"],
    }),

    removeGroupMember: builder.mutation({
      query: ({ chatId, userId }) => ({
        url: `chat/removemember`,
        method: "PUT",
        credentials: "include",
        body: { chatId, userId },
      }),
      invalidatesTags: ["Chat"],
    }),

    addGroupMembers: builder.mutation({
      query: ({ members, chatId }) => ({
        url: `chat/addmembers`,
        method: "PUT",
        credentials: "include",
        body: { members, chatId },
      }),
      invalidatesTags: ["Chat"],
    }),

    deleteChat: builder.mutation({
      query: (chatId) => ({
        url: `chat/${chatId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    leaveGroup: builder.mutation({
      query: (chatId) => ({
        url: `chat/leave/${chatId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    updateProfile: builder.mutation({
      query: (data) => ({
        url: "user/profile",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
      invalidatesTags: ["User"],
    }),

    deleteProfile: builder.mutation({
      query: () => ({
        url: "user/profile",
        method: "DELETE",
        credentials: "include",
      }),
    }),

    editMessage: builder.mutation({
      query: ({ messageId, content }) => ({
        url: `message/${messageId}`,
        method: "PATCH",
        credentials: "include",
        body: { content },
      }),
    }),

    deleteMessage: builder.mutation({
      query: (messageId) => ({
        url: `message/${messageId}`,
        method: "DELETE",
        credentials: "include",
      }),
    }),

    reactMessage: builder.mutation({
      query: ({ messageId, emoji }) => ({
        url: `message/react/${messageId}`,
        method: "POST",
        credentials: "include",
        body: { emoji },
      }),
    }),

    forwardMessage: builder.mutation({
      query: ({ messageId, targetChatIds }) => ({
        url: `message/forward`,
        method: "POST",
        credentials: "include",
        body: { messageId, targetChatIds },
      }),
    }),

    searchMessages: builder.query({
      query: ({ chatId, q, page = 1 }) => ({
        url: `message/search/${chatId}?q=${encodeURIComponent(q)}&page=${page}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    getChatMedia: builder.query({
      query: ({ chatId, page = 1 }) => ({
        url: `message/media/${chatId}?page=${page}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    getLinkPreview: builder.query({
      query: (url) => ({
        url: `preview?url=${encodeURIComponent(url)}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 3600,
    }),

    changePassword: builder.mutation({
      query: (data) => ({
        url: "user/password",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
    }),
    updateStatus: builder.mutation({
      query: (data) => ({
        url: "user/status",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
    }),

    toggleRestrictMessages: builder.mutation({
      query: (chatId) => ({
        url: `chat/${chatId}/restrict`,
        method: "PUT",
        credentials: "include",
      }),
    }),

    addAdmin: builder.mutation({
      query: (body) => ({
        url: "chat/add-admin",
        method: "POST",
        credentials: "include",
        body,
      }),
    }),

    removeAdmin: builder.mutation({
      query: (body) => ({
        url: "chat/remove-admin",
        method: "POST",
        credentials: "include",
        body,
      }),
    }),

    forgotPassword: builder.mutation({
      query: (data) => ({
        url: "user/forgot-password",
        method: "POST",
        credentials: "include",
        body: data,
      }),
    }),

    updateStatus: builder.mutation({
      query: (data) => ({
        url: "user/status",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
    }),

    updatePrivacy: builder.mutation({
      query: (data) => ({
        url: "user/privacy",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
    }),

    toggleStarMessage: builder.mutation({
      query: (messageId) => ({
        url: `user/star/${messageId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Starred"],
    }),

    getStarredMessages: builder.query({
      query: () => ({
        url: "user/starred",
        credentials: "include",
      }),
      providesTags: ["Starred"],
      keepUnusedDataFor: 0,
    }),

    getPinnedMessages: builder.query({
      query: (chatId) => ({
        url: `chat/${chatId}/pins`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    pinMessage: builder.mutation({
      query: ({ chatId, messageId }) => ({
        url: `chat/${chatId}/pin/${messageId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    unpinMessage: builder.mutation({
      query: ({ chatId, messageId }) => ({
        url: `chat/${chatId}/pin/${messageId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),
  }),
});

export default api;
export const {
  useMyChatsQuery,
  useLazySearchUserQuery,
  useSendFriendRequestMutation,
  useGetNotificationsQuery,
  useAcceptFriendRequestMutation,
  useChatDetailsQuery,
  useGetMessagesQuery,
  useSendAttachmentsMutation,
  useMyGroupsQuery,
  useAvailableFriendsQuery,
  useNewGroupMutation,
  useRenameGroupMutation,
  useRemoveGroupMemberMutation,
  useAddGroupMembersMutation,
  useDeleteChatMutation,
  useLeaveGroupMutation,
  useUpdateProfileMutation,
  useDeleteProfileMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useReactMessageMutation,
  useForwardMessageMutation,
  useLazySearchMessagesQuery,
  useLazyGetChatMediaQuery,
  useGetLinkPreviewQuery,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useUpdateStatusMutation,
  useUpdatePrivacyMutation,
  useToggleStarMessageMutation,
  useGetStarredMessagesQuery,
  useGetPinnedMessagesQuery,
  usePinMessageMutation,
  useUnpinMessageMutation,
  useToggleRestrictMessagesMutation,
  useAddAdminMutation,
  useRemoveAdminMutation,
} = api;
