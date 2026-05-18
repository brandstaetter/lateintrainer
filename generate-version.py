#!/usr/bin/env python3
"""
Generiert version.json mit SHA256-Hashes der CSV-Dateien.
Führe dieses Skript aus, bevor du die App deployest:
    python generate-version.py
"""

import json
import hashlib
import os
from datetime import datetime, timezone

def calculate_sha256(filepath):
    """Berechnet SHA256-Hash einer Datei."""
    sha256 = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()[:16]  # Nur erste 16 Zeichen für Übersichtlichkeit
    except FileNotFoundError:
        return None

def get_current_version():
    """Liest aktuelle Version aus version.json."""
    try:
        with open('version.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('version', '1.0.0')
    except (FileNotFoundError, json.JSONDecodeError):
        return '1.0.0'

def increment_version(current_version):
    """Erhöht Patch-Level der Version (1.0.0 -> 1.0.1)."""
    parts = current_version.split('.')
    if len(parts) == 3:
        major, minor, patch = parts
        try:
            return f"{major}.{minor}.{int(patch) + 1}"
        except ValueError:
            pass
    return current_version

def main():
    # Dateien prüfen
    files_to_hash = {
        'formsHash': 'forms.csv',
        'vocabHash': 'vokabeln.csv'
    }
    
    hashes = {}
    files_changed = False
    
    print("🔍 Prüfe Dateien...")
    
    for key, filename in files_to_hash.items():
        if os.path.exists(filename):
            hash_value = calculate_sha256(filename)
            hashes[key] = hash_value
            print(f"  ✓ {filename}: {hash_value}")
        else:
            print(f"  ⚠ {filename} nicht gefunden")
            hashes[key] = None
    
    # Aktuelle Version laden und ggf. erhöhen
    current_version = get_current_version()
    
    # Prüfen, ob sich Hashes geändert haben
    try:
        with open('version.json', 'r', encoding='utf-8') as f:
            old_data = json.load(f)
            old_forms_hash = old_data.get('formsHash')
            old_vocab_hash = old_data.get('vocabHash')
            
            if (old_forms_hash != hashes.get('formsHash') or 
                old_vocab_hash != hashes.get('vocabHash')):
                files_changed = True
                print("\n📦 Datei-Inhalte haben sich geändert!")
    except (FileNotFoundError, json.JSONDecodeError):
        files_changed = True
        print("\n🆕 Neue version.json wird erstellt")
    
    # Neue Version bestimmen
    if files_changed:
        new_version = increment_version(current_version)
        print(f"⬆ Version: {current_version} → {new_version}")
    else:
        new_version = current_version
        print(f"✓ Version bleibt: {new_version}")
    
    # version.json erstellen
    version_data = {
        'version': new_version,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'formsHash': hashes.get('formsHash'),
        'vocabHash': hashes.get('vocabHash')
    }
    
    with open('version.json', 'w', encoding='utf-8') as f:
        json.dump(version_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ version.json aktualisiert:")
    print(json.dumps(version_data, indent=2))
    
    # Hinweis für Deployment
    if files_changed:
        print("\n🚀 Fertig! Die App wird beim nächsten Laden das Update erkennen.")
    else:
        print("\n💡 Keine Änderungen erkannt. Version.json wurde aktualisiert.")

if __name__ == '__main__':
    main()
