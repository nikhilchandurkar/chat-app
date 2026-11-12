# ChitChat — Features, Slash Commands & Hidden Controls Guide

A quick manual covering all interactive features, power-user shortcuts, gestures, privacy controls, and hidden/feature-flagged capabilities built into ChitChat.

---

## 1. Hidden & Feature-Flagged Features

### Walkie-Talkie Push-to-Talk (Currently Hidden in UI)
- **Status:** Implemented end-to-end (`walkie.signal` WebSocket relay in `django_server/apps/realtime/consumers.py`, audio chirp synthesizer in `client/src/utils/feedback.js`, and PTT handlers in `client/src/pages/Chat.jsx`), but hidden from the composer & incoming banner right now via:
  - File: `client/src/pages/Chat.jsx`
  - Flag: `const ENABLE_WALKIE_TALKIE = false;`
- **How to enable later:** Change `ENABLE_WALKIE_TALKIE` to `true` and rebuild (`npm run build:ci`). When enabled, holding the radio button on an empty composer transmits short live audio bursts on release.

### Offline Outbox / Bluetooth Mesh UI (Kept Hidden)
- **Status:** `client/src/components/dialogs/ConnectivityOfflineDialog.jsx` stays unmounted/hidden from the header until offline localStorage queuing is wired to automatic `/api/v1/sync/delta` flushing.

---

## 2. Secret Slash Commands & Celebration Triggers

Type any of these inside any DM or Group message box to trigger full-screen Framer Motion animations & synthesized Web Audio chimes (controllable via Appearance Settings -> Message Effects):

| Command / Text | Triggered Effect |
| --- | --- |
| `/confetti` or `/party` | Full-screen falling multi-color confetti + festive chord |
| `/fireworks` or `GG` / `cheers` | Expanded starburst fireworks particles |
| `/hearts` or `I love you` | Floating rising heart stream across the screen |
| `Happy Birthday`, `HBD`, `Congrats` | Confetti celebration shower + sound |
| `/remind in 15m <text>` | Schedules a reminder message in N minutes (also accepts `h`/`hr`/`hours`) |
| `/remind at 6pm <text>` | Schedules a reminder message for that clock time (rolls to next day if passed) |

---

## 3. Touch, Mobile & Desktop Gestures (Hidden Power Shortcuts)

- **Swipe Right on a message bubble:** Instantly quote-reply to that message.
- **Swipe Left on a message bubble:** Instant ❤️ heart reaction.
- **Double-tap (mobile or desktop) on a message:** Instant ❤️ reaction.
- **Long-press / Hold any message (mobile):** Opens **Hold Spotlight** with quick reaction pills, **Reply**, **Reply in Thread**, **Copy**, **Star**, **Forward** (disabled for View-Once media), **View Profile**, **Pin** (admin), **Edit**, and **Delete for Me / Everyone**.
- **Right-click a message (desktop):** Context menu with **Reply**, **Reply in Thread**, **Seen By** (timestamped member read receipts), and **Delete**.
- **Edge-swipe from left screen border (mobile inside chat):** Slides open the Conversations list drawer.
- **Shake Phone (`DeviceMotion`):** Triggers your chosen Shake Action (**Party Emoji Wave**, **Jump to Latest**, or **Toggle Dark/Light Theme**). Customize in **Profile / Header -> Appearance Settings**.
- **Tap any avatar, sender name, group member, or DM header:** Opens full interactive **User Profile Dialog** (bio, status, Start DM, Friend Request, Block/Unblock, Report).

---

## 4. Disappearing Messages & View-Once Privacy

### Seen-Triggered Auto-Delete (`Chat Details Drawer -> Disappearing Messages`)
- Open any chat header -> tap **Disappearing Messages**:
  - **Right after seen (~8s):** Message has no expiry until the recipient actually sees/reads it, then deletes automatically ~8 seconds later.
  - **2 minutes after seen:** Countdown starts only once viewed, showing a live `⏱ 1m 55s` badge before disappearing from both chat and server queries.
  - **Fixed timers (`30s`, `1m`, `2m`, `5m`, `1h`, `24h`, `7d`):** Count down from message creation.

