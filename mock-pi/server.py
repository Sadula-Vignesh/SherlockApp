#!/usr/bin/env python3
"""Mock Raspberry Pi endpoint for the Sherlock app.

Stands in for the real Pi so you can test the app -> Pi Wi-Fi link before the Pi
software exists. Receives POST /nav, prints what the app sent, and replies 200.

Usage:
    python3 mock-pi/server.py            # listens on 0.0.0.0:8000
    python3 mock-pi/server.py 9000       # custom port

Then in the app's Settings, set:
    Raspberry Pi IP = this computer's LAN IP (e.g. 192.168.1.42)
    Port            = 8000

Find your LAN IP with:  ipconfig getifaddr en0   (macOS)  /  hostname -I  (Linux)
The phone and this computer must be on the same Wi-Fi.
No dependencies — Python 3 standard library only.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def _ok(self):
        body = json.dumps({"ok": True}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            print(f"[{self.path}] non-JSON body: {raw!r}")
            self._ok()
            return

        kind = data.get("type", "?")
        status = data.get("status", "?")
        print(f"\n=== POST {self.path}  type={kind}  status={status} ===")
        if data.get("ping"):
            print("  (connection test ping)")
        if data.get("destination"):
            print(f"  destination     : {data['destination']}")
        if data.get("current"):
            c = data["current"]
            print(f"  current GPS     : {c.get('lat')}, {c.get('lng')}")
        if data.get("nextInstruction"):
            print(f"  next instruction: {data['nextInstruction']}")
        if data.get("currentStepIndex") is not None:
            print(f"  step index      : {data['currentStepIndex']}")
        route = data.get("route")
        if route and route.get("steps"):
            print(f"  route           : {len(route['steps'])} steps, "
                  f"{route.get('distanceMeters')} m")
        self._ok()

    def do_GET(self):
        # Lets you sanity-check reachability in a browser.
        self._ok()

    def log_message(self, *args):
        pass  # silence default access logging; we print our own


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Mock Sherlock Pi listening on http://0.0.0.0:{port}  (POST /nav)")
    print("Point the app's Settings at this computer's LAN IP + this port.")
    print("Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
