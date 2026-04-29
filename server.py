#!/usr/bin/env python3
"""Pokemon Champions Calculator - Simple HTTP Server"""
import http.server
import os

PORT = 8080
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

if __name__ == '__main__':
    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'Serving on http://localhost:{PORT}')
        httpd.serve_forever()
