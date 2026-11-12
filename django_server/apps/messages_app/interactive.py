import random
from django.utils import timezone
from django.db import models
from apps.chat.models import ConversationMember
from apps.outbox.services.outbox_service import OutboxService
from .models import Message
from .serializers import MessageSerializer

TRIVIA_BANK = [
    {
        "question": "Which planet has the most confirmed moons in our solar system?",
        "options": ["Jupiter", "Saturn", "Uranus", "Neptune"],
        "answer": 1,
    },
    {
        "question": "What does HTTP status code 418 famously stand for?",
        "options": ["Rate Limited", "I'm a teapot", "Payload Too Large", "Gateway Timeout"],
        "answer": 1,
    },
    {
        "question": "Which programming language introduced async/await first among these?",
        "options": ["JavaScript", "Python", "C#", "Rust"],
        "answer": 2,
    },
    {
        "question": "How many keys are on a standard full-size acoustic piano?",
        "options": ["76", "84", "88", "92"],
        "answer": 2,
    },
    {
        "question": "Which country invented the game of Chess (Chaturanga)?",
        "options": ["India", "Persia", "Greece", "China"],
        "answer": 0,
    },
]

WORD_GUESS_BANK = ["SPARK", "PIXEL", "ORBIT", "CLOUD", "FLAME", "PULSE", "AUDIO", "VIBEZ", "STORM", "CHESS"]


def create_initial_game_state(game_type: str, creator, custom_word: str = "") -> dict:
    cid = str(creator.id)
    cname = creator.name or creator.username
    base = {
        "type": "game",
        "gameType": game_type,
        "creatorId": cid,
        "creatorName": cname,
        "status": "active",
        "winnerId": None,
        "winnerName": "",
        "scores": {cid: 0},
        "players": {cid: cname},
    }

    if game_type == "tictactoe":
        return {
            **base,
            "board": [""] * 9,
            "turnSymbol": "X",
            "xPlayerId": cid,
            "oPlayerId": None,
            "winLine": [],
        }

    if game_type == "rps":
        return {
            **base,
            "round": 1,
            "picks": {},
            "lastOutcome": "",
        }

    if game_type == "connect4":
        return {
            **base,
            "rows": 6,
            "cols": 7,
            "board": [[0] * 7 for _ in range(6)],
            "turnSlot": 1,
            "p1Id": cid,
            "p2Id": None,
        }

    if game_type == "trivia":
        item = random.choice(TRIVIA_BANK)
        return {
            **base,
            "question": item["question"],
            "options": item["options"],
            "correctIndex": item["answer"],
            "answers": {},
        }

    if game_type == "wordguess":
        cleaned = "".join(ch for ch in (custom_word or "").upper() if ch.isalpha())[:8]
        target = cleaned if len(cleaned) >= 4 else random.choice(WORD_GUESS_BANK)
        return {
            **base,
            "wordLength": len(target),
            "targetWord": target,
            "guessed": [],
            "wrongCount": 0,
            "maxWrong": 6,
            "masked": ["_"] * len(target),
        }

    raise ValueError(f"Unsupported game type: {game_type}")


def _check_ttt_winner(board):
    lines = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),
        (0, 3, 6), (1, 4, 7), (2, 5, 8),
        (0, 4, 8), (2, 4, 6),
    ]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a], [a, b, c]
    return None, []


def _check_connect4_winner(board, slot):
    rows, cols = len(board), len(board[0])
    dirs = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for r in range(rows):
        for c in range(cols):
            if board[r][c] != slot:
                continue
            for dr, dc in dirs:
                ok = True
                for step in range(1, 4):
                    nr, nc = r + dr * step, c + dc * step
                    if not (0 <= nr < rows and 0 <= nc < cols and board[nr][nc] == slot):
                        ok = False
                        break
                if ok:
                    return True
    return False


