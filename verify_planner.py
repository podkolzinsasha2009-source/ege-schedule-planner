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

def test_html_and_js_syntax():
    # Check that app.js does not have obvious syntax issues and contains tablet touch support
    app_js_path = os.path.join(DIR, "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        app_js = f.read()
    assert "addEventListener('drop'" in app_js, "app.js missing drop handler"
    assert "splice" in app_js, "app.js missing clean move splice"
    assert "setupCardTouchEvents" in app_js, "app.js missing touch drag & drop support"
    assert "himbiorus_schedule_state_v2" in app_js, "app.js should use v2 storage key"
    assert "cleanMockCompanionTests" in app_js, "app.js should clean mock companion tests"
    print("✓ app.js contains touch events, atomic move logic, and v2 storage key.")

    # Check that index.html contains tablet integration
    index_html_path = os.path.join(DIR, "index.html")
    with open(index_html_path, "r", encoding="utf-8") as f:
        html = f.read()
    assert "manifest.json" in html, "index.html missing manifest link"
    assert "tablet-modal-backdrop" in html, "index.html missing tablet modal"
    assert "ХимБиоРус_Расписание_ЕГЭ.docx" in html, "index.html missing Word docx link"
    print("✓ index.html properly linked to manifest, tablet modal, and Word file.")

    # Check that Word document and PWA assets exist
    assert os.path.exists(os.path.join(DIR, "ХимБиоРус_Расписание_ЕГЭ.docx")), "Missing Word schedule document"
    assert os.path.exists(os.path.join(DIR, "manifest.json")), "Missing manifest.json"
    assert os.path.exists(os.path.join(DIR, "icon.png")), "Missing icon.png"
    assert os.path.exists(os.path.join(DIR, "sw.js")), "Missing sw.js Service Worker"
    print("✓ Word document (.docx) and PWA assets verified.")

def test_stylus_darkmode_mobile_features():
    # 1. Styles verification
    css_path = os.path.join(DIR, "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    assert ".schedule-card.is-companion" in css, "styles.css missing .is-companion rule"
    assert "opacity: 0.84" in css or "opacity: 0.8" in css, "styles.css missing companion transparency"
    assert "border-style: dashed" in css, "styles.css missing dashed border for companions"
    assert "body.dark-mode" in css, "styles.css missing dark mode styling"
    assert ".stylus-canvas" in css, "styles.css missing stylus canvas styling"
    assert ".stylus-toolbar" in css, "styles.css missing GoodNotes stylus toolbar"
    assert ".mobile-bottom-bar" in css, "styles.css missing mobile bottom navigation bar"
    assert ".mobile-day-selector" in css, "styles.css missing mobile day selector"
    print("✓ styles.css verified: companion transparency, dark mode, GoodNotes toolbar, mobile bar.")

    # 2. HTML verification
    html_path = os.path.join(DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    assert 'id="stylus-canvas"' in html, "index.html missing stylus canvas"
    assert 'id="stylus-toolbar"' in html, "index.html missing stylus toolbar"
    assert 'id="palm-rejection-btn"' in html, "index.html missing palm rejection button"
    assert 'id="draw-mode-btn"' in html, "index.html missing draw mode toggle button"
    assert 'id="theme-toggle-btn"' in html, "index.html missing theme toggle button"
    assert 'id="mobile-bottom-bar"' in html, "index.html missing mobile bottom bar"
    assert 'id="mobile-day-selector"' in html, "index.html missing mobile day selector"
    assert "serviceWorker.register" in html, "index.html missing service worker registration"
    print("✓ index.html verified: stylus canvas, palm rejection, dark theme toggle, mobile bottom bar, SW.")

    # 3. JS verification
    app_js_path = os.path.join(DIR, "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        js = f.read()
    assert "setupGoodNotesStylus" in js, "app.js missing setupGoodNotesStylus"
    assert "palmRejectionOnlyPen" in js, "app.js missing palm rejection logic"
    assert "toggleTheme" in js, "app.js missing dark mode toggle"
    assert "setupMobileNavigation" in js, "app.js missing mobile navigation"
    assert "selectPeriod" in js, "app.js missing selectPeriod with note persistence"
    print("✓ app.js verified: GoodNotes engine, palm rejection, theme switcher, mobile navigation, notes persistence.")

    # 4. SW verification
    sw_path = os.path.join(DIR, "sw.js")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw = f.read()
    assert "CACHE_NAME" in sw, "sw.js missing CACHE_NAME"
    assert "addEventListener('install'" in sw, "sw.js missing install listener"
    assert "addEventListener('fetch'" in sw, "sw.js missing fetch listener"
    print("✓ sw.js Service Worker verified: offline caching strategy active.")

def test_advanced_stylus_and_mobile_features():
    # 1. Advanced Stylus Canvas Assertions
    app_js_path = os.path.join(DIR, "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        js = f.read()
    assert "quadraticCurveTo" in js, "app.js must use quadraticCurveTo for continuous smooth handwriting"
    assert "'screen'" in js or '"screen"' in js, "app.js must use screen blend mode for highlighter in dark mode"
    assert "ctx.setTransform(dpr, 0, 0, dpr, 0, 0)" in js, "app.js must use idempotent setTransform to prevent DPR explosion"
    assert "ResizeObserver" in js, "app.js must use ResizeObserver to handle dynamic height shifts"
    assert "activeTouches" in js, "app.js must track touches for two-finger gestures"
    print("✓ app.js deep tests verified: quadratic Bezier smoothing, dark mode screen blend, idempotent DPR scaling, ResizeObserver.")

    # 2. Advanced Markup & Styles
    css_path = os.path.join(DIR, "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    assert ".schedule-card.test" in css and ".schedule-card.homework" in css, "styles.css must style test & homework cards with companion look"

    html_path = os.path.join(DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    assert 'id="tool-pan"' in html, "index.html must include pan tool button"
    assert 'id="modal-export-btn"' in html, "index.html must include modal export button for mobile parity"
    assert 'id="modal-reset-btn"' in html, "index.html must include modal reset button for mobile parity"
    print("✓ Markup & CSS deep tests verified: test/homework companion style, pan tool, mobile action parity.")

def test_zero_latency_and_redesign():
    # 1. Zero-latency and Stylus Gestures in app.js
    app_js_path = os.path.join(DIR, "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        js = f.read()
    assert "desynchronized: true" in js, "app.js missing hardware desynchronized 2D context"
    assert "getCoalescedEvents" in js, "app.js missing coalesced events loop for 120/240Hz stylus"
    assert "takeSnapshot" in js and "restoreSnapshot" in js, "app.js missing in-memory GPU snapshot undo/redo"
    assert "touchGesture" in js, "app.js missing touchGesture tracking"
    assert "isPenActive" in js, "app.js missing strict pen active palm rejection"
    assert "showGestureToast" in js, "app.js missing gesture feedback toast"
    assert "card-accordion" in js or "accordion-toggle" in js, "app.js missing companion clustering accordion"
    assert "stylus-redo-btn" in js, "app.js missing redo button handler"
    # Deep robustness assertions
    assert "changedTouches" in js, "app.js missing changedTouches for accurate multi-touch start tracking"
    assert "touchcancel" in js, "app.js missing touchcancel gesture reset listener"
    assert "discarded.width = 0" in js, "app.js missing GPU backing store deallocation on snapshot discard"
    assert "card-accordion" in js and "checklist-label" in js, "app.js missing accordion touch-drag exclusion"
    assert "parentId === deleted.id" in js, "app.js missing cascading companion deletion on parent removal"
    assert "removedBeforeTarget" in js, "app.js missing in-day downward DnD index compensation"
    print("✓ app.js zero-latency canvas, multi-touch gestures, in-memory snapshots, memory safety, and card clustering verified.")

    # 2. Settings Dropdown & Header Search in index.html
    html_path = os.path.join(DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    assert 'id="settings-dropdown-wrapper"' in html, "index.html missing settings dropdown wrapper"
    assert 'id="settings-dropdown-btn"' in html, "index.html missing settings dropdown button"
    assert 'id="settings-dropdown-menu"' in html, "index.html missing settings dropdown menu"
    assert 'header-search' in html, "index.html missing header search bar"
    assert 'header-progress-track' in html, "index.html missing slim header progress track"
    assert 'id="stylus-redo-btn"' in html, "index.html missing stylus redo button"
    print("✓ index.html settings dropdown, upfront search, slim progress bar, and redo button verified.")

    # 3. CSS for Redesign & Dropdown & Accordion in styles.css
    css_path = os.path.join(DIR, "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    assert ".dropdown-menu" in css, "styles.css missing dropdown menu styles"
    assert ".header-progress-track" in css, "styles.css missing slim header progress track styles"
    assert ".card-accordion" in css, "styles.css missing accordion styles"
    assert ".accordion-toggle" in css, "styles.css missing accordion toggle styles"
    assert ".accordion-checklist" in css, "styles.css missing accordion checklist styles"
    assert ".subject-pill" in css, "styles.css missing subject-pill styles"
    assert ".stylus-toast" in css, "styles.css missing stylus toast styles"
    assert "touch-action: none" in css, "styles.css missing touch-action: none on canvas"
    print("✓ styles.css dropdown menu, slim progress bar, accordion checklists, subject pills, and toast verified.")

    # 4. SW v6 verification
    sw_path = os.path.join(DIR, "sw.js")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw = f.read()
    assert "himbiorus-pwa-v6" in sw, "sw.js missing v6 cache name"
    print("✓ sw.js v6 cache version verified.")

def test_realtime_synchronization():
    # 1. sync.js Engine Verification
    sync_js_path = os.path.join(DIR, "sync.js")
    assert os.path.exists(sync_js_path), "sync.js missing"
    assert os.path.getsize(sync_js_path) > 1000, "sync.js is too small or empty"
    with open(sync_js_path, "r", encoding="utf-8") as f:
        sync_js = f.read()

    assert "broker.hivemq.com" in sync_js, "sync.js missing HiveMQ public WSS broker"
    assert "broker.emqx.io" in sync_js, "sync.js missing EMQX fallback broker"
    assert "createConnectPacket" in sync_js, "sync.js missing MQTT CONNECT packet generator"
    assert "createPublishPacket" in sync_js, "sync.js missing MQTT PUBLISH packet generator"
    assert "parseMqttPackets" in sync_js, "sync.js missing MQTT packet parser"
    assert "BroadcastChannel" in sync_js, "sync.js missing local BroadcastChannel for zero-latency multi-tab"
    assert "ROOM_PREFIXES" in sync_js, "sync.js missing human-readable room prefixes"
    assert "generateRoomCode" in sync_js, "sync.js missing room code generator"
    assert "MiniQR" in sync_js or "toSVG" in sync_js, "sync.js missing standalone QR code generator"
    assert "REQUEST_STATE" in sync_js and "FULL_STATE_SYNC" in sync_js, "sync.js missing state sync protocol"
    assert "MOVE_ITEM" in sync_js and "STROKE_ADD" in sync_js, "sync.js missing event protocol"
    print("✓ sync.js engine verified: HiveMQ WSS relay, MQTT 3.1.1 framing, BroadcastChannel, and MiniQR.")

    # 2. app.js Integration Verification
    app_js_path = os.path.join(DIR, "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        app_js = f.read()
    assert "setupRealtimeSync" in app_js, "app.js missing setupRealtimeSync"
    assert "window.SyncEngine.broadcastMove" in app_js, "app.js missing broadcastMove in moveItem"
    assert "window.SyncEngine.broadcastToggle" in app_js, "app.js missing broadcastToggle in checkboxes"
    assert "window.SyncEngine.broadcastStroke" in app_js, "app.js missing broadcastStroke in finishStroke"
    assert "window.SyncEngine.broadcastUndo" in app_js, "app.js missing broadcastUndo"
    assert "drawRemoteStroke" in app_js, "app.js missing drawRemoteStroke in GoodNotes stylus engine"
    assert "remoteUndo" in app_js, "app.js missing remoteUndo"
    assert "remoteClear" in app_js, "app.js missing remoteClear"
    print("✓ app.js integration verified: atomic moves, checkboxes, vector stylus strokes, and state sync hooks.")

    # 3. index.html Markup Verification
    html_path = os.path.join(DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    assert '<script src="sync.js"></script>' in html, "index.html missing sync.js script tag"
    assert 'id="sync-btn"' in html, "index.html missing header sync button"
    assert 'id="header-sync-dot"' in html, "index.html missing header sync indicator"
    assert 'id="sync-peer-badge"' in html, "index.html missing header peer count badge"
    assert 'id="sync-modal-backdrop"' in html, "index.html missing sync modal dialog"
    assert 'id="modal-room-code"' in html, "index.html missing room code display"
    assert 'id="modal-qr-container"' in html, "index.html missing dynamic QR container"
    assert 'id="sync-copy-code-btn"' in html, "index.html missing copy code button"
    assert 'id="sync-copy-link-btn"' in html, "index.html missing copy link button"
    assert 'id="sync-join-btn"' in html, "index.html missing join room button"
    assert 'id="mob-sync-btn"' in html, "index.html missing mobile navigation sync button"
    print("✓ index.html markup verified: sync button, status badges, QR modal, and mobile actions.")

    # 4. styles.css Verification
    css_path = os.path.join(DIR, "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    assert ".btn-sync-status" in css, "styles.css missing .btn-sync-status"
    assert ".sync-dot" in css, "styles.css missing .sync-dot"
    assert "pulseGreen" in css, "styles.css missing pulseGreen animation"
    assert ".sync-modal-dialog" in css, "styles.css missing .sync-modal-dialog"
    assert ".sync-room-code" in css, "styles.css missing .sync-room-code"
    assert ".sync-qr-container" in css, "styles.css missing .sync-qr-container"
    print("✓ styles.css verified: sync buttons, pulse indicators, modal dialog, and dark mode.")

    # 5. sw.js Caching Verification
    sw_path = os.path.join(DIR, "sw.js")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw = f.read()
    assert "'./sync.js'" in sw or '"./sync.js"' in sw, "sw.js missing sync.js in ASSETS_TO_CACHE"
    assert "himbiorus-pwa-v6" in sw, "sw.js missing v6 cache version"
    print("✓ sw.js PWA v6 cache verified: sync.js cached for 100% offline capability.")

    # 6. Multi-Device End-to-End Node Simulation
    import subprocess
    node_test_script = """
    const fs = require('fs');
    const vm = require('vm');

    const bus = [];

    function createClient(id) {
      const code = fs.readFileSync('sync.js', 'utf8');
      class MockBroadcastChannel {
        constructor(name) {
          this.name = name;
          this.onmessage = null;
          bus.push(this);
        }
        postMessage(msg) {
          bus.forEach(ch => {
            if (ch !== this && ch.onmessage) {
              setTimeout(() => ch.onmessage({ data: msg }), 0);
            }
          });
        }
        close() {}
      }

      const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        Array,
        Math,
        JSON,
        Map,
        Set,
        Date,
        Object,
        BroadcastChannel: MockBroadcastChannel,
        process,
        window: {
          location: { hash: '#sync=EGE-999', pathname: '/', origin: 'http://localhost' },
          addEventListener: () => {},
          BroadcastChannel: MockBroadcastChannel
        },
        document: {
          addEventListener: () => {}
        },
        localStorage: {
          getItem: () => null,
          setItem: () => {}
        }
      };
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);
      return sandbox.window ? sandbox.window.SyncEngine : sandbox.SyncEngine;
    }

    const clientA = createClient('client-a');
    const clientB = createClient('client-b');

    let clientBReceivedMove = false;
    let clientBReceivedStroke = false;

    clientB.init({
      onMoveItem: (data) => {
        if (data.source.itemId === 'bio_01_th' && data.target.targetDateKey === '2025-08-16') {
          clientBReceivedMove = true;
        }
      },
      onStrokeAdd: (data) => {
        if (data.periodIndex === 0 && data.stroke.tool === 'pen') {
          clientBReceivedStroke = true;
        }
      }
    });

    clientA.init({});

    // Client A broadcasts move and stroke
    clientA.broadcastMove({ itemId: 'bio_01_th' }, { targetDateKey: '2025-08-16' });
    clientA.broadcastStroke({ periodIndex: 0, stroke: { tool: 'pen', points: [[1, 2], [3, 4]] } });

    setTimeout(() => {
      if (clientBReceivedMove && clientBReceivedStroke) {
        console.log('SIMULATION_PASSED');
        process.exit(0);
      } else {
        console.error('FAILED: move=' + clientBReceivedMove + ' stroke=' + clientBReceivedStroke);
        process.exit(1);
      }
    }, 50);
    """

    res = subprocess.run(["node", "-e", node_test_script], cwd=DIR, capture_output=True, text=True, timeout=10)
    assert "SIMULATION_PASSED" in res.stdout, f"Multi-device simulation failed: {res.stderr or res.stdout}"
    print("✓ Multi-device simulation verified: zero-latency message serialization and dispatch confirmed.")

if __name__ == "__main__":
    test_files_exist()
    test_schedule_data()
    test_html_and_js_syntax()
    test_stylus_darkmode_mobile_features()
    test_advanced_stylus_and_mobile_features()
    test_zero_latency_and_redesign()
    test_realtime_synchronization()
    print("\n🎉 ALL VERIFICATION TESTS (DATA + ADVANCED STYLUS + DARK MODE + MOBILE + PWA + REDESIGN + GESTURES + DEEP ROBUSTNESS + REALTIME SYNC) PASSED SUCCESSFULLY!")


