import html
import random
import re
from datetime import timedelta
from difflib import SequenceMatcher
import requests
from django.utils import timezone


def fuzzy_match_score(query: str, text: str) -> float:
    """
    Computes similarity score in [0.0, 1.0] combining exact substring, token overlap,
    and difflib/character similarity so typos and partial phrases match reliably.
    """
    q = (query or "").strip().lower()
    t = (text or "").strip().lower()
    if not q or not t:
        return 0.0
    if q in t:
        return 1.0 if t.startswith(q) else 0.94

    q_tokens = [tok for tok in q.split() if tok]
    t_tokens = [tok for tok in t.split() if tok]
    if not q_tokens or not t_tokens:
        return 0.0

    # All query words match via substring
    if all(any(qt in tt for tt in t_tokens) for qt in q_tokens):
        return 0.88

    # Per-token best fuzzy similarity using SequenceMatcher
    token_scores = []
    for qt in q_tokens:
        best_tok = 0.0
        for tt in t_tokens:
            if qt in tt or tt in qt:
                ratio = 0.9
            else:
                ratio = SequenceMatcher(None, qt, tt).ratio()
            if ratio > best_tok:
                best_tok = ratio
        token_scores.append(best_tok)

    avg_tok = sum(token_scores) / len(token_scores)
    whole_ratio = SequenceMatcher(None, q, t[: max(len(q) * 2, 60)]).ratio()
    return round(max(avg_tok, whole_ratio), 3)
from django.db import models
from apps.chat.models import ConversationMember
from apps.outbox.services.outbox_service import OutboxService
from .models import Message
from .serializers import MessageSerializer

QUIZ_FALLBACK_BANK = [
    {"question": "Which planet has the most confirmed moons in our solar system?", "options": ["Jupiter", "Saturn", "Uranus", "Neptune"], "answer": 1},
    {"question": "What does HTTP status code 418 famously stand for?", "options": ["Rate Limited", "I'm a teapot", "Payload Too Large", "Gateway Timeout"], "answer": 1},
    {"question": "Which programming language introduced async/await first among these?", "options": ["JavaScript", "Python", "C#", "Rust"], "answer": 2},
    {"question": "How many keys are on a standard full-size acoustic piano?", "options": ["76", "84", "88", "92"], "answer": 2},
    {"question": "Which country invented the game of Chess (Chaturanga)?", "options": ["India", "Persia", "Greece", "China"], "answer": 0},
    {"question": "Which chemical element has the symbol 'Au'?", "options": ["Silver", "Aluminum", "Gold", "Argon"], "answer": 2},
    {"question": "In computing, what does 'GPU' stand for?", "options": ["General Processing Unit", "Graphics Processing Unit", "Global Power Unit", "Grid Parallel Unit"], "answer": 1},
    {"question": "Which ocean is the deepest on Earth?", "options": ["Atlantic", "Indian", "Pacific", "Arctic"], "answer": 2},
    {"question": "How many bits make up one byte?", "options": ["4", "8", "16", "32"], "answer": 1},
    {"question": "Who painted 'The Starry Night'?", "options": ["Pablo Picasso", "Claude Monet", "Vincent van Gogh", "Salvador Dali"], "answer": 2},
    {"question": "Which gas makes up ~78% of Earth's atmosphere?", "options": ["Oxygen", "Nitrogen", "Carbon Dioxide", "Argon"], "answer": 1},
    {"question": "What is the hardest naturally occurring mineral?", "options": ["Quartz", "Topaz", "Corundum", "Diamond"], "answer": 3},
    {"question": "Which continent has the most sovereign countries?", "options": ["Asia", "Europe", "Africa", "South America"], "answer": 2},
    {"question": "In music, how many semitones are in a perfect octave?", "options": ["8", "10", "12", "14"], "answer": 2},
    {"question": "Which port does standard HTTPS traffic use by default?", "options": ["22", "80", "443", "8080"], "answer": 2},
    {"question": "What is the largest internal organ in the human body?", "options": ["Heart", "Liver", "Kidney", "Lungs"], "answer": 1},
    {"question": "Which year did the first iPhone launch?", "options": ["2005", "2007", "2008", "2010"], "answer": 1},
    {"question": "What is the square root of 256?", "options": ["14", "15", "16", "18"], "answer": 2},
    {"question": "Which desert is the largest hot desert in the world?", "options": ["Gobi", "Kalahari", "Sahara", "Arabian"], "answer": 2},
    {"question": "Which protocol resolves domain names into IP addresses?", "options": ["DHCP", "DNS", "ARP", "SMTP"], "answer": 1},
]

WORD_GUESS_BANK = [
    "SPARK", "PIXEL", "ORBIT", "CLOUD", "FLAME", "PULSE", "AUDIO", "STORM",
    "CHESS", "NEXUS", "BRAIN", "QUIZZ", "PRISM", "LASER", "SWIFT", "DELTA",
]

WORDLE_WORDS = [
    "CRANE", "SLATE", "AUDIO", "LIGHT", "BRAIN", "PLANT", "SHINE", "TRACE",
    "GHOST", "BEACH", "FLAME", "CLOUD", "STORM", "POWER", "RIVER", "SWEET",
    "DREAM", "HEART", "PIXEL", "SWIFT", "MAGIC", "OCEAN", "SPARK", "TIGER",
    "EAGLE", "FROST", "BLAZE", "CHAMP", "FOCUS", "NOBLE", "QUEST", "VIVID",
    "ZEBRA", "SOLAR", "LUNAR", "PRISM", "VALOR", "CROWN", "BLISS", "AMBER"
]

