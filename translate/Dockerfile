# LibreTranslate mit kleinem Wächter: die App kann die Sprachliste ändern und den Übersetzer neu starten lassen
# (ohne Zugriff auf Docker). Der Wächter lauscht nur im internen Netz auf Port 5001.
FROM libretranslate/libretranslate:latest
COPY supervisor.py /app/supervisor.py
EXPOSE 5000 5001
ENTRYPOINT ["./venv/bin/python", "/app/supervisor.py"]