def apply_game_move(game: dict, user, move: dict) -> tuple[dict, str | None]:
    uid = str(user.id)
    uname = user.name or user.username
    game = dict(game)
    players = dict(game.get("players") or {})
    players[uid] = uname
    game["players"] = players
    scores = dict(game.get("scores") or {})
    scores.setdefault(uid, 0)
    game["scores"] = scores

    gtype = game.get("gameType")

    if gtype == "rps" and move.get("action") == "next_round":
        game["status"] = "active"
        game["winnerId"] = None
        game["winnerName"] = ""
        game["picks"] = {}
        game["round"] = int(game.get("round", 1)) + 1
        game["lastOutcome"] = ""
        return game, None

    if game.get("status") == "finished":
        return game, "Game already finished."

    if gtype == "tictactoe":
        idx = int(move.get("index", -1))
        board = list(game.get("board") or [""] * 9)
        if not (0 <= idx < 9) or board[idx]:
            return game, "Invalid or occupied cell."

        turn = game.get("turnSymbol", "X")
        x_id = game.get("xPlayerId")
        o_id = game.get("oPlayerId")

        if turn == "X":
            if uid != x_id:
                return game, "Waiting for Player X's turn."
        else:
            if not o_id and uid != x_id:
                o_id = uid
                game["oPlayerId"] = uid
            elif uid != o_id:
                return game, "Waiting for Player O's turn."

        board[idx] = turn
        game["board"] = board
        win_sym, win_line = _check_ttt_winner(board)
        if win_sym:
            game["status"] = "finished"
            game["winLine"] = win_line
            winner_uid = x_id if win_sym == "X" else o_id
            game["winnerId"] = winner_uid
            game["winnerName"] = players.get(winner_uid, uname)
            scores[winner_uid] = scores.get(winner_uid, 0) + 1
        elif all(cell for cell in board):
            game["status"] = "draw"
            game["winnerName"] = "Draw!"
        else:
            game["turnSymbol"] = "O" if turn == "X" else "X"
        return game, None

    if gtype == "rps":
        choice = str(move.get("choice", "")).lower()
        if choice not in ("rock", "paper", "scissors"):
            return game, "Pick rock, paper, or scissors."
        picks = dict(game.get("picks") or {})
        picks[uid] = choice
        game["picks"] = picks
        if len(picks) >= 2:
            p_ids = list(picks.keys())[:2]
            p1, p2 = p_ids[0], p_ids[1]
            c1, c2 = picks[p1], picks[p2]
            beats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
            game["status"] = "finished"
            if c1 == c2:
                game["winnerId"] = None
                game["winnerName"] = "Tie!"
                game["lastOutcome"] = f"Both picked {c1} — Draw!"
            elif beats[c1] == c2:
                game["winnerId"] = p1
                game["winnerName"] = players.get(p1, "Player 1")
                scores[p1] = scores.get(p1, 0) + 1
                game["lastOutcome"] = f"{game['winnerName']} wins ({c1} beats {c2})!"
            else:
                game["winnerId"] = p2
                game["winnerName"] = players.get(p2, "Player 2")
                scores[p2] = scores.get(p2, 0) + 1
                game["lastOutcome"] = f"{game['winnerName']} wins ({c2} beats {c1})!"
        return game, None

    if gtype == "connect4":
        col = int(move.get("col", -1))
        board = [list(r) for r in game.get("board", [[0] * 7 for _ in range(6)])]
        if not (0 <= col < 7):
            return game, "Invalid column."

        slot = int(game.get("turnSlot", 1))
        p1 = game.get("p1Id")
        p2 = game.get("p2Id")
        if slot == 1 and uid != p1:
            return game, "Waiting for Red player."
        if slot == 2:
            if not p2 and uid != p1:
                p2 = uid
                game["p2Id"] = uid
            elif uid != p2:
                return game, "Waiting for Yellow player."

        placed_row = -1
        for r in range(len(board) - 1, -1, -1):
            if board[r][col] == 0:
                board[r][col] = slot
                placed_row = r
                break
        if placed_row == -1:
            return game, "Column is full."

        game["board"] = board
        if _check_connect4_winner(board, slot):
            game["status"] = "finished"
            winner_uid = p1 if slot == 1 else p2
            game["winnerId"] = winner_uid
            game["winnerName"] = players.get(winner_uid, uname)
            scores[winner_uid] = scores.get(winner_uid, 0) + 1
        elif all(board[0][c] != 0 for c in range(7)):
            game["status"] = "draw"
            game["winnerName"] = "Draw!"
        else:
            game["turnSlot"] = 2 if slot == 1 else 1
        return game, None

    if gtype == "trivia":
        opt_idx = int(move.get("optionIndex", -1))
        answers = dict(game.get("answers") or {})
        if uid in answers:
            return game, "You already answered!"
        if not (0 <= opt_idx < len(game.get("options") or [])):
            return game, "Invalid option."
        correct = (opt_idx == int(game.get("correctIndex", 0)))
        answers[uid] = {"optionIndex": opt_idx, "correct": correct, "name": uname}
        game["answers"] = answers
        if correct:
            scores[uid] = scores.get(uid, 0) + 1
        return game, None

    if gtype == "wordguess":
        letter = str(move.get("letter", "")).strip().upper()[:1]
        if not letter or not letter.isalpha():
            return game, "Pick a letter A-Z."
        guessed = list(game.get("guessed") or [])
        if letter in guessed:
            return game, "Letter already guessed."
        guessed.append(letter)
        game["guessed"] = guessed

        target = str(game.get("targetWord", "SPARK")).upper()
        masked = [ch if ch in guessed else "_" for ch in target]
        game["masked"] = masked
        if letter not in target:
            game["wrongCount"] = int(game.get("wrongCount", 0)) + 1

        if "_" not in masked:
            game["status"] = "finished"
            game["winnerId"] = uid
            game["winnerName"] = uname
            scores[uid] = scores.get(uid, 0) + 1
        elif game.get("wrongCount", 0) >= int(game.get("maxWrong", 6)):
            game["status"] = "draw"
            game["winnerName"] = f"Out of tries! Word: {target}"
        return game, None

    return game, "Unsupported game."


