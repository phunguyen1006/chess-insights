"""Raw-data oracle. Python standard library only; never imports application code.

Dates use IANA ZoneInfo, statistics use Counter/fractions, duration is independently
parsed from explicit PGN headers (golden input has no clock/EMT fallback).
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from zoneinfo import ZoneInfo
import argparse
import csv
import json
import math
import re
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parents[1]
ZONES = ("UTC", "Asia/Bangkok", "Etc/GMT+5", "America/New_York")
DRAW = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
LOSS = {"checkmated", "resigned", "timeout", "abandoned", "lose", "bughousepartnerlose"}
ENDING = dict(checkmated="Checkmate", resigned="Resignation", timeout="Timeout",
              abandoned="Abandoned", stalemate="Stalemate", repetition="Repetition",
              insufficient="Insufficient material", agreed="Agreed draw",
              **{"50move": "50-move rule", "timevsinsufficient": "Time vs insufficient material"})
POOLS = ("rapid", "blitz", "bullet", "daily", "unknown")

def numeric(n):
    return isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)

def tags(pgn):
    return dict(re.findall(r'^\[(\w+) "([^"\r\n]*)"\]$', pgn if isinstance(pgn,str) else "", re.M))

def streak(days, today):
    days = {date.fromisoformat(d) for d in days if d <= today}
    cursor = date.fromisoformat(today)
    if cursor not in days:
        cursor -= timedelta(days=1)
    current = 0
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)
    longest = run = 0
    previous = None
    for d in sorted(days):
        run = run + 1 if previous and (d - previous).days == 1 else 1
        longest = max(longest, run)
        previous = d
    return current, longest

def wdl(rows):
    c = Counter(r["result"] for r in rows)
    n = len(rows)
    return dict(games=n, wins=c["win"], draws=c["draw"], losses=c["loss"],
                winRate=c["win"] / n * 100 if n else 0)

def normalize(dataset, zone):
    username = dataset["username"].lower()
    now = datetime.fromisoformat(dataset["asOf"].replace("Z", "+00:00")).timestamp()
    output = {}
    for raw in dataset["games"]:
        if not isinstance(raw, dict):
            continue
        sec = raw.get("end_time")
        if not numeric(sec) or not (0 < sec <= now + 60) or raw.get("rules", "chess") != "chess":
            continue
        try:
            local = datetime.fromtimestamp(sec, ZoneInfo(zone))
        except (ValueError, OverflowError, OSError):
            continue
        white, black = raw.get("white") or {}, raw.get("black") or {}
        if not isinstance(white, dict) or not isinstance(black, dict):
            continue
        color = "white" if str(white.get("username", "")).lower() == username else "black" if str(black.get("username", "")).lower() == username else None
        if color is None:
            continue
        player, other = (white, black) if color == "white" else (black, white)
        pr, op = player.get("result"), other.get("result")
        pr = pr if isinstance(pr,str) else ""
        op = op if isinstance(op,str) else ""
        result = "win" if pr == "win" else "draw" if pr in DRAW else "loss" if pr in LOSS or op == "win" else None
        if result is None:
            continue
        identity = raw.get("uuid") or raw.get("url") or f'{sec}:{str(white.get("username")).lower()}:{str(black.get("username")).lower()}:{raw.get("time_control", "")}'
        header = tags(raw.get("pgn"))
        name = header.get("Opening")
        if not name:
            url = header.get("ECOUrl") or raw.get("eco")
            if isinstance(url,str) and "/openings/" in url:
                name = unquote(urlparse(url).path.split("/openings/",1)[1]).replace("-"," ") or None
                if name:
                    family = re.match(r"^(.+?\b(?:Game|Defense|Opening|Attack|Gambit|System))\b",name,re.I)
                    if family: name = family[1]
        if name:
            name = name.split(":")[0]
        row = dict(id=f"{username}:{identity}", date=local.date().isoformat(), hour=local.hour,
                   result=result, color=color, pool=raw.get("time_class") if raw.get("time_class") in POOLS else "unknown",
                   end=sec, rated=raw.get("rated") is True, rating=player.get("rating") if numeric(player.get("rating")) else None,
                   opponentRating=other.get("rating") if numeric(other.get("rating")) else None,
                   opponent=str(other.get("username", "")).lower(), ending=ENDING.get(op if pr == "win" else pr, "Other"),
                   opening=name, eco=header.get("ECO"), raw=raw)
        output[row["id"]] = row
    games = sorted(output.values(), key=lambda r: (r["end"], r["id"]))
    attempts = {}
    for p in dataset.get("puzzles", []):
        if not isinstance(p, dict) or p.get("username") != username or not p.get("id"):
            continue
        ms = p.get("attemptedAt")
        if not numeric(ms) or not 0 < ms <= (now + 60) * 1000 or p.get("result") not in ("solved", "failed", "unknown"):
            continue
        if p["id"] not in attempts:
            attempts[p["id"]] = dict(p, localDate=datetime.fromtimestamp(ms / 1000, ZoneInfo(zone)).date().isoformat())
    return games, list(attempts.values()), datetime.fromtimestamp(now, ZoneInfo(zone)).date().isoformat()

def header_duration(raw):
    if raw.get("time_class") not in ("rapid", "blitz", "bullet"):
        return None
    h = tags(raw.get("pgn"))
    if h.get("Result") not in ("1-0", "0-1", "1/2-1/2"):
        return None
    try:
        start = datetime.strptime(h["UTCDate"] + " " + h["UTCTime"], "%Y.%m.%d %H:%M:%S").replace(tzinfo=timezone.utc)
        end = datetime.strptime((h.get("EndUTCDate") or h.get("EndDate") or h["UTCDate"]) + " " + h["EndTime"], "%Y.%m.%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if not h.get("EndUTCDate") and not h.get("EndDate") and end < start:
            end += timedelta(days=1)
        seconds = (end - start).total_seconds()
        if 0 < seconds <= {"bullet":1200, "blitz":7200, "rapid":28800}[raw["time_class"]]:
            return seconds
    except (KeyError, ValueError):
        pass
    return None

def calculate(dataset, zone):
    games, puzzles, today = normalize(dataset, zone)
    m = wdl(games)
    gd = Counter(g["date"] for g in games)
    pd = Counter(p["localDate"] for p in puzzles)
    combined = gd + pd
    m.update(gameActiveDays=len(gd), gamesPerActiveDay=len(games)/len(gd) if gd else 0,
             puzzles=len(puzzles), solved=sum(p["result"] == "solved" for p in puzzles),
             failed=sum(p["result"] == "failed" for p in puzzles), unknownPuzzles=sum(p["result"] == "unknown" for p in puzzles),
             puzzleActiveDays=len(pd), combinedActivity=len(games)+len(puzzles), combinedActiveDays=len(combined))
    m["puzzleSuccessRate"] = m["solved"]/(m["solved"]+m["failed"])*100 if m["solved"]+m["failed"] else None
    m["puzzlesPerActiveDay"] = len(puzzles)/len(pd) if pd else 0
    for kind, days in [("Game",gd),("Puzzle",pd),("Combined",combined)]:
        m[f"current{kind}Streak"], m[f"longest{kind}Streak"] = streak(days, today)
    for kind, days in [("games",gd),("puzzles",pd),("combined",combined)]:
        m[f"heatmap.{kind}"] = dict(sorted(days.items()))
        m[f"heatmap.{kind}.sum"] = sum(days.values())
    weekdays = Counter(date.fromisoformat(g["date"]).weekday() for g in games)
    hours = Counter(g["hour"] for g in games)
    m["weekdays"] = [weekdays[i] for i in range(7)]
    m["hours"] = [hours[i] for i in range(24)]
    m["puzzleWeekdays"] = [sum(date.fromisoformat(p["localDate"]).weekday() == i for p in puzzles) for i in range(7)]
    m["activityMonths"] = [sum(int(g["date"][5:7]) == i for g in games) for i in range(1,13)]
    for pool in POOLS:
        selected = [g for g in games if g["pool"] == pool]
        m[pool] = len(selected)
        m[f"pool.{pool}"] = wdl(selected)
        vals = [g["rating"] for g in selected if g["rated"] and g["rating"] is not None]
        m[f"rating.{pool}"] = dict(games=len(vals), current=vals[-1] if vals else None,
                                    start=vals[0] if vals else None, change=vals[-1]-vals[0] if len(vals)>1 else None,
                                    highest=max(vals) if vals else None, lowest=min(vals) if vals else None)
        m[f"ratingSeries.{pool}"] = vals
        m[f"ratingMean.{pool}"] = sum(vals)/len(vals) if vals else None
        m[f"rolling3.{pool}"] = [None if i<2 else sum(vals[i-2:i+1])/3 for i in range(len(vals))]
    for color in ("white","black"):
        m[f"color.{color}"] = wdl([g for g in games if g["color"] == color])
    for result in ("win", "draw", "loss"):
        m[f"ending.{result}"] = dict(Counter(g["ending"] for g in games if g["result"] == result))
    openings = defaultdict(list)
    opponents = defaultdict(list)
    for g in games:
        if g["eco"] or g["opening"]:
            openings[f'{g["color"]}:{g["eco"] or ""}:{g["opening"] or ""}'].append(g)
        if g["opponent"]:
            opponents[g["opponent"]].append(g)
    m["openings"] = {k:wdl(v) for k,v in openings.items()}
    m["opponents"] = {}
    for key, values in opponents.items():
        ratings = [g["opponentRating"] for g in values if g["opponentRating"] is not None]
        diffs = [g["rating"]-g["opponentRating"] for g in values if g["rating"] is not None and g["opponentRating"] is not None]
        m["opponents"][key] = dict(wdl(values), averageRating=math.floor(sum(ratings)/len(ratings)+0.5) if ratings else None,
                                     averageDifference=math.floor(sum(diffs)/len(diffs)+0.5) if diffs else None)
    durations = {g["id"]:header_duration(g["raw"]) for g in games}
    known = [g for g in games if durations[g["id"]] is not None]
    m.update(knownDurations=len(known), totalTimeSeconds=sum(durations[g["id"]] for g in known),
             dailyExcluded=m["daily"], unknownDurations=sum(g["pool"] in ("rapid","blitz","bullet") and durations[g["id"]] is None for g in games))
    m["averageDurationSeconds"] = m["totalTimeSeconds"]/len(known) if known else None
    m["durationCoverage"] = len(known)/(len(known)+m["unknownDurations"]) if len(known)+m["unknownDurations"] else 0
    for pool in ("rapid","blitz","bullet"):
        m[f"{pool}TimeSeconds"] = sum(durations[g["id"]] for g in known if g["pool"] == pool)
    for kind, key in [("Day",lambda g:g["date"]),("Month",lambda g:g["date"][:7]),("Week",lambda g:(date.fromisoformat(g["date"])-timedelta(days=date.fromisoformat(g["date"]).weekday())).isoformat())]:
        buckets = defaultdict(float)
        for g in known:
            buckets[key(g)] += durations[g["id"]]
        m[f"timeBy{kind}"] = dict(buckets)
    limits = (0,60,180,300,600,1200,math.inf)
    m["durationDistribution"] = [sum(lo <= durations[g["id"]] < hi for g in known) for lo,hi in zip(limits,limits[1:])]
    severity = Counter()
    phases = Counter()
    for e in dataset.get("evaluations",[]):
        a,b = e["best"],e["played"]
        s = None
        if a["type"] == "mate" or b["type"] == "mate":
            winning_lost = a["type"] == "mate" and a["value"] > 0 and not (b["type"] == "mate" and b["value"] > 0)
            losing_allowed = b["type"] == "mate" and b["value"] <= 0 and not (a["type"] == "mate" and a["value"] <= 0)
            if winning_lost or losing_allowed: s="blunder"
        elif a["value"] > -800:
            delta = a["value"] - b["value"]
            s = "blunder" if delta>=200 else "mistake" if delta>=100 else "inaccuracy" if delta>=50 else None
        if s:
            severity[s]+=1
            phases[e["phase"]]+=1
    m.update(inaccuracies=severity["inaccuracy"], mistakes=severity["mistake"], blunders=severity["blunder"], mistakePhases=dict(phases))
    return m

def flatten(value, path=""):
    if isinstance(value,dict):
        result = {}
        for k,v in value.items(): result.update(flatten(v, f"{path}.{k}" if path else k))
        return result
    if isinstance(value,list):
        return {f"{path}[{i}]":v for i,v in enumerate(value)}
    return {path:value}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",type=Path,default=ROOT/"fixtures/golden-user.json")
    parser.add_argument("--reports",type=Path,default=ROOT/"reports")
    parser.add_argument("--oracle-only",action="store_true")
    parser.add_argument("--skip-hand-controls",action="store_true",help="Only for non-golden/public datasets.")
    args = parser.parse_args()
    dataset = json.loads(args.input.read_text(encoding="utf-8"))
    controls = json.loads((ROOT/"fixtures/golden-expected.json").read_text(encoding="utf-8"))
    args.reports.mkdir(parents=True,exist_ok=True)
    all_rows, failures = [], []
    for zone in ZONES:
        name = zone.replace("/","_")
        independent = calculate(dataset,zone)
        (args.reports/f"independent-{name}.json").write_text(json.dumps(independent,indent=2,sort_keys=True)+"\n",encoding="utf-8")
        expected = {k:v for k,v in controls.items() if k not in ("zones","manualDerivation")}
        expected.update(controls["zones"][zone])
        if not args.skip_hand_controls:
            for key,val in expected.items():
                if independent.get(key) != val: failures.append(f"Hand control {zone}/{key}: {independent.get(key)} != {val}")
        if args.oracle_only: continue
        actual = json.loads((args.reports/f"extension-{name}.json").read_text(encoding="utf-8"))
        a,b = flatten(actual),flatten(independent)
        for key in sorted(a.keys()|b.keys()):
            av,bv = a.get(key,"MISSING"),b.get(key,"MISSING")
            tolerance = 1e-10 if any(word in key for word in ("winRate","SuccessRate","PerActiveDay","ratingMean","rolling3","averageDuration","durationCoverage")) else 0
            delta = av-bv if numeric(av) and numeric(bv) else None
            passed = abs(delta)<=tolerance if delta is not None else av==bv
            all_rows.append(dict(timezone=zone,metric=key,extension=av,independent=bv,difference=delta if delta is not None else "" if passed else "unequal",tolerance=tolerance,status="PASS" if passed else "FAIL"))
            if not passed: failures.append(f"{zone}/{key}: {av} != {bv}")
    if not args.oracle_only:
        with (args.reports/"comparison.csv").open("w",newline="",encoding="utf-8") as f:
            writer=csv.DictWriter(f,fieldnames=list(all_rows[0]));writer.writeheader();writer.writerows(all_rows)
    summary=dict(status="FAIL" if failures else "PASS", comparedMetrics=len(all_rows), zones=list(ZONES), goldenHandControls="FAIL" if any(x.startswith("Hand control") for x in failures) else "PASS",failures=failures)
    (args.reports/"verifier-summary.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(summary,indent=2))
    return bool(failures)

if __name__ == "__main__":
    raise SystemExit(main())