TYPERACE_PROMPTS = [
    "The quick brown fox jumps over the lazy dog near the riverbank.",
    "Simplicity is the soul of efficiency and the key to great software.",
    "In the middle of difficulty lies the hidden opportunity to innovate.",
    "Technology is at its best when it brings people together across the globe.",
    "Fast reflexes and focused minds turn everyday challenges into victories.",
    "Every line of clean code is a step toward building something unforgettable.",
    "Great conversations inspire ideas that can change the world overnight."
]

TRUTH_PROMPTS = [
    "What is the most embarrassing thing currently in your search history?",
    "Have you ever made up an excuse just to cancel plans and stay in bed?",
    "What is the most ridiculous purchase you've ever made online?",
    "What is a secret guilty pleasure song you listen to when no one is around?",
    "If you could trade lives with anyone in this chat for 24 hours, who would it be?",
    "What was the most awkward text message you ever sent to the wrong person?",
    "What is a strange phobia or fear you have that makes no rational sense?",
    "Who in this chat group would survive the longest in a zombie apocalypse?",
    "What is the biggest culinary disaster you cooked and secretly ate anyway?",
    "If you were gifted $50,000 right now, what is the first thing you would buy?"
]

DARE_PROMPTS = [
    "Send a selfie making the most ridiculous face right now in chat!",
    "Voice note: Sing the chorus of your favorite song with maximum emotion!",
    "Send the 5th picture in your phone gallery with absolutely zero context!",
    "Type your next message using only your nose or your chin!",
    "Voice note: Do your best impression of a movie villain or cartoon character!",
    "Write a dramatic 2-line poem about a random object on your desk right now!",
    "Voice note: Speak in an over-the-top dramatic accent for 10 seconds!",
    "Send a screenshot of your home screen or current battery level right now!",
    "Tell an absurd lie with complete confidence and see if anyone notices!"
]

def _slide_and_merge_2048(grid, direction):
    def slide_left(row):
        non_zero = [v for v in row if v != 0]
        new_row = []
        score_gain = 0
        skip = False
        for i in range(len(non_zero)):
            if skip:
                skip = False
                continue
            if i + 1 < len(non_zero) and non_zero[i] == non_zero[i + 1]:
                merged = non_zero[i] * 2
                new_row.append(merged)
                score_gain += merged
                skip = True
            else:
                new_row.append(non_zero[i])
        while len(new_row) < 4:
            new_row.append(0)
        return new_row, score_gain

    score_total = 0
    new_grid = [list(r) for r in grid]

    if direction == "left":
        for r in range(4):
            new_grid[r], gain = slide_left(new_grid[r])
            score_total += gain
    elif direction == "right":
        for r in range(4):
            reversed_row = new_grid[r][::-1]
            slid, gain = slide_left(reversed_row)
            new_grid[r] = slid[::-1]
            score_total += gain
    elif direction == "up":
        for c in range(4):
            col = [new_grid[r][c] for r in range(4)]
            slid, gain = slide_left(col)
            for r in range(4):
                new_grid[r][c] = slid[r]
            score_total += gain
    elif direction == "down":
        for c in range(4):
            col = [new_grid[r][c] for r in range(4)][::-1]
            slid, gain = slide_left(col)
            unreversed = slid[::-1]
            for r in range(4):
                new_grid[r][c] = unreversed[r]
            score_total += gain

    return new_grid, score_total

def _can_move_2048(grid):
    for r in range(4):
        for c in range(4):
            if grid[r][c] == 0:
                return True
            if c + 1 < 4 and grid[r][c] == grid[r][c + 1]:
                return True
            if r + 1 < 4 and grid[r][c] == grid[r + 1][c]:
                return True
    return False

MEMORY_EMOJIS = ["🚀", "🔥", "💎", "🍕", "🎧", "🌈"]
ODD_PAIRS = [("😀", "😃"), ("🌕", "🌖"), ("🍎", "🍅"), ("🐶", "🐺"), ("⭐", "🌟"), ("🔵", "🟣")]


def _shuffle_question(q_text: str, correct_text: str, wrong_list: list[str]) -> dict:
    opts = [correct_text, *wrong_list[:3]]
    random.shuffle(opts)
    return {
        "question": q_text,
        "options": opts,
        "correctIndex": opts.index(correct_text),
    }


def _generate_procedural_question() -> dict:
    a = random.randint(12, 49)
    b = random.randint(3, 12)
    c = random.randint(5, 30)
    ans = a * b + c
    wrongs = list({ans + random.choice([-12, -6, 4, 8, 14, -4]) for _ in range(10)} - {ans})[:3]
    while len(wrongs) < 3:
        wrongs.append(ans + len(wrongs) + 5)
    return _shuffle_question(f"Quick Calc: What is {a} × {b} + {c}?", str(ans), [str(w) for w in wrongs])


