# Sketches: Auswahlkomponente

Technische Skizzen für eine Auswahlkomponente mit Mehrfachauswahl (wie `<select multiple>`).

| Ordner      | Inhalt                                             | Wer     |
|-------------|----------------------------------------------------|---------|
| `shared/`   | gemeinsame Daten, Auswahl-Logik, Debug-Panel       | beide   |
| `timeline/` | Kunstwerke auf einer Timeline, Auswahl fällt in die Palette | Elena   |
| `table/`    | Matrix Kunstwerke × Künstler:innen (Zuordnung)     | Larissa |

## Starten

ES-Module brauchen einen lokalen Server. Im Hauptordner des Repos:

```
python3 -m http.server 8000
```

Dann im Browser: http://localhost:8000/sketches/

## Gemeinsame Basis (`shared/`)

- `data.js`: Künstler:innen, Kunstwerke und Epochen aus `app/client/js/memoryDB.js`.
  Fehlende Werte (Jahre der Kunstwerke, einige Epochen und Zuordnungen) stehen in `SKETCH_EXTRAS`.
- `multiSelect.js`: das Auswahl-Modell. Hält die gewählten IDs, synchronisiert ein verstecktes
  `<select multiple>` und löst ein `change`-Event aus. Methoden: `select`, `deselect`, `toggle`,
  `clear`, `isSelected`, `getValue`, `getSelectedOptions`, `onChange`.
- `debugPanel.js`: zeigt den aktuellen Wert und das native Select an.

Änderungen an `shared/` bitte immer kurz absprechen, beide Skizzen hängen davon ab.

## Arbeitsweise

- Elena arbeitet auf dem Branch `timeline`, Larissa auf `table`
- vor dem 3.11 beide Branches in `main` mergen
