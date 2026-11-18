/**
 * Slash commands system with auto-suggestions, interactive effects, and action dispatchers.
 */

export const SLASH_COMMANDS = [
  {
    name: "/remind",
    label: "/remind",
    icon: "⏰",
    category: "Utility",
    usage: "/remind in 10m check email",
    description: "Schedule a reminder or future message in this chat",
    type: "dialog_or_inline",
    action: "remind",
  },
  {
    name: "/draw",
    label: "/draw",
    icon: "🎨",
    category: "Creative",
    usage: "/draw",
    description: "Open whiteboard canvas to sketch and send a doodle",
    type: "dialog",
    action: "whiteboard",
  },
  {
    name: "/poll",
    label: "/poll",
    icon: "📊",
    category: "Interactive",
    usage: "/poll",
    description: "Create an interactive live voting poll for everyone",
    type: "dialog",
    action: "poll",
  },
  {
    name: "/game",
    label: "/game",
    icon: "🎮",
    category: "Interactive",
    usage: "/game",
    description: "Launch interactive group game (Trivia, Word Guess, Reaction)",
    type: "dialog",
    action: "game",
  },
  {
    name: "/todo",
    label: "/todo",
    icon: "✅",
    category: "Widget",
    usage: "/todo Project Checklist | item 1, item 2",
    description: "Create an interactive checklist card with checkable boxes",
    type: "dialog",
    action: "todo",
  },
  {
    name: "/spin",
    label: "/spin",
    icon: "🎡",
    category: "Widget",
    usage: "/spin Where to eat? | Pizza, Sushi, Tacos",
    description: "Create an interactive lucky wheel roulette card",
    type: "dialog",
    action: "spin",
  },
  {
    name: "/countdown",
    label: "/countdown",
    icon: "⏳",
    category: "Widget",
    usage: "/countdown Launch Day",
    description: "Post a real-time countdown clock to a target date & time",
    type: "dialog",
    action: "countdown",
  },
  {
    name: "/shrug",
    label: "/shrug",
    icon: "¯\\_(ツ)_/¯",
    category: "Fun",
    usage: "/shrug [optional message]",
    description: "Append classic shrug emoticon ¯\\_(ツ)_/¯",
    type: "macro",
    macro: "¯\\_(ツ)_/¯",
  },
  {
    name: "/flip",
    label: "/flip",
    icon: "(╯°□°)╯︵ ┻━┻",
    category: "Fun",
    usage: "/flip",
    description: "Insert table flip emoticon (╯°□°)╯︵ ┻━┻",
    type: "macro",
    macro: "(╯°□°)╯︵ ┻━┻",
  },
  {
    name: "/unflip",
    label: "/unflip",
    icon: "┬─┬ノ( º _ ºノ)",
    category: "Fun",
    usage: "/unflip",
    description: "Put table back politely ┬─┬ノ( º _ ºノ)",
    type: "macro",
    macro: "┬─┬ノ( º _ ºノ)",
  },
  {
    name: "/confetti",
    label: "/confetti",
    icon: "🎉",
    category: "Effects",
    usage: "/confetti [message]",
    description: "Celebrate with colorful confetti burst animation",
    type: "effect",
    effectEmoji: "🎉",
    effectMode: "confetti",
  },
  {
    name: "/fire",
    label: "/fire",
    icon: "🔥",
    category: "Effects",
    usage: "/fire [message]",
    description: "Trigger fiery animated flame wave",
    type: "effect",
    effectEmoji: "🔥",
    effectMode: "fire",
  },
  {
    name: "/party",
    label: "/party",
    icon: "✨",
    category: "Effects",
    usage: "/party [message]",
    description: "Launch party sparkle burst across the chat",
    type: "effect",
    effectEmoji: "✨",
    effectMode: "sparkles",
  },
  {
    name: "/search",
    label: "/search",
    icon: "🔍",
    category: "Action",
    usage: "/search",
    description: "Search messages and media inside this conversation",
    type: "action",
    action: "search",
  },
  {
    name: "/clear",
    label: "/clear",
    icon: "🧹",
    category: "Action",
    usage: "/clear",
    description: "Clear message history locally or for everyone",
    type: "action",
    action: "clear",
  },
  {
    name: "/pin",
    label: "/pin",
    icon: "📌",
    category: "Action",
    usage: "/pin",
    description: "Pin or unpin this conversation to the top of chat list",
    type: "action",
    action: "pin",
  },
  {
    name: "/mute",
    label: "/mute",
    icon: "🔕",
    category: "Action",
    usage: "/mute",
    description: "Toggle notifications mute or snooze for this chat",
    type: "action",
    action: "mute",
  },
  {
    name: "/export",
    label: "/export",
    icon: "📥",
    category: "Action",
    usage: "/export",
    description: "Export full chat conversation history to file",
    type: "action",
    action: "export",
  },
];

/**
 * Parses user input to determine if a slash command prefix is currently active.
 * Returns the matching query string if active, or null if not.
 */
export function getSlashCommandQuery(text) {
  if (typeof text !== "string") return null;
  const match = /^\/([a-zA-Z0-9_-]*)$/.exec(text.trim());
  if (match) {
    return match[1].toLowerCase();
  }
  return null;
}

/**
 * Filters the available commands by the user's typed search query.
 */
export function filterSlashCommands(query = "") {
  const clean = String(query || "").toLowerCase();
  if (!clean) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => {
    return (
      cmd.name.toLowerCase().includes(clean) ||
      cmd.category.toLowerCase().includes(clean) ||
      cmd.description.toLowerCase().includes(clean)
    );
  });
}