def fetch_dynamic_quiz_questions(category: str = "", difficulty: str = "", custom_quiz: dict | None = None) -> list[dict]:
    if isinstance(custom_quiz, dict) and custom_quiz.get("question") and isinstance(custom_quiz.get("options"), list):
        opts = [str(o).strip() for o in custom_quiz["options"] if str(o).strip()][:4]
        if len(opts) >= 2:
            c_idx = max(0, min(int(custom_quiz.get("correctIndex", 0)), len(opts) - 1))
            return [{
                "question": str(custom_quiz["question"]).strip()[:240],
                "options": opts,
                "correctIndex": c_idx,
            }]

    questions = []
    try:
        params = {"amount": 5, "type": "multiple"}
        if category and str(category).isdigit():
            params["category"] = str(category)
        if difficulty in ("easy", "medium", "hard"):
            params["difficulty"] = difficulty
        resp = requests.get("https://opentdb.com/api.php", params=params, timeout=2.5)
        if resp.status_code == 200:
            payload = resp.json()
            for item in payload.get("results", [])[:5]:
                q_text = html.unescape(item.get("question", ""))
                correct = html.unescape(item.get("correct_answer", ""))
                wrongs = [html.unescape(w) for w in item.get("incorrect_answers", [])]
                if q_text and correct and len(wrongs) >= 3:
                    questions.append(_shuffle_question(q_text, correct, wrongs))
    except Exception:
        pass

    if len(questions) < 5:
        needed = 5 - len(questions)
        bank_picks = random.sample(QUIZ_FALLBACK_BANK, min(len(QUIZ_FALLBACK_BANK), max(0, needed - 1)))
        for b in bank_picks:
            correct = b["options"][b["answer"]]
            wrongs = [o for i, o in enumerate(b["options"]) if i != b["answer"]]
            questions.append(_shuffle_question(b["question"], correct, wrongs))
        while len(questions) < 5:
            questions.append(_generate_procedural_question())

    return questions[:5]


def create_initial_game_state(game_type: str, creator, options: dict | None = None) -> dict:
    options = options or {}
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
        return {**base, "board": [""] * 9, "turnSymbol": "X", "xPlayerId": cid, "oPlayerId": None, "winLine": []}

    if game_type == "rps":
        return {**base, "round": 1, "picks": {}, "lastOutcome": ""}

    if game_type == "connect4":
        return {**base, "rows": 6, "cols": 7, "board": [[0] * 7 for _ in range(6)], "turnSlot": 1, "p1Id": cid, "p2Id": None}

    if game_type in ("trivia", "quiz"):
        qs = fetch_dynamic_quiz_questions(
            category=str(options.get("category", "")),
            difficulty=str(options.get("difficulty", "")),
            custom_quiz=options.get("customQuiz"),
        )
        first = qs[0]
        return {
            **base,
            "gameType": "trivia",
            "questions": qs,
            "currentIndex": 0,
            "question": first["question"],
            "options": first["options"],
            "correctIndex": first["correctIndex"],
            "answers": {},
            "category": str(options.get("categoryName") or "Dynamic Mix"),
        }

    if game_type == "wordguess":
        raw_word = str(options.get("customWord") or "")
        cleaned = "".join(ch for ch in raw_word.upper() if ch.isalpha())[:8]
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

    if game_type == "diceduel":
        return {**base, "round": 1, "rolls": {}, "lastOutcome": ""}

    if game_type == "coinflip":
        return {**base, "round": 1, "outcome": "", "lastResult": ""}

    if game_type == "highlow":
        return {**base, "target": random.randint(1, 100), "min": 1, "max": 100, "guesses": [], "hint": "Guess between 1 and 100"}

    if game_type == "memory":
        cards = MEMORY_EMOJIS * 2
        random.shuffle(cards)
        return {**base, "cards": cards, "matched": [], "flipped": [], "lastTurn": ""}

    if game_type == "dotsboxes":
        return {
            **base,
            "hEdges": [[""] * 3 for _ in range(4)],
            "vEdges": [[""] * 4 for _ in range(3)],
            "boxes": [[""] * 3 for _ in range(3)],
            "turnPlayerId": cid,
            "secondPlayerId": None,
        }

    if game_type == "reversi":
        b = [[0] * 6 for _ in range(6)]
        b[2][2], b[3][3] = 2, 2
        b[2][3], b[3][2] = 1, 1
        return {**base, "board": b, "turnSlot": 1, "p1Id": cid, "p2Id": None}

    if game_type == "mines":
        mine_indices = sorted(random.sample(range(16), 3))
        return {**base, "mines": mine_indices, "revealed": [], "explodedBy": "", "safeTarget": 13}

    if game_type == "blackjack":
        return {**base, "hands": {cid: [random.randint(2, 11), random.randint(2, 10)]}, "stood": [], "lastOutcome": ""}

    if game_type == "evenodd":
        return {**base, "round": 1, "bets": {}, "rolled": None, "lastOutcome": ""}

    if game_type == "oddone":
        normal, odd = random.choice(ODD_PAIRS)
        grid = [normal] * 16
        odd_idx = random.randint(0, 15)
        grid[odd_idx] = odd
        return {**base, "grid": grid, "oddIndex": odd_idx, "attempts": []}

    if game_type == "mathsprint":
        a, b, c = random.randint(11, 35), random.randint(3, 9), random.randint(4, 25)
        op = random.choice(["+", "-"])
        answer = (a * b + c) if op == "+" else (a * b - c)
        return {**base, "expression": f"{a} × {b} {op} {c}", "target": answer, "lastGuess": ""}

    if game_type == "wordle":
        raw_word = str((options or {}).get("customWord") or "").strip().upper()
        clean_word = "".join(c for c in raw_word if c.isalpha())[:5]
        target = clean_word if len(clean_word) == 5 else random.choice(WORDLE_WORDS)
        return {
            **base,
            "target": target,
            "guesses": [],
            "maxGuesses": 6,
            "keyboard": {},
            "lastGuess": "",
        }

    if game_type in ("game2048", "2048"):
        grid = [[0] * 4 for _ in range(4)]
        for _ in range(2):
            empty = [(r, c) for r in range(4) for c in range(4) if grid[r][c] == 0]
            if empty:
                r, c = random.choice(empty)
                grid[r][c] = 2 if random.random() < 0.9 else 4
        return {
            **base,
            "grid": grid,
            "score": 0,
            "bestTile": 4,
            "won": False,
            "movesCount": 0,
        }

    if game_type == "typerace":
        prompt = random.choice(TYPERACE_PROMPTS)
        return {
            **base,
            "prompt": prompt,
            "wordCount": len(prompt.split()),
            "results": [],
        }

    if game_type == "truthordare":
        initial_type = random.choice(["truth", "dare"])
        prompt_text = random.choice(TRUTH_PROMPTS if initial_type == "truth" else DARE_PROMPTS)
        uname = creator.name or creator.username
        return {
            **base,
            "currentPrompt": {
                "type": initial_type,
                "text": prompt_text,
                "player": uname,
            },
            "history": [{"type": initial_type, "text": prompt_text, "player": uname}],
            "completedCount": 0,
        }

    raise ValueError(f"Unsupported game type: {game_type}")


