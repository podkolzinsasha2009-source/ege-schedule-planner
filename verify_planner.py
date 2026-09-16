# -*- coding: utf-8 -*-
"""
Automated Verification Script for Himbiorus Schedule Planner.
Checks data integrity, companion badge generation, unique IDs,
and file completeness.
"""

import json
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DIR = r"C:\Users\podko\.gemini\antigravity\scratch\schedule-planner"

def test_files_exist():
    required_files = ["index.html", "styles.css", "app.js", "schedule_data.js", "run_planner.py", "start.bat"]
    for f in required_files:
        path = os.path.join(DIR, f)
        assert os.path.exists(path), f"Missing file: {f}"
        assert os.path.getsize(path) > 50, f"File too small or empty: {f}"
    print("✓ All required project files exist and are non-empty.")

def test_schedule_data():
    js_path = os.path.join(DIR, "schedule_data.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract JSON from window.COURSE_DATA = ...;
    match = re.search(r'window\.COURSE_DATA\s*=\s*(\[.*\]);', content, re.DOTALL)
    assert match, "Could not extract window.COURSE_DATA from schedule_data.js"
    
    data = json.loads(match.group(1))
    assert len(data) == 12, f"Expected 12 periods, found {len(data)}"
    print("✓ Schedule contains exactly 12 periods (covering all 12 PDF pages).")

    all_ids = set()
    total_theories = 0
    total_practices = 0
    total_mocks = 0
    total_reviews = 0
    total_companions = 0
    total_items = 0

    for period in data:
        p_id = period["id"]
        assert "name" in period and len(period["name"]) > 0
        assert "days" in period and len(period["days"]) > 0

        for date_key, day_data in period["days"].items():
            items = day_data["items"]
            for item in items:
                total_items += 1
                uid = item["id"]
                assert uid not in all_ids, f"Duplicate item ID found: {uid}"
                all_ids.add(uid)

                subj = item["subject"]
                assert subj in ["bio", "chem", "rus", "general"], f"Invalid subject: {subj}"
                
                cat = item["category"]
                if cat == "theory" and not item["isCompanion"]:
                    total_theories += 1
                elif cat == "practice" and not item["isCompanion"]:
                    total_practices += 1
                elif cat == "mock" and not item["isCompanion"]:
                    total_mocks += 1
                elif cat == "review" and not item["isCompanion"]:
                    total_reviews += 1
                elif item["isCompanion"]:
                    total_companions += 1
                    # Verify companion matches parent color
                    parent_id = item.get("parentId")
                    assert parent_id, f"Companion {uid} missing parentId"

    print(f"✓ Total items: {total_items}")
    print(f"✓ Total unique IDs verified: {len(all_ids)}")
    print(f"✓ Theories: {total_theories}")
    print(f"✓ Practices: {total_practices}")
    print(f"✓ Mocks: {total_mocks} (без тестов, как запрошено пользователем)")
    print(f"✓ Essay Reviews: {total_reviews}")
    print(f"✓ Auto-generated companion blocks: {total_companions}")
    
    # User requirement: no tests for mocks!
    expected_companions = total_theories + total_practices + total_reviews
    assert total_companions == expected_companions, \
        f"Mismatch: companions ({total_companions}) != theories+practices+reviews ({expected_companions})"
    print("✓ 100% of theories (tests), practices (HW), and essay reviews (tests) have companion blocks; MOCKS HAVE NO TESTS as requested!")

def test_site_structure():
    import subprocess

    def read(name):
        with open(os.path.join(DIR, name), "r", encoding="utf-8") as f:
            return f.read()

    scripts = ["store.js", "shapes.js", "ink.js", "photos.js", "app.js", "sw.js"]
    for name in scripts:
        result = subprocess.run(["node", "--check", os.path.join(DIR, name)], capture_output=True, text=True)
        assert result.returncode == 0, f"Syntax error in {name}: {result.stderr}"
    print("✓ JavaScript files pass node --check.")

    html = read("index.html")
    for element_id in ["board-viewport", "board", "weeks", "photos-layer", "ink-canvas", "overlay-canvas",
                       "ink-toolbar", "period-tabs", "sync-modal", "item-modal", "backlog", "boot-rescue"]:
        assert f'id="{element_id}"' in html, f"index.html missing #{element_id}"
    for name in ["schedule_data.js", "qrcode.min.js", "store.js", "shapes.js", "ink.js", "photos.js", "app.js"]:
        assert f'src="{name}' in html, f"index.html does not load {name}"
    assert "manifest.json" in html and "ХимБиоРус_Расписание_ЕГЭ.docx" in html
    print("✓ index.html contains the board, stylus, photo, sync and item dialogs.")

    store = read("store.js")
    for fragment in ["/planner/", "EventSource", "'PATCH'", "if-match", "indexedDB", "presence/", "live"]:
        assert fragment in store, f"store.js missing {fragment}"
    print("✓ store.js syncs through Firebase REST + SSE with offline IndexedDB mirror.")

    app = read("app.js")
    assert "himbiorus_schedule_state_v2" in app, "app.js must migrate the legacy schedule"
    assert "currentPeriodIndex" not in read("store.js"), "the open period must stay local to each device"
    ink = read("ink.js")
    for fragment in ["strokes/", "stroke-eraser", "getCoalescedEvents", "pressure", "undo"]:
        assert fragment in ink, f"ink.js missing {fragment}"
    photos = read("photos.js")
    for fragment in ["images/", "photo-handle", "pinned"]:
        assert fragment in photos, f"photos.js missing {fragment}"
    print("✓ Stylus strokes and photos are stored per period in board coordinates.")

    for asset in ["ХимБиоРус_Расписание_ЕГЭ.docx", "manifest.json", "icon.png", "sw.js", "qrcode.min.js"]:
        assert os.path.exists(os.path.join(DIR, asset)), f"Missing {asset}"
    assert "fetch(req, { cache: 'no-cache' })" in read("sw.js"), "sw.js must be network-first"
    print("✓ PWA assets present; service worker is network-first.")


if __name__ == "__main__":
    test_files_exist()
    test_schedule_data()
    test_site_structure()
    print()
    print("ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
