# -*- coding: utf-8 -*-
"""
Local and Network launcher for Himbiorus Schedule Planner.
Starts a lightweight local HTTP server accessible from PC and tablets on Wi-Fi.
Generates QR codes automatically for instant tablet connection.
"""

import http.server
import socketserver
import socket
import webbrowser
import os
import sys
import json

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    # Fallback to UDP socket trick if no IP found
    if not ips:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            ips.append(ip)
        except Exception:
            ips.append('127.0.0.1')
        finally:
            s.close()

    def ip_score(ip):
        if ip.startswith('192.168.'): return 0
        if ip.startswith('10.'): return 1
        if ip.startswith('172.'): return 2
        return 3

    ips.sort(key=ip_score)
    return ips

def generate_qr_codes(target_url):
    try:
        import qrcode
        import qrcode.image.svg

        # SVG for crisp vector retina display
        svg_factory = qrcode.image.svg.SvgPathImage
        svg_img = qrcode.make(target_url, image_factory=svg_factory)
        svg_path = os.path.join(DIRECTORY, 'tablet_qr.svg')
        svg_img.save(svg_path)

        # PNG for universal compatibility
        png_img = qrcode.make(target_url)
        png_path = os.path.join(DIRECTORY, 'tablet_qr.png')
        png_img.save(png_path)
        return True
    except Exception as e:
        print(f"Предупреждение: не удалось создать QR-код: {e}")
        return False

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/network-info.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            all_ips = get_local_ips()
            best_ip = all_ips[0] if all_ips else '127.0.0.1'
            port = self.server.server_address[1]
            info = {
                "local_ip": best_ip,
                "all_ips": all_ips,
                "port": port,
                "url": f"http://{best_ip}:{port}/index.html",
                "qr_svg": "/tablet_qr.svg",
                "qr_png": "/tablet_qr.png"
            }
            self.wfile.write(json.dumps(info, ensure_ascii=False).encode('utf-8'))
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)
    port = PORT
    all_ips = get_local_ips()
    best_ip = all_ips[0] if all_ips else '127.0.0.1'

    # Find open port
    for attempt in range(10):
        try:
            # Bind to "0.0.0.0" so tablets on the same Wi-Fi can connect
            with socketserver.TCPServer(("0.0.0.0", port), Handler) as httpd:
                local_url = f"http://localhost:{port}/index.html"
                network_url = f"http://{best_ip}:{port}/index.html"

                # Generate QR code for tablet
                generate_qr_codes(network_url)

                print("=" * 65)
                print("ИНТЕРАКТИВНЫЙ ПЛАНИРОВЩИК «ХИМБИОРУС ЕГЭ» ЗАПУЩЕН!")
                print("=" * 65)
                print(f"💻 На этом компьютере:   {local_url}")
                print(f"📱 На планшете (Wi-Fi):  {network_url}")
                if len(all_ips) > 1:
                    print(f"   (Альтернативные IP: {', '.join(all_ips[1:])})")
                print("=" * 65)
                print("На планшете:")
                print("1. Откройте камеру и наведите на QR-код в приложении.")
                print("2. Либо введите адрес выше в браузере (Safari / Chrome).")
                print("3. В Safari нажмите «Поделиться» → «На экран Домой» для режима приложения!")
                print("=" * 65)
                print("Нажмите Ctrl+C для остановки сервера.")
                print("=" * 65)
                webbrowser.open(local_url)
                httpd.serve_forever()
                break
        except OSError:
            port += 1

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