def _check_ttt_winner(board):
    lines = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a], [a, b, c]
    return None, []


def _check_connect4_winner(board, slot):
    rows, cols = len(board), len(board[0])
    for r in range(rows):
        for c in range(cols):
            if board[r][c] != slot:
                continue
            for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
                if all(0 <= r + dr * s < rows and 0 <= c + dc * s < cols and board[r + dr * s][c + dc * s] == slot for s in range(1, 4)):
                    return True
    return False


def _reversi_flips(board, r, c, slot):
    if board[r][c] != 0:
        return []
    other = 2 if slot == 1 else 1
    to_flip = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            line = []
            nr, nc = r + dr, c + dc
            while 0 <= nr < 6 and 0 <= nc < 6 and board[nr][nc] == other:
                line.append((nr, nc))
                nr += dr
                nc += dc
            if line and 0 <= nr < 6 and 0 <= nc < 6 and board[nr][nc] == slot:
                to_flip.extend(line)
    return to_flip


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

    # Rematch / Next-round handlers
    if move.get("action") == "next_round":
        if gtype in ("rps", "diceduel", "evenodd"):
            game["status"] = "active"
            game["winnerId"] = None
            game["winnerName"] = ""
            game["round"] = int(game.get("round", 1)) + 1
            game["picks"] = {}
            game["rolls"] = {}
            game["bets"] = {}
            game["rolled"] = None
            game["lastOutcome"] = ""
            return game, None

    if gtype == "trivia" and move.get("action") == "next_question":
        qs = list(game.get("questions") or [])
        nxt = int(game.get("currentIndex", 0)) + 1
        if nxt >= len(qs):
            game["status"] = "finished"
            best_uid = max(scores, key=lambda k: scores.get(k, 0)) if scores else uid
            game["winnerId"] = best_uid
            game["winnerName"] = players.get(best_uid, uname)
            return game, None
        q = qs[nxt]
        game["currentIndex"] = nxt
        game["question"] = q["question"]
        game["options"] = q["options"]
        game["correctIndex"] = q["correctIndex"]
        game["answers"] = {}
        return game, None

    if game.get("status") == "finished":
        return game, "Game already finished."

    if gtype == "tictactoe":
        idx = int(move.get("index", -1))
        board = list(game.get("board") or [""] * 9)
        if not (0 <= idx < 9) or board[idx]:
            return game, "Invalid or occupied cell."
        turn = game.get("turnSymbol", "X")
        x_id, o_id = game.get("xPlayerId"), game.get("oPlayerId")
        if turn == "X" and uid != x_id:
            return game, "Waiting for Player X's turn."
        if turn == "O":
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
        elif all(board):
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
            p1, p2 = list(picks.keys())[:2]
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
        p1, p2 = game.get("p1Id"), game.get("p2Id")
        if slot == 1 and uid != p1:
            return game, "Waiting for Red player."
        if slot == 2:
            if not p2 and uid != p1:
                p2 = uid
                game["p2Id"] = uid
            elif uid != p2:
                return game, "Waiting for Yellow player."
        placed = -1
        for r in range(5, -1, -1):
            if board[r][col] == 0:
                board[r][col] = slot
                placed = r
                break
        if placed == -1:
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
            return game, "You already answered this question!"
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

    if gtype == "diceduel":
        rolls = dict(game.get("rolls") or {})
        if uid in rolls:
            return game, "Already rolled this round."
        rolls[uid] = random.randint(1, 6)
        game["rolls"] = rolls
        if len(rolls) >= 2:
            p1, p2 = list(rolls.keys())[:2]
            r1, r2 = rolls[p1], rolls[p2]
            game["status"] = "finished"
            if r1 == r2:
                game["winnerName"] = "Tie!"
                game["lastOutcome"] = f"Both rolled 🎲 {r1}!"
            elif r1 > r2:
                game["winnerId"] = p1
                game["winnerName"] = players.get(p1, "Player 1")
                scores[p1] = scores.get(p1, 0) + 1
                game["lastOutcome"] = f"{game['winnerName']} wins ({r1} vs {r2})!"
            else:
                game["winnerId"] = p2
                game["winnerName"] = players.get(p2, "Player 2")
                scores[p2] = scores.get(p2, 0) + 1
                game["lastOutcome"] = f"{game['winnerName']} wins ({r2} vs {r1})!"
        return game, None

    if gtype == "coinflip":
        call = str(move.get("choice", "")).lower()
        if call not in ("heads", "tails"):
            return game, "Call heads or tails."
        flip = random.choice(["heads", "tails"])
        won = call == flip
        game["round"] = int(game.get("round", 1)) + 1
        game["outcome"] = flip
        if won:
            scores[uid] = scores.get(uid, 0) + 1
            game["lastResult"] = f"{uname} called {call.title()} -> 🪙 {flip.title()} (+1)!"
        else:
            game["lastResult"] = f"{uname} called {call.title()} -> 🪙 {flip.title()} (Miss)"
        return game, None

    if gtype == "highlow":
        val = int(move.get("guess", -1))
        target = int(game.get("target", 50))
        if not (1 <= val <= 100):
            return game, "Guess 1 to 100."
        guesses = list(game.get("guesses") or [])
        guesses.append({"name": uname, "value": val})
        game["guesses"] = guesses[-6:]
        if val == target:
            game["status"] = "finished"
            game["winnerId"] = uid
            game["winnerName"] = uname
            scores[uid] = scores.get(uid, 0) + 1
            game["hint"] = f"🎯 Exact! It was {target}!"
        elif val < target:
            game["min"] = max(int(game.get("min", 1)), val + 1)
            game["hint"] = f"{val} is too low — Go Higher ⬆️"
        else:
            game["max"] = min(int(game.get("max", 100)), val - 1)
            game["hint"] = f"{val} is too high — Go Lower ⬇️"
        return game, None

    if gtype == "memory":
        idx = int(move.get("index", -1))
        cards = list(game.get("cards") or [])
        matched = list(game.get("matched") or [])
        flipped = list(game.get("flipped") or [])
        if not (0 <= idx < len(cards)) or idx in matched or idx in flipped:
            return game, "Pick an unflipped card."
        if len(flipped) >= 2:
            flipped = []
        flipped.append(idx)
        if len(flipped) == 2:
            i1, i2 = flipped[0], flipped[1]
            if cards[i1] == cards[i2]:
                matched.extend([i1, i2])
                scores[uid] = scores.get(uid, 0) + 1
                game["lastTurn"] = f"{uname} matched {cards[i1]}!"
                flipped = []
            else:
                game["lastTurn"] = f"{uname}: {cards[i1]} vs {cards[i2]}"
        game["matched"] = matched
        game["flipped"] = flipped
        if len(matched) == len(cards):
            game["status"] = "finished"
            best = max(scores, key=lambda k: scores.get(k, 0)) if scores else uid
            game["winnerId"] = best
            game["winnerName"] = players.get(best, uname)
        return game, None

    if gtype == "dotsboxes":
        ori = move.get("orientation")
        r, c = int(move.get("row", -1)), int(move.get("col", -1))
        turn_id = game.get("turnPlayerId")
        p2 = game.get("secondPlayerId")
        if uid != turn_id:
            if not p2 and uid != game.get("creatorId"):
                game["secondPlayerId"] = uid
            elif turn_id == game.get("creatorId") and p2 and uid != turn_id:
                return game, "Not your turn!"
            elif turn_id != game.get("creatorId") and uid != turn_id:
                return game, "Not your turn!"

        h = [list(x) for x in game.get("hEdges", [[""] * 3 for _ in range(4)])]
        v = [list(x) for x in game.get("vEdges", [[""] * 4 for _ in range(3)])]
        boxes = [list(x) for x in game.get("boxes", [[""] * 3 for _ in range(3)])]
        if ori == "h":
            if not (0 <= r < 4 and 0 <= c < 3) or h[r][c]:
                return game, "Edge already taken."
            h[r][c] = uid
        elif ori == "v":
            if not (0 <= r < 3 and 0 <= c < 4) or v[r][c]:
                return game, "Edge already taken."
            v[r][c] = uid
        else:
            return game, "Invalid edge."

        claimed_box = False
        for br in range(3):
            for bc in range(3):
                if not boxes[br][bc] and h[br][bc] and h[br + 1][bc] and v[br][bc] and v[br][bc + 1]:
                    boxes[br][bc] = uname[:1].upper()
                    scores[uid] = scores.get(uid, 0) + 1
                    claimed_box = True
        game["hEdges"], game["vEdges"], game["boxes"] = h, v, boxes
        if all(boxes[br][bc] for br in range(3) for bc in range(3)):
            game["status"] = "finished"
            best = max(scores, key=lambda k: scores.get(k, 0)) if scores else uid
            game["winnerId"] = best
            game["winnerName"] = players.get(best, uname)
        elif not claimed_box:
            other = p2 if uid == game.get("creatorId") else game.get("creatorId")
            if other:
                game["turnPlayerId"] = other
        return game, None

    if gtype == "reversi":
        r, c = int(move.get("row", -1)), int(move.get("col", -1))
        if not (0 <= r < 6 and 0 <= c < 6):
            return game, "Invalid cell."
        board = [list(row) for row in game.get("board", [])]
        slot = int(game.get("turnSlot", 1))
        p1, p2 = game.get("p1Id"), game.get("p2Id")
        if slot == 1 and uid != p1:
            return game, "Black's turn."
        if slot == 2:
            if not p2 and uid != p1:
                game["p2Id"] = uid
            elif uid != p2:
                return game, "White's turn."
        flips = _reversi_flips(board, r, c, slot)
        if not flips:
            return game, "Must flip at least one opponent disc."
        board[r][c] = slot
        for fr, fc in flips:
            board[fr][fc] = slot
        game["board"] = board
        c1 = sum(cell == 1 for row in board for cell in row)
        c2 = sum(cell == 2 for row in board for cell in row)
        if p1:
            scores[p1] = c1
        if game.get("p2Id"):
            scores[game["p2Id"]] = c2
        nxt = 2 if slot == 1 else 1
        has_nxt = any(_reversi_flips(board, rr, cc, nxt) for rr in range(6) for cc in range(6))
        has_cur = any(_reversi_flips(board, rr, cc, slot) for rr in range(6) for cc in range(6))
        if not has_nxt and not has_cur:
            game["status"] = "finished"
            win_id = p1 if c1 >= c2 else (game.get("p2Id") or uid)
            game["winnerId"] = win_id
            game["winnerName"] = players.get(win_id, uname)
        elif has_nxt:
            game["turnSlot"] = nxt
        return game, None

    if gtype == "mines":
        idx = int(move.get("index", -1))
        if not (0 <= idx < 16):
            return game, "Invalid cell."
        revealed = list(game.get("revealed") or [])
        if idx in revealed:
            return game, "Already revealed."
        if idx in (game.get("mines") or []):
            game["status"] = "finished"
            game["explodedBy"] = uname
            game["winnerName"] = f"💥 {uname} hit a mine!"
        else:
            revealed.append(idx)
            game["revealed"] = revealed
            scores[uid] = scores.get(uid, 0) + 1
            if len(revealed) >= int(game.get("safeTarget", 13)):
                game["status"] = "finished"
                best = max(scores, key=lambda k: scores.get(k, 0)) if scores else uid
                game["winnerId"] = best
                game["winnerName"] = players.get(best, uname)
        return game, None

    if gtype == "blackjack":
        action = str(move.get("action", "hit"))
        hands = {k: list(v) for k, v in (game.get("hands") or {}).items()}
        stood = list(game.get("stood") or [])
        if uid not in hands:
            hands[uid] = [random.randint(2, 11), random.randint(2, 10)]
        if uid in stood:
            return game, "You already stood."
        if action == "hit":
            hands[uid].append(random.randint(2, 11))
            if sum(hands[uid]) > 21:
                stood.append(uid)
        elif action == "stand":
            stood.append(uid)
        game["hands"] = hands
        game["stood"] = stood
        scores[uid] = sum(hands[uid]) if sum(hands[uid]) <= 21 else 0
        if len(stood) >= 2 and len(hands) >= 2:
            game["status"] = "finished"
            valid_scores = {k: (sum(v) if sum(v) <= 21 else -1) for k, v in hands.items()}
            best = max(valid_scores, key=lambda k: valid_scores[k])
            game["winnerId"] = best if valid_scores[best] >= 0 else None
            game["winnerName"] = players.get(best, "Bust!") if valid_scores[best] >= 0 else "Everyone Busted!"
        return game, None

    if gtype == "evenodd":
        bet = str(move.get("choice", "")).lower()
        if bet not in ("even", "odd"):
            return game, "Pick even or odd."
        bets = dict(game.get("bets") or {})
        bets[uid] = bet
        game["bets"] = bets
        roll = random.randint(1, 20)
        parity = "even" if roll % 2 == 0 else "odd"
        game["rolled"] = roll
        game["status"] = "finished"
        if bet == parity:
            scores[uid] = scores.get(uid, 0) + 1
            game["winnerId"] = uid
            game["winnerName"] = uname
            game["lastOutcome"] = f"Rolled {roll} ({parity.title()}) — {uname} wins!"
        else:
            game["lastOutcome"] = f"Rolled {roll} ({parity.title()}) — Miss!"
        return game, None

    if gtype == "oddone":
        idx = int(move.get("index", -1))
        if idx == int(game.get("oddIndex", -1)):
            game["status"] = "finished"
            game["winnerId"] = uid
            game["winnerName"] = uname
            scores[uid] = scores.get(uid, 0) + 1
        else:
            attempts = list(game.get("attempts") or [])
            attempts.append(idx)
            game["attempts"] = attempts
        return game, None

    if gtype == "mathsprint":
        try:
            ans = int(move.get("answer"))
        except (TypeError, ValueError):
            return game, "Enter a whole number."
        if ans == int(game.get("target", 0)):
            game["status"] = "finished"
            game["winnerId"] = uid
            game["winnerName"] = uname
            scores[uid] = scores.get(uid, 0) + 1
            game["lastGuess"] = f"{uname} solved it: {ans}!"
        else:
            game["lastGuess"] = f"{uname} tried {ans} ❌"
        return game, None

    if gtype == "wordle":
        raw_guess = str(move.get("guess", "")).strip().upper()
        clean_guess = "".join(c for c in raw_guess if c.isalpha())
        if len(clean_guess) != 5:
            return game, "Wordle guess must be exactly 5 letters."
        target = str(game.get("target", "SPARK")).upper()
        guesses = list(game.get("guesses") or [])
        if len(guesses) >= int(game.get("maxGuesses", 6)):
            return game, "No more guesses left in this duel."

        eval_result = ["absent"] * 5
        target_counts = {}
        for c in target:
            target_counts[c] = target_counts.get(c, 0) + 1

        for i in range(5):
            if clean_guess[i] == target[i]:
                eval_result[i] = "correct"
                target_counts[clean_guess[i]] -= 1

        for i in range(5):
            if eval_result[i] != "correct" and target_counts.get(clean_guess[i], 0) > 0:
                eval_result[i] = "present"
                target_counts[clean_guess[i]] -= 1

        kb = dict(game.get("keyboard") or {})
        for i, c in enumerate(clean_guess):
            st = eval_result[i]
            current = kb.get(c)
            if current == "correct":
                continue
            if current == "present" and st == "absent":
                continue
            kb[c] = st
        game["keyboard"] = kb

        guesses.append({
            "word": clean_guess,
            "player": uname,
            "playerId": uid,
            "evaluation": eval_result,
        })
        game["guesses"] = guesses
        game["lastGuess"] = f"{uname} guessed {clean_guess}"

        if clean_guess == target:
            game["status"] = "finished"
            game["winnerId"] = uid
            game["winnerName"] = f"{uname} cracked it in {len(guesses)}/6!"
            scores[uid] = scores.get(uid, 0) + (7 - len(guesses))
        elif len(guesses) >= 6:
            game["status"] = "finished"
            game["winnerName"] = f"Word was {target}!"

        return game, None

    if gtype in ("game2048", "2048"):
        direction = str(move.get("direction", "")).lower()
        if direction not in ("up", "down", "left", "right"):
            return game, "Direction must be up, down, left, or right."
        grid = game.get("grid") or [[0] * 4 for _ in range(4)]
        new_grid, gain = _slide_and_merge_2048(grid, direction)
        if new_grid == grid:
            return game, "No tiles moved in that direction."

        empty_cells = [(r, c) for r in range(4) for c in range(4) if new_grid[r][c] == 0]
        if empty_cells:
            r, c = random.choice(empty_cells)
            new_grid[r][c] = 2 if random.random() < 0.9 else 4

        game["grid"] = new_grid
        game["score"] = int(game.get("score", 0)) + gain
        scores[uid] = game["score"]
        game["movesCount"] = int(game.get("movesCount", 0)) + 1
        best_tile = max(max(row) for row in new_grid)
        game["bestTile"] = best_tile

        if best_tile >= 2048 and not game.get("won"):
            game["won"] = True
            game["winnerName"] = f"🎉 2048 Reached by {uname}!"

        if not _can_move_2048(new_grid):
            game["status"] = "finished"
            game["winnerName"] = f"Game Over! Score: {game['score']}"

        return game, None

    if gtype == "typerace":
        typed = str(move.get("typed", "")).strip()
        time_ms = max(500, int(move.get("timeMs", 1000)))
        prompt = str(game.get("prompt", ""))

        match_chars = sum(1 for i, c in enumerate(typed) if i < len(prompt) and c == prompt[i])
        accuracy = round((match_chars / max(1, len(prompt))) * 100)

        time_sec = time_ms / 1000.0
        words = len(typed.split())
        wpm = round((words / (time_sec / 60.0))) if time_sec > 0 else 0
        if accuracy < 60:
            wpm = max(0, wpm - 20)

        results = list(game.get("results") or [])
        idx = next((i for i, r in enumerate(results) if r.get("playerId") == uid), -1)
        entry = {
            "playerId": uid,
            "player": uname,
            "wpm": wpm,
            "accuracy": accuracy,
            "timeSec": round(time_sec, 1),
        }
        if idx >= 0:
            if wpm > results[idx].get("wpm", 0):
                results[idx] = entry
        else:
            results.append(entry)

        results.sort(key=lambda r: r.get("wpm", 0), reverse=True)
        game["results"] = results
        scores[uid] = wpm

        if results:
            game["winnerId"] = results[0]["playerId"]
            game["winnerName"] = f"🏆 {results[0]['player']} ({results[0]['wpm']} WPM)"

        return game, None

    if gtype == "truthordare":
        action = str(move.get("action", "pick"))
        if action == "complete":
            game["completedCount"] = int(game.get("completedCount", 0)) + 1
            scores[uid] = scores.get(uid, 0) + 1
            game["lastAction"] = f"✅ {uname} completed the challenge!"
            return game, None

        choice_type = str(move.get("type", "random")).lower()
        if choice_type == "random":
            choice_type = random.choice(["truth", "dare"])

        prompt_bank = TRUTH_PROMPTS if choice_type == "truth" else DARE_PROMPTS
        chosen_prompt = random.choice(prompt_bank)
        new_prompt = {
            "type": choice_type,
            "text": chosen_prompt,
            "player": uname,
        }
        game["currentPrompt"] = new_prompt
        history = list(game.get("history") or [])
        history.append(new_prompt)
        game["history"] = history[-10:]
        game["lastAction"] = f"🎲 {uname} drew a {choice_type.upper()}!"
        return game, None

    return game, "Unsupported game."


