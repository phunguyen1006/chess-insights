"""Build synthetic raw inputs. Expected controls below are literal hand counts.

This file does not import the application or derive expected values from it.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import copy
import json

ROOT = Path(__file__).parent
USER = "auditplayer"
NOW = "2026-10-03T12:00:00Z"
times = [
    "2023-12-31T16:59:00Z", "2023-12-31T17:01:00Z",
    "2024-02-28T16:59:00Z", "2024-02-28T17:01:00Z",
    "2024-02-29T16:59:00Z", "2024-02-29T17:01:00Z",
    "2024-03-10T06:59:00Z", "2024-03-10T07:01:00Z",
    "2024-11-03T05:59:00Z", "2024-11-03T06:01:00Z",
    "2024-12-31T16:59:00Z", "2024-12-31T17:01:00Z",
]
for base in ["2025-01-01T23:30:00Z", "2025-01-02T00:30:00Z",
             "2026-09-29T17:30:00Z", "2026-09-30T17:30:00Z",
             "2026-10-01T17:30:00Z", "2026-10-02T17:30:00Z"]:
    dt = datetime.fromisoformat(base.replace("Z", "+00:00"))
    times += [(dt + timedelta(minutes=10*j)).isoformat().replace("+00:00", "Z") for j in range(3)]
outcomes = ["win", "loss", "draw", "win", "loss", "win", "draw", "win", "loss", "win",
            "loss", "win", "draw", "win", "loss", "win", "draw", "win",
            "win", "loss", "draw", "win", "loss", "win",
            "draw", "win", "loss", "draw", "win", "draw"]
games, rows = [], []
for i, (when, outcome) in enumerate(zip(times, outcomes), 1):
    pool = "rapid" if i <= 10 else "blitz" if i <= 18 else "bullet" if i <= 24 else "daily"
    tc = {"rapid":"600", "blitz":"180", "bullet":"60", "daily":"1/86400"}[pool]
    end = datetime.fromisoformat(when.replace("Z", "+00:00"))
    start = end - timedelta(seconds=i*10)
    opponent = f"Opponent{(i-1)%3}"
    player_white = i % 2 == 1
    loss_code = ["resigned", "checkmated", "timeout", "abandoned"][(i-1)%4]
    draw_code = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"][(i-1)%6]
    player_code = "win" if outcome == "win" else draw_code if outcome == "draw" else loss_code
    other_code = loss_code if outcome == "win" else draw_code if outcome == "draw" else "win"
    player = {"username":USER, "rating":1000+i*10, "result":player_code}
    other = {"username":opponent, "rating":900+i*20, "result":other_code}
    if i == 10: player.pop("rating")
    if i == 18: other.pop("rating")
    white, black = (player, other) if player_white else (other, player)
    result = "1/2-1/2" if outcome == "draw" else "1-0" if (outcome == "win") == player_white else "0-1"
    headers = [f'[White "{white["username"]}"]', f'[Black "{black["username"]}"]', f'[Result "{result}"]']
    if i <= 22 or i >= 25:
        headers += [f'[UTCDate "{start:%Y.%m.%d}"]', f'[UTCTime "{start:%H:%M:%S}"]',
                    f'[EndDate "{end:%Y.%m.%d}"]', f'[EndTime "{end:%H:%M:%S}"]']
    if i == 24:  # corrupt explicit negative interval; no clock/EMT fallback
        headers += ['[UTCDate "2026.09.30"]', '[UTCTime "19:00:00"]', '[EndDate "2026.09.30"]', '[EndTime "18:00:00"]']
    if i <= 24:
        eco, opening = ("C20", "King's Pawn Game: Synthetic Variation") if i <= 10 else ("C00", "French Defense") if i <= 18 else ("B20", "Sicilian Defense")
        headers += [f'[ECO "{eco}"]', f'[Opening "{opening}"]']
    raw = {"uuid":f"g{i:02d}", "url":f"https://www.chess.com/game/live/{10000+i}",
           "end_time":int(end.timestamp()), "rules":"chess", "rated":i!=30,
           "time_class":pool, "time_control":tc, "white":white, "black":black,
           "pgn":"\n".join(headers)+f"\n\n1. e4 e5 2. Nf3 Nc6 {result}"}
    games.append(raw)
    rows.append(f"| g{i:02d} | {when} | {pool} | {outcome} | {'W' if player_white else 'B'} | {i*10 if i<=22 else 'unknown' if i<=24 else 'Daily excluded'} |")
raw_games = games + [copy.deepcopy(games[0]), copy.deepcopy(games[29])]
for name, change in [
    ("future", {"end_time":1893456000}), ("no-time", {"end_time":None}),
    ("string-time", {"end_time":"bad"}), ("variant", {"rules":"chess960"}),
    ("no-player", {"white":None,"black":None}),
    ("unknown-result", {"white":{"username":USER,"result":"unknown"},"black":{"username":"other","result":"unknown"}}),
]:
    raw_games.append({**games[0], "uuid":name, **change})
raw_games += [None, [], {"end_time":-1}]
puzzle_times = ["2023-12-31T16:59:00Z", "2024-02-28T17:00:00Z", "2024-02-29T17:00:00Z",
                "2024-03-11T12:00:00Z", "2025-01-01T00:30:00Z", "2026-09-28T17:30:00Z",
                "2026-09-30T17:30:00Z", "2026-10-01T17:30:00Z",
                "2026-10-02T17:30:00Z", "2026-10-02T17:31:00Z", "2026-10-02T17:32:00Z", "2026-10-02T17:33:00Z"]
puzzles = [{"id":f"{USER}:p{i:02d}","username":USER,"puzzleId":"repeatable-puzzle",
            "attemptedAt":int(datetime.fromisoformat(t.replace("Z","+00:00")).timestamp()*1000),
            "result":"solved" if i<=8 else "failed" if i<=11 else "unknown",
            "localDate":"1999-01-01", "ratingBefore":1500, "ratingAfter":1500,
            "ratingChange":0,"puzzleRating":None,"source":"live_tracker","createdAt":1}
           for i,t in enumerate(puzzle_times,1)]
puzzles += [copy.deepcopy(puzzles[0]), {**puzzles[0],"id":"future-puzzle","attemptedAt":1893456000000}]
evaluations = [{"id":f"e{i}","gameUuid":f"g{i:02d}","best":{"type":"cp","value":300},
                "played":{"type":"cp","value":300-loss},"phase":["opening","middlegame","endgame"][(i-1)%3]}
               for i,loss in enumerate([49,50,99,100,199,200],1)]
evaluations += [
    {"id":"suppressed","gameUuid":"g07","best":{"type":"cp","value":-800},"played":{"type":"cp","value":-1100},"phase":"endgame"},
    {"id":"lost-mate","gameUuid":"g08","best":{"type":"mate","value":3},"played":{"type":"cp","value":400},"phase":"middlegame"},
    {"id":"allowed-mate","gameUuid":"g09","best":{"type":"cp","value":0},"played":{"type":"mate","value":-2},"phase":"endgame"},
]
dataset={"username":USER,"asOf":NOW,"games":raw_games,"puzzles":puzzles,"evaluations":evaluations,
         "provenance":"Synthetic raw PubAPI/recorded-puzzle/evaluation fixtures, no private account data."}
expected={"games":30,"wins":14,"losses":8,"draws":8,"rapid":10,"blitz":8,"bullet":6,"daily":6,
          "puzzles":12,"solved":8,"failed":3,"unknownPuzzles":1,"combinedActivity":42,
          "knownDurations":22,"totalTimeSeconds":2530,"rapidTimeSeconds":550,"blitzTimeSeconds":1160,
          "bulletTimeSeconds":820,"dailyExcluded":6,"unknownDurations":2,
          "currentGameStreak":4,"longestGameStreak":4,"currentPuzzleStreak":3,"longestPuzzleStreak":3,
          "currentCombinedStreak":5,"longestCombinedStreak":5,
          "inaccuracies":2,"mistakes":2,"blunders":3,
          "zones":{"UTC":{"gameActiveDays":12,"combinedActiveDays":14},
                   "Asia/Bangkok":{"gameActiveDays":14,"combinedActiveDays":16},
                   "Etc/GMT+5":{"gameActiveDays":11,"combinedActiveDays":13},
                   "America/New_York":{"gameActiveDays":11,"combinedActiveDays":13}},
          "manualDerivation":"Pool W/D/L: Rapid 5/2/3, Blitz 4/2/2, Bullet 3/1/2, Daily 2/3/1. Known seconds 10*(1+...+22)=2530; pool sums 550+1160+820. Duplicate IDs do not add activity. See golden-notes.md."}
for name,data in [("golden-user.json",dataset),("golden-expected.json",expected)]:
    (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(ROOT/"golden-notes.md").write_text("# Hand-inspectable golden controls\n\nSynthetic user only. Completion dates are converted from the UTC column to the selected local timezone.\n\n| ID | UTC completion | Pool | Result | Color | Known duration seconds |\n| --- | --- | --- | --- | --- | --- |\n"+"\n".join(rows)+"\n\nLiteral expected values are maintained in golden-expected.json. The generator does not call the extension or derive those controls from a calculation implementation. g23 has no reliable source; g24 has a corrupt negative interval. g25–g30 are Daily and excluded from played time. Every known interval ends exactly at raw end_time. Two extra game records repeat IDs; invalid records include a far-future completed game. Puzzle IDs distinguish separate attempts at the same puzzle, and one repeated ID is duplicate. Two puzzle-only days extend the combined current streak to five.\n",encoding="utf-8")