def flush_due_scheduled_messages(conversation_id=None) -> int:
    """
    Promotes any due scheduled/reminder messages (delivery_pending=True, scheduled_for <= now)
    into live delivered messages and broadcasts NEW_MESSAGE to all connected devices.
    """
    now = timezone.now()
    qs = Message.objects.filter(
        delivery_pending=True,
        scheduled_for__isnull=False,
        scheduled_for__lte=now,
    ).select_related("sender", "conversation")
    if conversation_id:
        qs = qs.filter(conversation_id=conversation_id)

    due_items = list(qs[:25])
    if not due_items:
        return 0

    delivered = 0
    for msg in due_items:
        updated = Message.objects.filter(id=msg.id, delivery_pending=True).update(
            delivery_pending=False,
            status="sent",
            created_at=now,
        )
        if not updated:
            continue
        msg.delivery_pending = False
        msg.status = "sent"
        msg.created_at = now
        msg.conversation.updated_at = now
        msg.conversation.save(update_fields=["updated_at"])

        ConversationMember.objects.filter(conversation=msg.conversation).exclude(
            user=msg.sender
        ).update(unread_count=models.F("unread_count") + 1)

        recipient_ids = [
            str(m.user_id)
            for m in msg.conversation.member_records.exclude(user_id=msg.sender_id)
        ]
        serialized = MessageSerializer(msg).data
        entry = OutboxService.create_outbox_event(
            event_type="message.created",
            conversation_id=str(msg.conversation_id),
            payload={
                "event": "message.created",
                "legacy_event": "NEW_MESSAGE",
                "chatId": str(msg.conversation_id),
                "conversation_id": str(msg.conversation_id),
                "message_id": str(msg.id),
                "sender_id": str(msg.sender_id),
                "sender_name": msg.sender.name or msg.sender.username,
                "content": msg.decrypted_content,
                "attachments": msg.attachments or [],
                "topicName": msg.topic_name,
                "timestamp": now.isoformat(),
                "recipient_ids": recipient_ids,
                "message": serialized,
            },
        )
        OutboxService.publish_item(entry)
        delivered += 1
    return delivered

