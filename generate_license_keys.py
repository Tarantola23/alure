#!/usr/bin/env python3
"""
Generatore di Chiavi di Licenza per Verifica Tool V2
Genera chiavi di licenza sicure e specifiche per diversi tipi di licenza
"""

import os
import sys
import json
import hashlib
import secrets
import string
from datetime import datetime, timedelta
from pathlib import Path

# Aggiungi il percorso per importare license_manager
sys.path.append(os.path.join(os.path.dirname(__file__), 'src', 'main'))

from license_manager import LicenseManager

class LicenseKeyGenerator:
    """Generatore di chiavi di licenza sicure"""
    
    # Prefissi per diversi tipi di licenza
    LICENSE_PREFIXES = {
        'TRIAL': 'VT25',
        'STANDARD': 'VS24', 
        'PROFESSIONAL': 'VP24',
        'ENTERPRISE': 'VE25'
    }
    
    # Durate predefinite (in giorni)
    LICENSE_DURATIONS = {
        'TRIAL': 7,
        'STANDARD': 365,
        'PROFESSIONAL': 365,
        'ENTERPRISE': 0  # 10 anni
    }
    
    def __init__(self, base_path=None):
        if base_path is None:
            self.base_path = os.path.dirname(__file__)
        else:
            self.base_path = base_path
        
        self.license_manager = LicenseManager(self.base_path)
        self.generated_keys_file = Path(self.base_path) / "generated_keys.json"
        
    def generate_secure_segment(self, length=5):
        """Genera un segmento sicuro di caratteri alfanumerici"""
        chars = string.ascii_uppercase + string.digits
        # Rimuovi caratteri che possono essere confusi
        chars = chars.replace('0', '').replace('O', '').replace('1', '').replace('I', '')
        return ''.join(secrets.choice(chars) for _ in range(length))
    
    def generate_checksum(self, key_parts):
        """Genera un checksum per validare la chiave"""
        combined = ''.join(key_parts)
        hash_obj = hashlib.sha256(combined.encode())
        # Prendi i primi 4 caratteri dell'hash in maiuscolo
        return hash_obj.hexdigest()[:4].upper()
    
    def generate_license_key(self, license_type, custom_duration=None, customer_code=None):
        """
        Genera una chiave di licenza sicura
        
        Args:
            license_type: Tipo di licenza (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE)
            custom_duration: Durata personalizzata in giorni (opzionale)
            customer_code: Codice cliente personalizzato (opzionale)
        
        Returns:
            str: Chiave di licenza generata
        """
        if license_type not in self.LICENSE_PREFIXES:
            raise ValueError(f"Tipo di licenza non valido: {license_type}")
        
        # Prefisso del tipo di licenza
        prefix = self.LICENSE_PREFIXES[license_type]
        
        # Segmento temporale (anno + mese)
        time_segment = datetime.now().strftime("%y%m")
        
        # Segmento cliente (se fornito) o casuale
        if customer_code:
            customer_segment = customer_code[:4].upper().ljust(4, 'X')
        else:
            customer_segment = self.generate_secure_segment(4)
        
        # Segmento casuale per unicità
        random_segment = self.generate_secure_segment(5)
        
        # Parti della chiave (senza checksum)
        key_parts = [prefix, time_segment, customer_segment, random_segment]
        
        # Genera checksum
        checksum = self.generate_checksum(key_parts)
        
        # Chiave finale
        license_key = f"{prefix}-{time_segment}-{customer_segment}-{random_segment}-{checksum}"
        
        return license_key
    
    def validate_generated_key(self, license_key):
        """Valida una chiave generata verificando il checksum"""
        try:
            parts = license_key.split('-')
            if len(parts) != 5:
                return False
            
            # Estrai le parti
            prefix, time_seg, customer_seg, random_seg, provided_checksum = parts
            
            # Ricalcola il checksum
            key_parts = [prefix, time_seg, customer_seg, random_seg]
            calculated_checksum = self.generate_checksum(key_parts)
            
            return provided_checksum == calculated_checksum
        except:
            return False
    
    def get_license_type_from_key(self, license_key):
        """Determina il tipo di licenza dalla chiave"""
        try:
            prefix = license_key.split('-')[0]
            for license_type, type_prefix in self.LICENSE_PREFIXES.items():
                if prefix == type_prefix:
                    return license_type
            return None
        except:
            return None
    
    def save_generated_key(self, license_key, license_type, duration_days, customer_code=None, notes=None):
        """Salva la chiave generata in un file di registro"""
        key_info = {
            "license_key": license_key,
            "license_type": license_type,
            "duration_days": duration_days,
            "customer_code": customer_code,
            "notes": notes,
            "generated_date": datetime.now().isoformat(),
            "valid": self.validate_generated_key(license_key)
        }
        
        # Carica chiavi esistenti
        generated_keys = []
        if self.generated_keys_file.exists():
            try:
                with open(self.generated_keys_file, 'r', encoding='utf-8') as f:
                    generated_keys = json.load(f)
            except:
                generated_keys = []
        
        # Aggiungi la nuova chiave
        generated_keys.append(key_info)
        
        # Salva il file aggiornato
        with open(self.generated_keys_file, 'w', encoding='utf-8') as f:
            json.dump(generated_keys, f, indent=2, ensure_ascii=False)
        
        return key_info
    
    def update_license_manager_config(self, license_key, license_type, duration_days):
        """Aggiorna la configurazione del license manager con la nuova chiave"""
        # Leggi il file license_manager.py
        license_manager_file = Path(self.base_path) / "src" / "main" / "license_manager.py"
        
        if not license_manager_file.exists():
            print(f"⚠️ File license_manager.py non trovato: {license_manager_file}")
            return False
        
        # Crea la configurazione della chiave
        key_config = {
            "type": license_type,
            "duration_days": duration_days,
            "description": f"Chiave {license_type} generata automaticamente"
        }
        
        print(f"✅ Chiave generata: {license_key}")
        print(f"📋 Configurazione da aggiungere al license_manager.py:")
        print(f'    "{license_key}": {json.dumps(key_config, indent=8)}')
        
        return True

