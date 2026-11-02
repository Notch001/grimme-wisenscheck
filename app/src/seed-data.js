// Beispielinhalt für den Prototyp, abgeleitet aus der bisherigen PowerPoint-Abfrage.
// ACHTUNG: Musterlösungen sind sinnvolle Annahmen und müssen vom Fachpersonal geprüft werden.

export const TOPICS = [
  'Grundlagen Elektrik',
  'Grundlagen Mechanik',
  'Grundlagen Hydraulik',
  'Grundlagen Sensorik',
  'Funktionsweise der Maschinen',
  'Bedienung von Maschinen',
  'Wartung und Einstellung',
  'Diagnose / Fehlersuche',
];

const ids = 'abcdefghijklmnop';
const opts = (...texts) => texts.map((text, i) => ({ id: ids[i], text }));
const items = (...texts) => texts.map((text, i) => ({ id: `s${i + 1}`, text }));

const EL = 'Grundlagen Elektrik', ME = 'Grundlagen Mechanik', HY = 'Grundlagen Hydraulik', SE = 'Grundlagen Sensorik';
const FU = 'Funktionsweise der Maschinen', BE = 'Bedienung von Maschinen', WA = 'Wartung und Einstellung', DI = 'Diagnose / Fehlersuche';

export const QUESTIONS = [
  // ------------------------------------------------------------------ Elektrik
  { topic: EL, type: 'multi', prompt: 'Kreuze alle Messungen an, die man mit einem handelsüblichen Multimeter durchführen kann.',
    objective: 'Messmöglichkeiten eines Multimeters kennen',
    config: { options: opts('Gleichspannung', 'Strom', 'Widerstand', 'Durchgang', 'Gewicht', 'Temperatur', 'Entfernung', 'Kapazität', 'Wechselspannung'), correct: ['a', 'b', 'c', 'd', 'h', 'i'] } },
  { topic: EL, type: 'single', prompt: 'Wie muss ein Multimeter für eine Spannungsmessung angeschlossen werden?',
    objective: 'Spannung korrekt messen (parallel anschließen)',
    config: { options: opts('In Reihe', 'Parallel', 'Der Stromkreis muss spannungsfrei sein'), correct: 'b' } },
  { topic: EL, type: 'single', prompt: 'Wie muss ein Multimeter für eine Strommessung angeschlossen werden?',
    objective: 'Strom korrekt messen (in Reihe anschließen)',
    config: { options: opts('Der Stromkreis muss spannungsfrei sein', 'In Reihe', 'Parallel'), correct: 'b' } },
  { topic: EL, type: 'single', prompt: 'Wie lautet das Ohmsche Gesetz richtig?',
    objective: 'Ohmsches Gesetz anwenden',
    config: { options: opts('R = I / U', 'I = U / R', 'R = U + I'), correct: 'b' } },
  { topic: EL, type: 'match', prompt: 'Ordne jeder Größe die passende Einheit zu.',
    objective: 'Elektrische Größen und Einheiten unterscheiden',
    config: { left: opts('Spannung', 'Stromstärke', 'Widerstand'), right: opts('Volt', 'Ampere', 'Ohm', 'Watt', 'Farad'), pairs: { a: 'a', b: 'b', c: 'c' } } },
  { topic: EL, type: 'number', prompt: 'Berechne die Stromaufnahme einer Leuchte mit einem Widerstand von 2,2 Ω an 12 V.',
    objective: 'Strom mit I = U / R berechnen',
    config: { answer: 5.45, tolerance: 0.05, unit: 'A' } },
  { topic: EL, type: 'drawing', prompt: 'Zeichne eine Reihenschaltung mit 3 Widerständen an einem 12 V Netz.',
    objective: 'Reihenschaltungen lesen und zeichnen',
    config: { symbols: ['source', 'resistor', 'ground'], note: 'Nutze die Symbole und verbinde sie mit Leitungen.' } },
  { topic: EL, type: 'drawing', prompt: 'Zeichne einen einfachen Schaltplan (ohne Sicherung und Schalter), um die Spannung an der Leuchte zu messen. Das Netzteil ist auf 12 V voreingestellt.',
    objective: 'Messgerät für Spannungsmessung richtig einzeichnen',
    config: { symbols: ['source', 'lamp', 'voltmeter', 'ammeter', 'ohmmeter', 'motor'], note: '' } },
  { topic: EL, type: 'practical', prompt: 'Praktische Aufgabe: Miss den Widerstand der Leuchte an der Sensor-Wand und notiere den Wert.',
    objective: 'Widerstandsmessung praktisch durchführen',
    config: { note: 'Wird vor Ort vom Ausbilder bewertet.', criteria: ['Messgerät auf Widerstand eingestellt', 'Leuchte spannungsfrei gemessen', 'Messwert plausibel notiert'] } },

  // ------------------------------------------------------------------ Mechanik
  { topic: ME, type: 'order', prompt: 'Erstelle einen Arbeitsplan für ein M8-Gewinde. Bringe die Schritte in die richtige Reihenfolge.',
    objective: 'Arbeitsschritte beim Gewindeschneiden kennen',
    config: { items: items('Anreißen', 'Körnen', 'Drehzahl ermitteln', 'Bohren Ø 6,8 mm', 'Entgraten', 'Gewinde M8 schneiden') } },
  { topic: ME, type: 'single', prompt: 'Wie kann man eine Drehzahl ermitteln? Welche Faustformel ist richtig?',
    objective: 'Drehzahl beim Bohren bestimmen',
    config: { options: opts('n für Stahl = 7000 / Bohrerdurchmesser', 'n für Stahl = 700 / Bohrerdurchmesser', 'n für Stahl = 70 / Bohrerdurchmesser'), correct: 'a' } },
  { topic: ME, type: 'multi', prompt: 'Worauf ist beim Bohren zu achten?',
    objective: 'Arbeitssicherheit und Grundregeln beim Bohren',
    config: { options: opts('Keine Handschuhe', 'Richtige Drehzahl', 'Kühlmittel', 'Bohrer intakt', 'Schutzhelm tragen', 'Schutzbrille tragen'), correct: ['a', 'b', 'c', 'd', 'f'] } },
  { topic: ME, type: 'multi', prompt: 'Womit kann man eine Bohrung entgraten?',
    objective: 'Bohrungen entgraten',
    config: { options: opts('Kegelsenker', 'Flachsenker', 'Reibahle', 'größerer Bohrer'), correct: ['a', 'd'] } },
  { topic: ME, type: 'match', prompt: 'Ordne die Merkmale den Schweißverfahren zu.',
    objective: 'Schweißverfahren unterscheiden',
    config: {
      left: opts('Wird vor allem eingesetzt, wenn die Naht sichtbar bleibt oder hohe optische Ansprüche gelten.', 'Einfach zu handhaben und gut im Freien einsetzbar.', 'Ein Gasflammbrenner wird verwendet, um Metall zu schmelzen.', 'Nicht immer im Freien geeignet, da Wind das Schutzgas verweht; Gasflasche nötig.'),
      right: opts('Schutzgas MIG/MAG', 'WIG', 'Elektrodenschweißen', 'Gasschmelzschweißen'),
      pairs: { a: 'b', b: 'c', c: 'd', d: 'a' } } },
  { topic: ME, type: 'multi', prompt: 'Wie muss eine Schweißstelle vorbereitet werden?',
    objective: 'Schweißstelle vorbereiten',
    config: { options: opts('Oberfläche an der Schweißstelle säubern (Farbe, Schmutz, Fett entfernen)', 'Werkstück mit der Erdungsklemme des Schweißgeräts verbinden, guter Kontakt', 'Oberfläche muss angeraut werden', 'Schweißstelle muss angefeuchtet werden'), correct: ['a', 'b'] } },
  { topic: ME, type: 'single', prompt: 'Welche Eigenschaften hat eine richtig eingestellte Brennerflamme?',
    objective: 'Brennerflamme beurteilen',
    config: { options: opts('gelb, rauchend', 'blau, mit kleinem hellblauem Dreieckskegel', 'blau, ohne hellblauen Dreieckskegel, leise'), correct: 'b' } },
  { topic: ME, type: 'single', prompt: 'Worauf deutet eine laute, zischende Flamme hin?',
    objective: 'Flammenbild deuten',
    config: { options: opts('Zu wenig Sauerstoff', 'Richtige Sauerstoffzufuhr', 'Zu hoher Sauerstoffüberschuss'), correct: 'c' } },
  { topic: ME, type: 'practical', prompt: 'Praktische Aufgabe: Erstelle mittig auf dem Flachstahl 20×4 mm 3 Bohrungen Ø 5 mm (Anreißen, Körnen, Bohren, Entgraten).',
    objective: 'Bohren praktisch durchführen',
    config: { note: 'Wird vor Ort vom Ausbilder bewertet.', criteria: ['Mittig angerissen und gekörnt', 'Passende Drehzahl und Kühlung', 'Bohrungen entgratet', 'Schutzbrille getragen, keine Handschuhe'] } },
  { topic: ME, type: 'practical', prompt: 'Praktische Aufgabe: Erstelle ein Gewinde M6 im Flachstahl 20×4 mm.',
    objective: 'Gewinde praktisch schneiden',
    config: { note: 'Wird vor Ort vom Ausbilder bewertet.', criteria: ['Richtiger Kernlochdurchmesser gewählt', 'Gewinde winklig und sauber geschnitten', 'Schneidöl verwendet, Späne gebrochen'] } },

  // ------------------------------------------------------------------ Hydraulik
  { topic: HY, type: 'single', prompt: 'Wie wird in einem hydraulischen System primär Energie übertragen?',
    objective: 'Grundprinzip der Hydraulik', config: { options: opts('Hydrauliköl als Medium', 'Luft als Medium', 'Strom', 'Spannung'), correct: 'a' } },
  { topic: HY, type: 'single', prompt: 'Wie kann man einen Druck in einem hydraulischen System ermitteln?',
    objective: 'Messgeräte der Hydraulik', config: { options: opts('Multimeter', 'Manometer', 'Barometer', 'Drucksensor'), correct: 'b' } },
  { topic: HY, type: 'single', prompt: 'Wie misst man einen Volumenstrom in einem hydraulischen System?',
    objective: 'Messgeräte der Hydraulik', config: { options: opts('Durchflussmesser', 'Barometer', 'Multimeter'), correct: 'a' } },
  { topic: HY, type: 'single', prompt: 'Welche Aufgabe haben Pumpen in einem hydraulischen System?',
    objective: 'Bauteile der Hydraulik und ihre Aufgabe',
    config: { options: opts('Wandelt mechanische Energie in hydraulische Energie', 'Wandelt elektrische Energie in mechanische Energie', 'Wandelt hydraulische Energie in elektrische Energie'), correct: 'a' } },
  { topic: HY, type: 'single', prompt: 'Was bedeutet die Bezeichnung 5/3-Wegeventil?',
    objective: 'Wegeventile bezeichnen', config: { options: opts('5 Schaltstellungen und 3 Anschlüsse', '5 Anschlüsse und 3 Schaltstellungen', '5 Liter Durchfluss pro Minute bei 3 Verbrauchern'), correct: 'b' } },
  { topic: HY, type: 'match', prompt: 'Offenes (1) oder geschlossenes (2) Hydrauliksystem? Ordne die Aussagen zu.',
    objective: 'Offene und geschlossene Hydrauliksysteme unterscheiden',
    config: {
      left: opts('Das Öl fließt nach der Durchströmung eines Verbrauchers in einen drucklosen Tank zurück.', 'Das Öl fließt direkt von der Pumpe zum Verbraucher und von dort wieder zur Pumpe.', 'Energieeffizienteres System, da die Pumpe nur bei Bedarf Flüssigkeit liefert.'),
      right: opts('Offenes System', 'Geschlossenes System'), pairs: { a: 'a', b: 'b', c: 'b' } } },
  { topic: HY, type: 'match', prompt: 'Konstantstrom-System (1) oder Load-Sensing-System (2)? Ordne die Aussagen zu.',
    objective: 'Konstantstrom- und Load-Sensing-Systeme unterscheiden',
    config: {
      left: opts('Das System liefert unabhängig von der Last immer den gleichen Volumenstrom.', 'Es arbeitet einfach gesagt immer mit voller Leistung.', 'Das System passt Volumenstrom und/oder Druck der Pumpe an die Lasten der Verbraucher an.'),
      right: opts('Konstantstrom-System', 'Load-Sensing-System'), pairs: { a: 'a', b: 'a', c: 'b' } } },
  { topic: HY, type: 'multi', prompt: 'Welche Aussagen treffen auf das Hydrauliköl HLP 46 zu?',
    objective: 'Hydrauliköl und Viskosität verstehen',
    config: { options: opts('Die Zahl nennt die Viskosität des Öls bei 40 °C', 'Je höher die Zahl, desto höher der Flammpunkt und hitzeverträglicher', 'Je niedriger die Zahl, desto besser die Fließfähigkeit', 'Je niedriger die Zahl, desto schlechter die Fließfähigkeit'), correct: ['a', 'c'] } },
  { topic: HY, type: 'drawing', prompt: 'Zeichne das hydraulische Schaltzeichen für eine Konstantpumpe.',
    objective: 'Hydraulische Schaltzeichen kennen', config: { symbols: [], note: 'Freihand oder mit den Formwerkzeugen.' } },
  { topic: HY, type: 'drawing', prompt: 'Zeichne das hydraulische Schaltzeichen für einen doppeltwirkenden Zylinder.',
    objective: 'Hydraulische Schaltzeichen kennen', config: { symbols: [], note: 'Freihand oder mit den Formwerkzeugen.' } },

  // ------------------------------------------------------------------ Sensorik
  { topic: SE, type: 'single', prompt: 'Was ist die Hauptaufgabe eines Sensors?',
    objective: 'Funktion eines Sensors', config: { options: opts('Elektrische Energie speichern', 'Ein elektrisches Signal verstärken', 'Eine drahtlose Signalübertragung ermöglichen', 'Eine physikalische oder chemische Größe in ein elektrisches Signal umwandeln'), correct: 'd' } },
  { topic: SE, type: 'single', prompt: 'Was ist der Unterschied zwischen einem analogen und einem digitalen Sensor?',
    objective: 'Analoge und digitale Signale unterscheiden',
    config: { options: opts('Ein analoges Signal hat nur zwei Zustände, ein digitales kontinuierliche Werte', 'Ein digitales Signal hat nur zwei Zustände, ein analoges kontinuierliche Werte', 'Ein analoges Signal wird immer als Spannung ausgegeben, ein digitales als Strom'), correct: 'b' } },
  { topic: SE, type: 'single', prompt: 'Welches Ausgangssignal ermöglicht es, eine Leitungsunterbrechung zu erkennen?',
    objective: 'Signalarten und Leitungsüberwachung', config: { options: opts('Ein 0–10 V Spannungssignal', 'Ein 0–20 mA Stromsignal', 'Ein 4–20 mA Stromsignal', 'Ein binäres Signal'), correct: 'c' } },
  { topic: SE, type: 'number', prompt: 'Ein Füllstandssensor mit 4–20 mA Signal misst 0 % bei 4 mA und 100 % bei 20 mA. Welcher Füllstand liegt bei 12 mA vor?',
    objective: 'Analoge Signale umrechnen', config: { answer: 50, tolerance: 0.5, unit: '%' } },
  { topic: SE, type: 'single', prompt: 'Welches Ausgangssignal ist bei dem abgebildeten Sensor zu erwarten?', image: '/media/sensor-neigung.png',
    objective: 'Typenschild eines Sensors lesen', config: { options: opts('9…30 V', '4…20 mA', '0…10 V', '+/− 20°'), correct: 'b' } },
  { topic: SE, type: 'single', prompt: 'Welcher Sensor kann sowohl metallische und nichtmetallische Objekte als auch Flüssigkeiten erkennen?',
    objective: 'Näherungssensoren unterscheiden', config: { options: opts('Thermoelement', 'Hall-Sensor', 'Induktiver Näherungsschalter', 'Kapazitiver Näherungsschalter'), correct: 'd' } },
  { topic: SE, type: 'hotspot', prompt: 'Markiere im folgenden Schaltplan alle Sensoren.', image: '/media/schaltplan-sensorik.png',
    objective: 'Sensoren im Schaltplan erkennen',
    config: { aspect: 0.698, maxClicks: 8, areas: [{ x: 9.9, y: 38, r: 4.5 }, { x: 35.8, y: 36.5, r: 4.5 }, { x: 44.3, y: 35.5, r: 4.5 }, { x: 53.3, y: 36.5, r: 4.5 }] } },

  // ------------------------------------------------------------------ Funktionsweise
  { topic: FU, type: 'match', prompt: 'Füge die Positionsnummer aus dem Bild zu jeder Benennung ein.', image: '/media/ernte-uebersicht.png',
    objective: 'Baugruppen der Erntemaschine benennen',
    config: {
      left: opts('Anhängevorrichtung', 'Aufnahme', 'Erstes Siebband', 'Erstes Trenngerät', 'Zweites Siebband', 'Grobkrautband', 'Zweites Trenngerät', 'Verleseband', 'Verleseband-Kopfstück', 'Bunker'),
      right: opts('1', '2', '3', '4', '5', '6', '7', '8', '9', '10'),
      pairs: { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'i', j: 'j' } } },
  { topic: FU, type: 'imagelabel', prompt: 'Ziehe die Bezeichnungen an die richtige Stelle der Maschine.', image: '/media/ernte-aufbau.png',
    objective: 'Baugruppen der Erntemaschine erkennen',
    config: {
      aspect: 0.389, radius: 6,
      labels: opts('Ringelevator', 'Bunkerbefüllband', 'NonStop Bunker', 'Motor', 'Dammtrommeln', 'Krautschläger'),
      targets: [{ id: 't1', label: 'a', x: 3.6, y: 51 }, { id: 't2', label: 'b', x: 36.5, y: 32 }, { id: 't3', label: 'c', x: 45.8, y: 40 }, { id: 't4', label: 'd', x: 24, y: 20 }, { id: 't5', label: 'e', x: 67.2, y: 80 }, { id: 't6', label: 'f', x: 93, y: 81 }] } },
  { topic: FU, type: 'strike', prompt: 'Wie generiert die Maschine die Rodetiefe und wie kann der Fahrer diese einstellen? Streiche die falschen Antworten durch.',
    objective: 'Rodetiefe und Tiefenführung verstehen',
    config: { options: opts('Die Tiefenführung der Aufnahme erfolgt über die Dammtrommel', 'Durch Tauschen der Dammtrommelgröße', 'Wechsel von 2 auf 3 Blattschar', 'Verstellung der Rodetiefe über Stellspindel', 'Verstellung der Rodetiefe am Terminal mit Anzeige', 'Durch Ändern der Reihenweite'), wrong: ['b', 'c', 'f'] } },
  { topic: FU, type: 'strike', prompt: 'Welche Aussagen zur Dammentlastung sind richtig? Streiche die falschen durch.',
    objective: 'Funktion der Dammentlastung',
    config: { options: opts('Die Dammentlastung dient zur Gewichtsreduzierung der Dammtrommel, die auf der Dammkrone abrollt.', 'Nach einer Einstellung der Dammentlastung muss die Rodetiefe nicht kontrolliert werden.', 'Die Dammentlastung dient zur besseren Einstellung der Rodetiefe.', 'Bei der Dammentlastung kann der Fahrer keine Einstellungen vornehmen.', 'Bei eingeschalteter Dammentlastung werden die Hydraulikzylinder der Aufnahme mit (einstellbarem) Druck beaufschlagt.', 'Nach einer Einstellung der Dammentlastung muss die Rodetiefe kontrolliert werden.'), wrong: ['b', 'c', 'd'] } },

  // ------------------------------------------------------------------ Bedienung
  { topic: BE, type: 'single', prompt: 'Mit welcher Funktion wird die Maschine zum Kartoffeldamm ausgerichtet?',
    objective: 'Assistenzfunktionen der Maschine kennen', config: { options: opts('Speedtronic', 'Dammmittenfindung', 'Deichselautomatik', 'Tiefenführung', 'VarioDrive'), correct: 'b' } },
  { topic: BE, type: 'practical', prompt: 'Praktische Aufgabe: Verstelle die Rodetiefe am Terminal und erkläre, was du dabei beachtest.',
    objective: 'Terminal bedienen', config: { note: 'Wird vor Ort vom Ausbilder bewertet.', criteria: ['Richtiges Menü gefunden', 'Wert sinnvoll verändert', 'Rodetiefe anschließend kontrolliert'] } },

  // ------------------------------------------------------------------ Wartung
  { topic: WA, type: 'multi', prompt: 'Wo finde ich Informationen zur Wartung?',
    objective: 'Quellen für Wartungsinformationen', config: { options: opts('In der Bedienungsanleitung der Maschine', 'Auf der Hersteller-Website oder in offiziellen Serviceunterlagen', 'In den Wartungsplänen, Prüfprotokollen und am Typenschild', 'Beim Händler oder Servicepartner', 'In zufälligen Forenbeiträgen ohne Quellenangabe'), correct: ['a', 'b', 'c', 'd'] } },
  { topic: WA, type: 'multi', prompt: 'Welche Punkte müssen vor dem Ersteinsatz einer Fräse in Bezug auf die Gelenkwelle überprüft werden?',
    objective: 'Gelenkwelle vor Ersteinsatz prüfen', config: { options: opts('Länge der Gelenkwelle an die Zugmaschine anpassen', 'Rohrüberdeckung ausreichend', 'Richtige Drehzahl (540 / 1000 U/min) an der Zapfwelle', 'Freiraum und Schwankbereich sicherstellen', 'Reibkupplung vor Einsatz lüften'), correct: ['a', 'b', 'c', 'd', 'e'] } },
  { topic: WA, type: 'multi', prompt: 'Welche Auswirkung hat ein zu geringer Abstand zwischen Schlegelwelle und Dammkrone?',
    objective: 'Krautschläger richtig einstellen', config: { options: opts('Geringerer Verschleiß an den Schlegelmessern', 'Hoher Verschleiß an den Schlegelmessern', 'Hoher Leistungsbedarf', 'Beschädigung des Ernteguts', 'Gefahr von Beschädigungen an den Schlegelmessern'), correct: ['b', 'c', 'd', 'e'] } },

  // ------------------------------------------------------------------ Diagnose
  { topic: DI, type: 'multi', prompt: 'Bei einer Fräse vibriert das Maschinengehäuse. Welche Ursachen kann das haben?',
    objective: 'Vibrationen systematisch eingrenzen', config: { options: opts('Unwucht der Werkzeuge (beschädigt oder falsch montiert)', 'Lose oder verschlissene Lager in Welle/Antrieb', 'Fremdkörper im Arbeitsbereich', 'Fräszinken fehlen', 'Fräszinken beschädigt oder verschlissen', 'Unzureichend befestigte Abdeckungen oder Schutzbleche'), correct: ['a', 'b', 'c', 'd', 'e', 'f'] } },
  { topic: DI, type: 'single', prompt: 'Ein Sensor mit 4–20 mA Ausgang liefert plötzlich 0 mA. Was ist die wahrscheinlichste Ursache?',
    objective: 'Sensorfehler eingrenzen (Leitungsbruch)', config: { options: opts('Der Füllstand ist bei 0 %', 'Leitungsunterbrechung oder Sensor ohne Versorgung', 'Der Sensor misst gerade 4 mA'), correct: 'b' } },
  { topic: DI, type: 'single', prompt: 'Was ist die Ursache für eine gelbe, rußende Flamme?',
    objective: 'Flammenbild deuten', config: { options: opts('Zu viel Luftzufuhr', 'Zu wenig Luftzufuhr', 'Richtige Luftzufuhr'), correct: 'b' } },
];