### View-Once Photos, Videos & Voice Notes
- Open **📎 Attach -> Toggle "Send as View-Once"**, OR in **Record Voice Note**, tap **🔥 View Once**.
- Recipients can open it **once** inside an un-saveable modal (downloads & forwarding disabled). Closing it permanently redacts the media URL (`410 Gone` on repeat requests) and updates the sender's bubble to **Opened**.

---

## 5. Interactive Room Features (`📎 Attach` Menu & Chat Header)

- **16 Multiplayer In-Chat Mini-Games (`Play Mini-Game`):**
  - **Quiz Battle (Dynamic):** 5-round quiz fetching fresh dynamic questions (`opentdb.com` + shuffled fallback & math generator) by Category & Difficulty, OR switch on **Custom Question** to write your own quiz.
  - **Board & Strategy:** Tic-Tac-Toe, Connect 4, Dots & Boxes (3x3), Mini Reversi (6x6), Minesweeper (4x4), Memory Match.
  - **Quick Party & Speed:** Rock Paper Scissors (secret lock), Word Guess (custom or random word), Dice Duel, Coin Flip Streak, High-Low (1–100), 21 Blackjack Duel, Even/Odd Bet, Emoji Odd-One-Out, Math Sprint.
- **Listen / Watch Together (`Headphones` icon in Header or `📎 Attach`):**
  - Paste any YouTube link/ID or pick **Ambient Focus Synth / Lo-Fi presets**. Other chat members see a live **Join Together** button to sync play/pause and send floating reactions.
- **Live Collaborative Whiteboard (`📎 Attach -> Live Whiteboard Doodle`):**
  - Opening the whiteboard invites everyone in the chat via a **Join Canvas** banner to draw together live (`whiteboard.sync`), then export & post the finished sketch as an image.
- **Group `#Topics` & Side Threads:**
  - Use `# All` / `+ Topic` bar under group headers to filter messages by channel tag.
  - Use **Reply in Thread** on any message to move follow-up chatter into a focused side drawer without cluttering the main feed.
- **Live Location Sharing (`📎 Attach -> Share Live Location`):**
  - Share live GPS coordinates for **15m** or **1h** with an ETA countdown, map viewer link, and **Stop** button.

---

## 6. Clear Chat, Fuzzy Search & Organization

- **Per-User Clear Chat (`⋮ -> Clear Chat (For Me)` or `Chat Header -> Settings`):** Clears your message history locally & on your synced devices without affecting the other user, while still letting future messages arrive normally.
- **Per-User DM Delete (`⋮ -> Delete Chat (For Me)`):** Removes and clears a DM only from your chat list (both creator & recipient can use it independently; reopens automatically if they message you again).
- **Fuzzy Similarity Search (`Search icon` inside any chat + User Search):** Tolerates typos and partial words (`"meetng tomorw"` matches `"meeting tomorrow"` with a similarity `%` score), plus lets you filter by **sender chip** in 2–3+ member groups.
- **Chat List Filters, Saved Drafts & Wallpapers:** Filter chats with **All | Unread | Groups | Archived** chips; unfinished messages auto-save per chat (`📝 Draft: ...`); customize chat backgrounds under **Chat Header -> Settings -> Chat Wallpaper**.

---

## 7. Stories, Formatting & Security

- **24-Hour Stories & Reactions Viewer:** Post text cards, photos (`.jpg`, `.png`, `.gif`, `.webp`, `.jfif`, `.heic`, `.avif`), or videos via **Gallery** or **Camera**. Viewing or opening **Viewers & Reactions** shows live reaction emoji counts and who reacted/viewed.
- **Rich Composer:** Supports `**bold**`, `*italic*`, `` `code` ``, fenced ` ```language ` blocks, `@mentions` in groups, **Polls**, and **GIF Studio** (draw frames & encode looping `GIF89a`).
- **Client-Side E2EE (`Lock` icon in DM header):** Enables per-DM ECDH P-256 + AES-GCM encryption (`::e2ee:v1::`).
- **Mobile Privacy Shield & App Lock:** Native Android `FLAG_SECURE` blocks screenshots/recent-app thumbnails, plus configurable 4–6 digit PIN & fingerprint/device unlock in **Profile / Security**.