def apply_seen_ephemeral_expiry(conversation, messages, reader_user_id) -> dict[str, str]:
    """
    Sets `expires_at` when a recipient opens/sees messages in chats configured with
    'after seen' (-1 -> ~8s) or '2 min after seen' (-120 -> 120s).
    """
    ttl = int(getattr(conversation, "ephemeral_ttl", 0) or 0)
    if ttl not in (-1, -120) or not messages:
        return {}

    now = timezone.now()
    delay_seconds = 8 if ttl == -1 else 120
    reader_str = str(reader_user_id)
    updated_objs = []
    expires_map: dict[str, str] = {}

    for msg in messages:
        if msg.expires_at is None and str(msg.sender_id) != reader_str:
            exp = now + timedelta(seconds=delay_seconds)
            msg.expires_at = exp
            updated_objs.append(msg)
            expires_map[str(msg.id)] = exp.isoformat()

    if updated_objs:
        Message.objects.bulk_update(updated_objs, ["expires_at"])
    return expires_map


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


def has_mention_all(content: str) -> bool:
    """Returns True when message content explicitly mentions @all or @everyone."""
    if not content:
        return False
    return bool(re.search(r"(?:^|\s)@(?:all|everyone)\b", str(content), re.IGNORECASE))


def check_slow_mode(conversation, user) -> tuple[bool, int]:
    """Enforces per-group slow mode cooldown for non-admin members; returns (allowed, retry_after_sec)."""
    import math

    if not conversation.group_chat or not getattr(conversation, "slow_mode_seconds", 0):
        return True, 0
    if conversation.creator_id == user.id or conversation.admins.filter(id=user.id).exists():
        return True, 0

    last_msg = (
        Message.objects.filter(conversation=conversation, sender=user, delivery_pending=False)
        .order_by("-created_at")
        .only("created_at")
        .first()
    )
    if not last_msg:
        return True, 0

    elapsed = (timezone.now() - last_msg.created_at).total_seconds()
    cooldown = int(conversation.slow_mode_seconds or 0)
    if elapsed < cooldown:
        return False, max(1, math.ceil(cooldown - elapsed))
    return True, 0


