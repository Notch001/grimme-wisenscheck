# Wissenscheck

Vorab-Wissenscheck für Schulungsteilnehmer: Abfrage anlegen, Teilnehmer einladen (persönlicher Link),
nach Abgabe individuelle Auswertung (nur Admin) mit Schwächen je Themenbereich und Vorschlag für Schulung / Weiterbildungsplan.
Läuft komplett in Docker (Node.js + PostgreSQL), keine externen Dienste.

## Start

```bash
cp .env.example .env     # Passwörter anpassen
docker compose up --build
```

- Admin: http://localhost:3000/ – beim ersten Start wird der Benutzer `admin` mit dem Passwort aus `ADMIN_PASSWORD` angelegt (Standard `admin`); weitere Admins unter „Benutzer“
- Teilnehmer: persönlicher Link `http://localhost:3000/t/<token>` (siehe Abfrage → Teilnehmer)
- Beim ersten Start wird eine Demo-Abfrage mit 48 Aufgaben aus der PowerPoint-Vorlage,
  3 ausgewerteten Demo-Teilnehmern und dem offenen Link `/t/demo-test` angelegt (`SEED_DEMO=false` schaltet das ab).

## Aufgabentypen

Einfach-/Mehrfachauswahl, Falsches durchstreichen, Reihenfolge, Zuordnung (Tabellen, Positionsnummern),
Zahlenwert, Kurztext, Bild beschriften (Bezeichnungen im Bild platzieren), Im Bild markieren (z. B. Sensoren im Schaltplan),
Zeichnen (Schaltplan-Editor mit Symbolen/Linien/Freihand), Praktische Aufgabe (Bewertung durch Ausbilder per Kriterienliste).
Automatisch bewertbare Typen werden sofort gewertet; Zeichnen/Praxis bewertet der Admin (0–100 %).

## Auswertung

Gruppenmatrix (Teilnehmer × Themenbereich, Ampel: < 50 % Schulungsbedarf, < 75 % Auffrischung), Gruppen-Ø, CSV-Export,
je Teilnehmer: Balken, Profil-Radar, Antworten vs. Lösung, Weiterbildungsvorschlag aus den Lernzielen nicht gelöster Aufgaben, Druckansicht.
Teilnehmer sehen nie Lösungen oder Ergebnisse (Lösungen werden serverseitig aus der Teilnehmer-API entfernt).

## Auswertung über mehrere Abfragen

- **Vorher/Nachher-Vergleich:** in der Auswertung eine frühere Abfrage wählen, Teilnehmer werden über E-Mail (sonst Name) zugeordnet.
- **Verläufe:** Menü „Verläufe“, Entwicklung einer Person über alle Abfragen. Für saubere Zuordnung überall dieselbe E-Mail verwenden.
- **Weiterbildungsplan:** je Teilnehmer bearbeitbar (Maßnahme, Verantwortlich, Termin, Status), Vorschlag aus den Lernzielen, druckbar/PDF.

## Komfort

Abfragen und Fragen duplizieren, Teilnehmer per CSV importieren, Fragen inkl. Bildern exportieren/importieren,
Antwortoptionen je Teilnehmer gemischt (pro Frage abschaltbar), touchfreundliche Bedienung inkl. Zeichnen.

## Optionen je Abfrage

- **Zeitlimit** (Minuten, leer = keins): läuft ab dem ersten Öffnen des Links, Countdown für den Teilnehmer, danach automatische Abgabe (serverseitig durchgesetzt).
- **Schwellenwerte** für „Schulungsbedarf“ / „Auffrischung“ (Standard 50 / 75 %).
- **Ergebnis für Teilnehmer**: optional wird nach der Abgabe die Prozentzahl je Themenbereich angezeigt (nie Lösungen).

## Mehrsprachigkeit (automatische Übersetzung)

Fragen und Oberfläche werden auf Deutsch gepflegt und maschinell in weitere Sprachen übersetzt. Teilnehmer wählen die Sprache oben rechts
oder über den Link (`/t/<token>?lang=pl`); die Wahl bleibt beim Wechsel erhalten (Antworten, Timer, Position).

- **Sprachen freigeben:** im Admin-Bereich unter „Sprachen“ → „Sprachen freigeben“ (gespeichert in der Datenbank). `ENABLED_LANGS` in der `.env` ist nur der Startwert. Deutsch ist immer die Quelle.
- **Übersetzer-Container:** lädt nur die Sprachen aus `TRANSLATE_LOAD_LANGS` (leer = wie `ENABLED_LANGS`). Zusätzliche Sprachen lädt der Übersetzer nach einem Neustart: im Admin-Bereich unter „Sprachen“ erscheint dann „Übersetzer neu starten und Sprachen laden“ mit Fortschrittsanzeige (ein kleiner Steuerdienst im Container `translate`, Port 5001 nur intern, braucht keinen Docker-Zugriff). Beim Neustart werden nur die freigegebenen Sprachen geladen; fehlende Modelle werden dabei heruntergeladen (Internet nötig, beim ersten Mal einige Minuten). Nach dem Update einmal `docker compose up -d --build translate` ausführen.
- **Übersetzer:** Standard ist der Container `translate` (LibreTranslate, kostenlos, Texte bleiben im Haus). Er lädt nur die aktivierten Sprachen (Speicherbedarf einplanen, grob 2–4 GB).
  Optional für bessere Qualität: `DEEPL_API_KEY` setzen, dann wird DeepL genutzt (Texte gehen an DeepL).
- **Admin → Sprachen:** je Sprache „Alles übersetzen“ (Oberfläche, Themen, Abfragen, Fragen), danach Texte prüfen/korrigieren und als „geprüft“ markieren.
  Ändert sich der deutsche Originaltext, wird die Übersetzung als „veraltet“ angezeigt und beim nächsten Lauf neu übersetzt (geprüfte, aktuelle Übersetzungen bleiben unberührt).
- Eine Sprache erscheint für Teilnehmer erst, wenn ihre Oberfläche übersetzt ist; fehlende Inhalte werden auf Deutsch angezeigt.
- Die Bewertung ist sprachunabhängig (Antwort-IDs bleiben gleich). **Kurztext-Fragen** werden in Fremdsprachen nicht automatisch bewertet, sondern vom Ausbilder.
- Nicht übersetzt werden Texte in Bildern. Der Admin-Bereich bleibt deutsch.

## Betrieb hinter einem Reverse-Proxy / unter einem Unterpfad

Für `https://example.de/wissen` in der `.env` `BASE_PATH=/wissen` setzen und neu bauen (`docker compose up -d --build`).
Der Proxy leitet `/wissen/` an den App-Container (Port 3000) weiter – mit oder ohne Entfernen des Prefix, beides funktioniert.
Entfernt der Proxy den Prefix und sendet `X-Forwarded-Prefix` (Traefik/Coolify tun das), erkennt die App den Unterpfad auch ohne `BASE_PATH`.
Beispiel nginx: `location /wissen/ { proxy_pass http://127.0.0.1:3000/wissen/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 60m; }`

## Entwicklung

`app/` (Express, `pg`, Vanilla-JS-Frontend ohne Build). Tests: `cd app && npm test`.

> **Hinweis:** Die Musterlösungen der Beispielaufgaben sind Annahmen und müssen fachlich geprüft werden
> (u. a. Positionsnummern Erntemaschine, Faustformel Drehzahl, Schweißverfahren-Zuordnung, Platzierungen im Maschinenbild).
