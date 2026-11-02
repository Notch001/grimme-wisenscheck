# Wissenscheck

Vorab-Wissenscheck für Schulungsteilnehmer: Abfrage anlegen, Teilnehmer einladen (persönlicher Link),
nach Abgabe individuelle Auswertung (nur Admin) mit Schwächen je Themenbereich und Vorschlag für Schulung / Weiterbildungsplan.
Läuft komplett in Docker (Node.js + PostgreSQL), keine externen Dienste.

## Start

```bash
cp .env.example .env     # Passwörter anpassen
docker compose up --build
```

- Admin: http://localhost:3000/ (Passwort aus `ADMIN_PASSWORD`, Standard `admin`)
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

## Entwicklung

`app/` (Express, `pg`, Vanilla-JS-Frontend ohne Build). Tests: `cd app && npm test`.

> **Hinweis:** Die Musterlösungen der Beispielaufgaben sind Annahmen und müssen fachlich geprüft werden
> (u. a. Positionsnummern Erntemaschine, Faustformel Drehzahl, Schweißverfahren-Zuordnung, Platzierungen im Maschinenbild).