def create_widget_state(widget_type: str, user, options: dict | None = None) -> dict:
    """Creates initial interactive widget attachment (checklist, roulette, countdown)."""
    import secrets
    import uuid as _uuid
    from datetime import datetime as _dt

    opts = options or {}
    wtype = (widget_type or "").strip().lower()
    uname = user.name or user.username

    if wtype == "checklist":
        title = str(opts.get("title") or "Shared Checklist").strip()[:120]
        raw_items = opts.get("items") or ["Pack essentials", "Confirm timing"]
        items = []
        for entry in raw_items[:30]:
            text = str(entry).strip()[:160]
            if text:
                items.append({"id": str(_uuid.uuid4())[:8], "text": text, "done": False, "doneBy": None})
        if not items:
            raise ValueError("Checklist requires at least 1 item.")
        return {
            "type": "widget",
            "widgetType": "checklist",
            "title": title,
            "items": items,
            "createdByName": uname,
        }

    if wtype == "roulette":
        title = str(opts.get("title") or "Spin the Wheel").strip()[:120]
        raw_opts = [str(o).strip()[:60] for o in (opts.get("options") or []) if str(o).strip()]
        if len(raw_opts) < 2:
            raw_opts = ["Pizza", "Tacos", "Sushi", "Burgers"]
        return {
            "type": "widget",
            "widgetType": "roulette",
            "title": title,
            "options": raw_opts[:16],
            "spinCount": 0,
            "winnerIndex": None,
            "winnerText": "",
            "targetDeg": 0,
            "spunBy": None,
            "spinToken": secrets.token_hex(4),
            "createdByName": uname,
        }

    if wtype == "countdown":
        title = str(opts.get("title") or "Event Countdown").strip()[:120]
        raw_target = str(opts.get("targetIso") or "").strip()
        if not raw_target:
            raise ValueError("targetIso is required for countdown.")
        parsed = _dt.fromisoformat(raw_target.replace("Z", "+00:00"))
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed)
        return {
            "type": "widget",
            "widgetType": "countdown",
            "title": title,
            "targetIso": parsed.isoformat(),
            "emoji": str(opts.get("emoji") or "⏳")[:8],
            "createdByName": uname,
        }

    raise ValueError(f"Unsupported widget type: {widget_type}")


