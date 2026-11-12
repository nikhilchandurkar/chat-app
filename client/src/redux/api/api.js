import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { server } from "../../constants/config";

const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: `${server}/api/v1/`,
    prepareHeaders: (headers) => {
      const token =
        localStorage.getItem("chitChat-Token") ||
        localStorage.getItem("access_token");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ["Chat", "User", "Message", "Starred", "Status"],

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
      invalidatesTags: ["Chat", "User"],
    }),

    getUserProfile: builder.query({
      query: (userId) => ({
        url: `user/profile/${userId}`,
        credentials: "include",
      }),
      providesTags: ["User"],
    }),

    createDirectChat: builder.mutation({
      query: (userId) => ({
        url: "chat/direct",
        method: "POST",
        credentials: "include",
        body: { userId },
      }),
      invalidatesTags: ["Chat"],
    }),

    blockUser: builder.mutation({
      query: (userId) => ({
        url: `user/block/${userId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["User", "Chat"],
    }),

    unblockUser: builder.mutation({
      query: (userId) => ({
        url: `user/block/${userId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: ["User", "Chat"],
    }),

    reportUser: builder.mutation({
      query: ({ userId, reason }) => ({
        url: "user/report",
        method: "POST",
        credentials: "include",
        body: { userId, reason },
      }),
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

    clearChat: builder.mutation({
      query: (chatId) => ({
        url: `chat/clear/${chatId}`,
        method: "POST",
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
        body: { emoji, reaction: emoji },
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
      query: ({ chatId, q = "", page = 1, senderId = "", fuzzy = true }) => ({
        url: `message/search/${chatId}?q=${encodeURIComponent(q)}&page=${page}&fuzzy=${fuzzy}${senderId ? `&senderId=${encodeURIComponent(senderId)}` : ""}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    globalSearchMessages: builder.query({
      query: ({ q = "", page = 1, chatId = "", fuzzy = true }) => ({
        url: `message/search-all?q=${encodeURIComponent(q)}&page=${page}&fuzzy=${fuzzy}${chatId ? `&chatId=${encodeURIComponent(chatId)}` : ""}`,
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

    updateGroupModeration: builder.mutation({
      query: ({ chatId, slow_mode_seconds, require_join_approval }) => ({
        url: `chat/${chatId}/moderation`,
        method: "PUT",
        credentials: "include",
        body: {
          ...(slow_mode_seconds !== undefined ? { slow_mode_seconds } : {}),
          ...(require_join_approval !== undefined ? { require_join_approval } : {}),
        },
      }),
      invalidatesTags: ["Chat"],
    }),

    getGroupJoinRequests: builder.query({
      query: (chatId) => ({
        url: `chat/${chatId}/join-requests`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    reviewJoinRequest: builder.mutation({
      query: ({ requestId, approve }) => ({
        url: `chat/join-requests/${requestId}/review`,
        method: "POST",
        credentials: "include",
        body: { approve },
      }),
      invalidatesTags: ["Chat"],
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

    deleteMessageForMe: builder.mutation({
      query: (messageId) => ({
        url: `message/${messageId}/delete-for-me`,
        method: "POST",
        credentials: "include",
      }),
    }),

    createPoll: builder.mutation({
      query: (data) => ({
        url: "message/poll/create",
        method: "POST",
        credentials: "include",
        body: data,
      }),
    }),

    votePoll: builder.mutation({
      query: ({ messageId, optionId }) => ({
        url: `message/poll/${messageId}/vote`,
        method: "POST",
        credentials: "include",
        body: { optionId },
      }),
    }),

    getMessageReceipts: builder.query({
      query: (messageId) => ({
        url: `message/${messageId}/receipts`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    togglePinChat: builder.mutation({
      query: (chatId) => ({
        url: `chat/pin/${chatId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    toggleMuteChat: builder.mutation({
      query: (chatId) => ({
        url: `chat/mute/${chatId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    toggleArchiveChat: builder.mutation({
      query: (chatId) => ({
        url: `chat/archive/${chatId}`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    updateEphemeralTtl: builder.mutation({
      query: ({ chatId, ephemeral_ttl }) => ({
        url: `chat/${chatId}/ephemeral`,
        method: "POST",
        credentials: "include",
        body: { ephemeral_ttl },
      }),
      invalidatesTags: ["Chat"],
    }),

    generateInviteLink: builder.mutation({
      query: ({ chatId, max_uses = 25, expiry_days = 7 }) => ({
        url: `chat/${chatId}/invite`,
        method: "POST",
        credentials: "include",
        body: { max_uses, expiry_days },
      }),
    }),

    inspectInviteLink: builder.query({
      query: (token) => ({
        url: `chat/invite/${token}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    acceptInviteLink: builder.mutation({
      query: (token) => ({
        url: `chat/invite/${token}/accept`,
        method: "POST",
        credentials: "include",
      }),
      invalidatesTags: ["Chat"],
    }),

    revokeInviteLink: builder.mutation({
      query: (inviteId) => ({
        url: `chat/invite/revoke/${inviteId}`,
        method: "DELETE",
        credentials: "include",
      }),
    }),

    getBlockedUsers: builder.query({
      query: () => ({
        url: "user/blocked",
        credentials: "include",
      }),
      providesTags: ["User"],
    }),

    getNotificationPrefs: builder.query({
      query: () => ({
        url: "notifications/preferences",
        credentials: "include",
      }),
    }),

    updateNotificationPrefs: builder.mutation({
      query: (data) => ({
        url: "notifications/preferences",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
    }),

    getStatusFeed: builder.query({
      query: () => ({
        url: "status/feed",
        credentials: "include",
      }),
      providesTags: ["Status"],
    }),

    getMyStatuses: builder.query({
      query: () => ({
        url: "status/my",
        credentials: "include",
      }),
      providesTags: ["Status"],
    }),

    createStatus: builder.mutation({
      query: (data) => ({
        url: "status/",
        method: "POST",
        credentials: "include",
        body: data,
      }),
      invalidatesTags: ["Status"],
    }),

    deleteStatus: builder.mutation({
      query: (statusId) => ({
        url: `status/${statusId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: ["Status"],
    }),

    recordStatusView: builder.mutation({
      query: (statusId) => ({
        url: `status/${statusId}/view`,
        method: "POST",
        credentials: "include",
      }),
    }),

    getStatusViewers: builder.query({
      query: (statusId) => ({
        url: `status/${statusId}/viewers`,
        credentials: "include",
      }),
      keepUnusedDataFor: 0,
    }),

    reactStatus: builder.mutation({
      query: ({ statusId, reaction }) => ({
        url: `status/${statusId}/react`,
        method: "POST",
        credentials: "include",
        body: { reaction },
      }),
      invalidatesTags: ["Status"],
    }),

    getUserE2eeKey: builder.query({
      query: (userId) => ({
        url: `user/e2ee/key/${userId}`,
        credentials: "include",
      }),
      keepUnusedDataFor: 60,
    }),

    publishE2eeKey: builder.mutation({
      query: (data) => ({
        url: "user/e2ee/key",
        method: "PUT",
        credentials: "include",
        body: data,
      }),
      invalidatesTags: ["User"],
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
  useClearChatMutation,
  useLeaveGroupMutation,
  useUpdateProfileMutation,
  useDeleteProfileMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useReactMessageMutation,
  useForwardMessageMutation,
  useLazySearchMessagesQuery,
  useLazyGlobalSearchMessagesQuery,
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
  useUpdateGroupModerationMutation,
  useGetGroupJoinRequestsQuery,
  useReviewJoinRequestMutation,
  useAddAdminMutation,
  useRemoveAdminMutation,
  useGetUserProfileQuery,
  useCreateDirectChatMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
  useReportUserMutation,
  useDeleteMessageForMeMutation,
  useCreatePollMutation,
  useVotePollMutation,
  useLazyGetMessageReceiptsQuery,
  useTogglePinChatMutation,
  useToggleMuteChatMutation,
  useToggleArchiveChatMutation,
  useUpdateEphemeralTtlMutation,
  useGenerateInviteLinkMutation,
  useInspectInviteLinkQuery,
  useAcceptInviteLinkMutation,
  useRevokeInviteLinkMutation,
  useGetBlockedUsersQuery,
  useGetNotificationPrefsQuery,
  useUpdateNotificationPrefsMutation,
  useGetStatusFeedQuery,
  useGetMyStatusesQuery,
  useCreateStatusMutation,
  useDeleteStatusMutation,
  useRecordStatusViewMutation,
  useLazyGetStatusViewersQuery,
  useReactStatusMutation,
  useGetUserE2eeKeyQuery,
  usePublishE2eeKeyMutation,
} = api;
