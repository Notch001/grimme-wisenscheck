# TODO – Wissenscheck

Stand: Prototyp läuft (Coolify, Unterpfad `/wissen`). Offene Punkte nach Priorität.

## Vor dem echten Einsatz
- [ ] Eigene Werte für `ADMIN_PASSWORD`, `SESSION_SECRET`, `DB_PASSWORD` in Coolify setzen; Passwort des Benutzers `admin` im Tool unter „Benutzer“ ändern
- [ ] Backup einrichten: Datenbank + Upload-Volume (Coolify „Scheduled Backups“); Fragen-Export als zusätzliche Notfallkopie
- [ ] Musterlösungen der Beispielaufgaben fachlich prüfen (Positionsnummern Erntemaschine, Faustformel Drehzahl, Schweißverfahren-Zuordnung, Platzierungen im Maschinenbild, Wartungs-/Diagnosefragen)
- [ ] Demo-Daten entfernen (`SEED_DEMO=false` bzw. Demo-Abfrage und Beispielteilnehmer löschen)
- [ ] HTTPS im Browser prüfen

## Inhalte
- [ ] Restliche Aufgaben aus der PowerPoint (PDF-Seiten 33–81) einpflegen: Rübentechnik, Pflanztechnik, Steckdosen-Pins, Dammtrommeln, Trenngeräte A/B u. a.
- [ ] Hydraulik-Schaltpläne: 6/3-Wegeventile markieren, Ölfluss „Tiefenführung“ einzeichnen
- [ ] Lernziele je Aufgabe prüfen/ergänzen (Basis für den Weiterbildungsplan)

## Technik
- [ ] Login-Absicherung: Begrenzung von Fehlversuchen (Rate-Limit)
- [ ] Automatische Oberflächentests (Playwright) zusätzlich zu den Unit-Tests der Bewertungslogik
- [ ] Docker-Setup mit `docker compose up --build` auf einem frischen System gegenprüfen

## Optional / später
- [ ] Zuordnung von Teilnehmern zu einzelnen Ausbildern (Sichtbarkeit einschränken)
- [ ] E-Mail-Versand der Teilnehmerlinks (eigener Mailserver im Docker-Setup)
- [ ] Automatische Vorprüfung von Schaltplan-Zeichnungen gegen eine Musterlösung
- [ ] Flexiblere Zahleneingaben (mehrere akzeptierte Einheiten/Bereiche)

## Erledigt
- [x] Abfragen, 11 Aufgabentypen inkl. Zeichen-Editor, Bild beschriften, Im Bild markieren
- [x] Individuelle und Gruppen-Auswertung (nur Admin), CSV-Export
- [x] Weiterbildungsplan (bearbeitbar, druckbar), Vorher/Nachher-Vergleich, Verläufe
- [x] Mehrere Admin-Benutzer, optionales Zeitlimit, einstellbare Schwellenwerte, optionale Ergebnisanzeige für Teilnehmer
- [x] Duplizieren, CSV-Import, Fragen-Export/Import, gemischte Antwortreihenfolge, Touch-Bedienung
- [x] Docker Compose (App + PostgreSQL), Betrieb unter Unterpfad / hinter Reverse-Proxy
- [x] Übersichts-PDF (`docs/Wissenscheck-Uebersicht.pdf`)