def apply_widget_action(widget_state: dict, user, payload: dict) -> tuple[dict, str | None]:
    """Applies collaborative actions on checklist / roulette widgets."""
    import secrets
    import uuid as _uuid

    state = dict(widget_state or {})
    wtype = state.get("widgetType")
    action = str((payload or {}).get("action") or "").strip().lower()
    uname = user.name or user.username

    if wtype == "checklist":
        items = [dict(i) for i in (state.get("items") or [])]
        if action == "toggle":
            item_id = str(payload.get("itemId") or "").strip()
            for it in items:
                if str(it.get("id")) == item_id:
                    it["done"] = not bool(it.get("done"))
                    it["doneBy"] = uname if it["done"] else None
                    state["items"] = items
                    return state, None
            return state, "Checklist item not found."
        if action == "add":
            text = str(payload.get("text") or "").strip()[:160]
            if not text:
                return state, "Item text is required."
            if len(items) >= 40:
                return state, "Maximum 40 items per checklist."
            items.append({"id": str(_uuid.uuid4())[:8], "text": text, "done": False, "doneBy": None, "addedBy": uname})
            state["items"] = items
            return state, None
        if action == "remove":
            item_id = str(payload.get("itemId") or "").strip()
            state["items"] = [it for it in items if str(it.get("id")) != item_id]
            return state, None
        return state, "Invalid checklist action."

    if wtype == "roulette":
        options = list(state.get("options") or [])
        if action == "add_option":
            text = str(payload.get("text") or "").strip()[:60]
            if not text:
                return state, "Option text is required."
            if len(options) >= 16:
                return state, "Maximum 16 wheel options."
            options.append(text)
            state["options"] = options
            return state, None
        if action == "spin":
            if len(options) < 2:
                return state, "Need at least 2 options to spin."
            winner_idx = secrets.randbelow(len(options))
            spin_count = int(state.get("spinCount") or 0) + 1
            slice_deg = 360.0 / len(options)
            center_offset = winner_idx * slice_deg + slice_deg / 2.0
            # Target angle lands slice `winner_idx` cleanly under top pointer (0deg)
            landing_deg = (360.0 - center_offset) % 360.0
            state["spinCount"] = spin_count
            state["winnerIndex"] = winner_idx
            state["winnerText"] = options[winner_idx]
            state["targetDeg"] = round(spin_count * 1440.0 + landing_deg, 2)
            state["spunBy"] = uname
            return state, None
        return state, "Invalid wheel action."

    return state, "Unsupported widget action."
