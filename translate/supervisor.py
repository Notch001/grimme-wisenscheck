"""Startet LibreTranslate und startet es auf Anfrage mit anderen Sprachen neu.

GET  /state   -> {"state": "starting|ready|stopped", "langs": [...]}
POST /reload  -> {"langs": ["en", "es"]} speichert die Liste und startet LibreTranslate neu (Antwort 202)

Die Sprachliste wird im Modell-Volume gespeichert und überlebt Neustarts des Containers.
Beim Neustart wird mit LT_UPDATE_MODELS=true gestartet, damit fehlende Sprachmodelle geladen werden.
"""
import json
import os
import re
import signal
import subprocess
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

COMMAND = os.environ.get('LT_COMMAND', './venv/bin/libretranslate').split()
LT_PORT = os.environ.get('LT_PORT', '5000')
CONTROL_PORT = int(os.environ.get('CONTROL_PORT', '5001'))
STATE_FILE = os.environ.get('LANGS_FILE', '/home/libretranslate/.local/langs.json')
CODE = re.compile(r'^[a-z]{2,3}(-[A-Za-z]{2,4})?$')

lock = threading.Lock()
proc = None
langs = []


def load_langs():
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
        if isinstance(data, list) and all(isinstance(c, str) and CODE.match(c) for c in data):
            return data
    except (OSError, ValueError):
        pass
    return [c.strip() for c in os.environ.get('LT_LOAD_ONLY', '').split(',') if CODE.match(c.strip())]


def save_langs(value):
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            json.dump(value, f)
    except OSError as e:
        print('Sprachliste konnte nicht gespeichert werden:', e, flush=True)


def start(update_models):
    global proc
    env = dict(os.environ, LT_HOST='0.0.0.0', LT_PORT=LT_PORT, LT_UPDATE_MODELS='true' if update_models else 'false')
    if langs:
        env['LT_LOAD_ONLY'] = ','.join(langs)
    print('Starte Übersetzer mit Sprachen:', env.get('LT_LOAD_ONLY', '(alle)'), flush=True)
    proc = subprocess.Popen(COMMAND, env=env)


def stop():
    global proc
    if proc and proc.poll() is None:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    proc = None


def lt_ready():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{LT_PORT}/languages', timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != '/state':
            return self.send(404, {'error': 'unbekannt'})
        alive = proc is not None and proc.poll() is None
        state = 'stopped' if not alive else 'ready' if lt_ready() else 'starting'
        self.send(200, {'state': state, 'langs': langs})

    def do_POST(self):
        if self.path != '/reload':
            return self.send(404, {'error': 'unbekannt'})
        try:
            n = min(int(self.headers.get('Content-Length', 0)), 4096)
            body = json.loads(self.rfile.read(n) or b'{}')
        except ValueError:
            return self.send(400, {'error': 'ungültig'})
        new = body.get('langs')
        if not isinstance(new, list) or not new or not all(isinstance(c, str) and CODE.match(c) for c in new):
            return self.send(400, {'error': 'Sprachliste ungültig'})
        threading.Thread(target=reload, args=(list(dict.fromkeys(new)),), daemon=True).start()
        self.send(202, {'ok': True})


def reload(new):
    global langs
    with lock:
        langs = new
        save_langs(langs)
        stop()
        start(True)


def main():
    global langs
    langs = load_langs()
    start(False)
    server = ThreadingHTTPServer(('0.0.0.0', CONTROL_PORT), Handler)
    signal.signal(signal.SIGTERM, lambda *a: (stop(), os._exit(0)))
    server.serve_forever()


if __name__ == '__main__':
    main()