def interactive_key_generation():
    """Interfaccia interattiva per la generazione di chiavi"""
    print("🔐 Generatore di Chiavi di Licenza - Verifica Tool V2")
    print("=" * 60)
    
    generator = LicenseKeyGenerator()
    
    while True:
        print("\n📋 Tipi di licenza disponibili:")
        for i, (license_type, prefix) in enumerate(generator.LICENSE_PREFIXES.items(), 1):
            duration = generator.LICENSE_DURATIONS[license_type]
            print(f"  {i}. {license_type} ({prefix}) - {duration} giorni")
        
        print("  0. Esci")
        
        try:
            choice = input("\n🔢 Seleziona il tipo di licenza (1-4, 0 per uscire): ").strip()
            
            if choice == '0':
                print("👋 Arrivederci!")
                break
            
            if choice not in ['1', '2', '3', '4']:
                print("❌ Scelta non valida!")
                continue
            
            # Mappa la scelta al tipo di licenza
            license_types = list(generator.LICENSE_PREFIXES.keys())
            license_type = license_types[int(choice) - 1]
            
            # Durata personalizzata
            default_duration = generator.LICENSE_DURATIONS[license_type]
            duration_input = input(f"\n📅 Durata in giorni (default: {default_duration}): ").strip()
            
            if duration_input:
                try:
                    duration_days = int(duration_input)
                except ValueError:
                    print("❌ Durata non valida, uso il default")
                    duration_days = default_duration
            else:
                duration_days = default_duration
            
            # Codice cliente opzionale
            customer_code = input("\n👤 Codice cliente (opzionale, max 4 caratteri): ").strip()
            if not customer_code:
                customer_code = None
            
            # Note opzionali
            notes = input("\n📝 Note (opzionale): ").strip()
            if not notes:
                notes = None
            
            # Genera la chiave
            print("\n🔄 Generazione chiave in corso...")
            license_key = generator.generate_license_key(license_type, duration_days, customer_code)
            
            # Valida la chiave
            is_valid = generator.validate_generated_key(license_key)
            
            # Salva la chiave
            key_info = generator.save_generated_key(
                license_key, license_type, duration_days, customer_code, notes
            )
            
            # Mostra i risultati
            print("\n✅ Chiave generata con successo!")
            print("=" * 50)
            print(f"🔑 Chiave: {license_key}")
            print(f"📋 Tipo: {license_type}")
            print(f"📅 Durata: {duration_days} giorni")
            print(f"👤 Cliente: {customer_code or 'N/A'}")
            print(f"📝 Note: {notes or 'N/A'}")
            print(f"✅ Valida: {'Sì' if is_valid else 'No'}")
            print(f"📁 Salvata in: {generator.generated_keys_file}")
            
            # Aggiorna configurazione
            generator.update_license_manager_config(license_key, license_type, duration_days)
            
            # Chiedi se continuare
            continue_choice = input("\n🔄 Generare un'altra chiave? (s/n): ").strip().lower()
            if continue_choice not in ['s', 'si', 'sì', 'y', 'yes']:
                print("👋 Arrivederci!")
                break
                
        except KeyboardInterrupt:
            print("\n\n👋 Operazione interrotta dall'utente")
            break
        except Exception as e:
            print(f"\n❌ Errore: {e}")

def batch_key_generation():
    """Genera chiavi in batch per testing"""
    print("🔐 Generazione Batch di Chiavi di Test")
    print("=" * 40)
    
    generator = LicenseKeyGenerator()
    
    # Genera una chiave per ogni tipo
    test_keys = []
    for license_type in generator.LICENSE_PREFIXES.keys():
        duration = generator.LICENSE_DURATIONS[license_type]
        license_key = generator.generate_license_key(license_type)
        
        key_info = generator.save_generated_key(
            license_key, license_type, duration, 
            customer_code="TEST", 
            notes=f"Chiave di test per {license_type}"
        )
        
        test_keys.append(key_info)
        print(f"✅ {license_type}: {license_key}")
    
    print(f"\n📁 Tutte le chiavi salvate in: {generator.generated_keys_file}")
    return test_keys

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--batch":
        batch_key_generation()
    else:
        interactive_key_generation()