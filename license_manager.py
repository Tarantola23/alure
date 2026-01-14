"""
Sistema di Gestione Licenze per Verifica Tool V2
Protegge l'applicazione da utilizzi non autorizzati
"""

import os
import sys
import json
import hashlib
import hmac
import base64
import tkinter as tk
from tkinter import messagebox, simpledialog
from pathlib import Path
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import platform
import uuid
import subprocess
import secrets
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

class LicenseManager:
    """Gestisce la validazione e verifica delle licenze"""
    
    # Chiave segreta per la firma delle licenze (in produzione dovrebbe essere offuscata)
    SECRET_KEY = b"VerificaTool_V2_2025_SecretKey_MediaMarket_Protection"
    
    # Tipi di licenza supportati
    LICENSE_TYPES = {
        "TRIAL": {"duration_days": 30, "features": ["basic"]},
        "STANDARD": {"duration_days": 365, "features": ["basic", "advanced"]},
        "PROFESSIONAL": {"duration_days": 365, "features": ["basic", "advanced", "premium"]},
        "ENTERPRISE": {"duration_days": 0, "features": ["basic", "advanced", "premium", "enterprise"]}  # 0 = illimitata
    }
    
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.config_dir = self.base_path / "config"
        self.license_dir = self.base_path / "license"
        self.license_file = self.license_dir / "license.json"
        self.machine_id_file = self.license_dir / ".machine_id"
        self.license_config_file = self.config_dir / "license_config.json"
        
        # Assicurati che le directory esistano
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.license_dir.mkdir(parents=True, exist_ok=True)
        
        # Carica configurazione licenze
        self.config = self._load_license_config()
        
        # Genera o carica l'ID macchina
        self.machine_id = self._get_or_create_machine_id()
    
    def _load_license_config(self) -> Dict[str, Any]:
        """Carica la configurazione delle licenze (hardcoded per sicurezza)"""
        # Configurazione incorporata nel codice per massima sicurezza
        return {
            "predefined_keys": {
                "TRIAL-2024-VERIFICA": {
                    "type": "Trial",
                    "duration_days": 2,
                    "description": "Chiave di prova 2 giorni"
                },
                "STANDARD-2024-VERIFICA": {
                    "type": "Standard", 
                    "duration_days": 365,
                    "description": "Licenza Standard 1 anno"
                },
                "PRO-2024-VERIFICA": {
                    "type": "Professional",
                    "duration_days": 365,
                    "description": "Licenza Professional 1 anno"
                },
                "ENTERPRISE-2024-VERIFICA": {
                    "type": "Enterprise",
                    "duration_days": 1095,
                    "description": "Licenza Enterprise 3 anni"
                },
                "MEDIAMARKET-MASTER-2024": {
                    "type": "Enterprise",
                    "duration_days": 3650,
                    "description": "Licenza Master MediaMarket 10 anni"
                }
            }
        }
        
    def _get_or_create_machine_id(self) -> str:
        """Genera o carica un ID univoco per la macchina"""
        try:
            if self.machine_id_file.exists():
                with open(self.machine_id_file, 'r') as f:
                    machine_id = f.read().strip()
                    if machine_id:
                        return machine_id
            
            # Genera nuovo ID macchina basato su caratteristiche hardware
            machine_info = [
                platform.node(),  # Nome computer
                platform.machine(),  # Architettura
                platform.processor(),  # Processore
                str(uuid.getnode()),  # MAC address
            ]
            
            # Aggiungi informazioni aggiuntive se disponibili
            try:
                # Numero di serie del disco (Windows)
                if platform.system() == "Windows":
                    result = subprocess.run(
                        ["wmic", "diskdrive", "get", "serialnumber"],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        machine_info.append(result.stdout.strip())
            except:
                pass
            
            # Crea hash dell'ID macchina
            machine_string = "|".join(filter(None, machine_info))
            machine_id = hashlib.sha256(machine_string.encode()).hexdigest()[:16]
            
            # Salva l'ID macchina
            with open(self.machine_id_file, 'w') as f:
                f.write(machine_id)
            
            logger.info(f"Generato nuovo ID macchina: {machine_id}")
            return machine_id
            
        except Exception as e:
            logger.error(f"Errore nella generazione ID macchina: {e}")
            # Fallback: usa un ID basato su hostname
            return hashlib.sha256(platform.node().encode()).hexdigest()[:16]
    
    def _generate_encryption_key(self) -> bytes:
        """Genera una chiave di crittografia basata sul machine ID"""
        # Usa machine ID + secret per generare chiave deterministica
        key_material = f"{self.machine_id}{self.SECRET_KEY}".encode()
        key_hash = hashlib.sha256(key_material).digest()
        return base64.urlsafe_b64encode(key_hash)
    
    def _encrypt_license_key(self, license_key: str) -> str:
        """Crittografa la chiave di licenza"""
        try:
            fernet = Fernet(self._generate_encryption_key())
            encrypted = fernet.encrypt(license_key.encode())
            return base64.urlsafe_b64encode(encrypted).decode()
        except Exception as e:
            logger.error(f"Errore nella crittografia: {e}")
            return license_key  # Fallback
    
    def _decrypt_license_key(self, encrypted_key: str) -> str:
        """Decrittografa la chiave di licenza"""
        try:
            fernet = Fernet(self._generate_encryption_key())
            encrypted_bytes = base64.urlsafe_b64decode(encrypted_key.encode())
            decrypted = fernet.decrypt(encrypted_bytes)
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Errore nella decrittografia: {e}")
            return encrypted_key  # Fallback

    def _generate_license_signature(self, license_data: Dict[str, Any]) -> str:
        """Genera la firma per una licenza"""
        # Crea stringa da firmare (ordine determinato)
        sign_string = f"{license_data['license_key']}|{license_data['machine_id']}|{license_data['license_type']}|{license_data['issued_date']}|{license_data['expiry_date']}"
        
        # Genera HMAC
        signature = hmac.new(
            self.SECRET_KEY,
            sign_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def _verify_license_signature(self, license_data: Dict[str, Any]) -> bool:
        """Verifica la firma di una licenza"""
        try:
            stored_signature = license_data.get('signature', '')
            expected_signature = self._generate_license_signature(license_data)
            
            # Confronto sicuro per prevenire timing attacks
            return hmac.compare_digest(stored_signature, expected_signature)
        except Exception as e:
            logger.error(f"Errore nella verifica firma: {e}")
            return False
    
    def _analyze_generated_key(self, license_key: str) -> Dict[str, Any]:
        """Analizza una chiave generata automaticamente per determinare tipo e durata"""
        try:
            import re
            
            license_key_upper = license_key.upper()
            
            # Pattern per chiavi generate dal nostro script: TIPO-MMAA-XXXX-XXXXX-XXXX
            generated_pattern = r'^([A-Z]{2}\d{2})-(\d{4})-([A-Z0-9]{4})-([A-Z0-9]{5})-([A-Z0-9]{4})$'
            match = re.match(generated_pattern, license_key_upper)
            
            if match:
                type_code = match.group(1)
                date_code = match.group(2)
                customer_code = match.group(3)
                unique_code = match.group(4)
                checksum = match.group(5)
                
                # Mappa i codici tipo alle licenze e durate (più completa)
                type_mapping = {
                    'VT24': {'type': 'TRIAL', 'duration_days': 7},
                    'VS24': {'type': 'STANDARD', 'duration_days': 365},
                    'VP24': {'type': 'PROFESSIONAL', 'duration_days': 1095},
                    'VE24': {'type': 'ENTERPRISE', 'duration_days': 3650},
                    # Aggiungi altri possibili prefissi
                    'VT23': {'type': 'TRIAL', 'duration_days': 7},
                    'VS23': {'type': 'STANDARD', 'duration_days': 365},
                    'VP23': {'type': 'PROFESSIONAL', 'duration_days': 1095},
                    'VE23': {'type': 'ENTERPRISE', 'duration_days': 3650},
                    'VT25': {'type': 'TRIAL', 'duration_days': 7},
                    'VS25': {'type': 'STANDARD', 'duration_days': 365},
                    'VP25': {'type': 'PROFESSIONAL', 'duration_days': 1095},
                    'VE25': {'type': 'ENTERPRISE', 'duration_days': 0}
                }
                
                if type_code in type_mapping:
                    # Verifica checksum per validità
                    checksum_valid = self._verify_generated_key_checksum(license_key_upper)
                    if checksum_valid:
                        return {
                            'type': type_mapping[type_code]['type'],
                            'duration_days': type_mapping[type_code]['duration_days'],
                            'customer_code': customer_code,
                            'generation_date': date_code,
                            'unique_code': unique_code,
                            'checksum_valid': checksum_valid,
                            'is_valid': True,
                            'source': 'generated'
                        }
                    else:
                        return {'is_valid': False, 'reason': 'Checksum non valido', 'checksum_valid': False}
            
            return {'is_valid': False, 'reason': 'Formato non riconosciuto'}
        except Exception as e:
            logger.warning(f"Errore nell'analisi della chiave generata {license_key}: {e}")
            return {'is_valid': False, 'reason': f'Errore nell\'analisi: {str(e)}'}
    
    def _verify_generated_key_checksum(self, license_key: str) -> bool:
        """Verifica il checksum di una chiave generata"""
        try:
            parts = license_key.split('-')
            if len(parts) != 5:
                return False
            
            # Estrai le parti
            prefix, time_seg, customer_seg, random_seg, provided_checksum = parts
            
            # Ricalcola il checksum usando lo stesso algoritmo del generatore
            key_parts = [prefix, time_seg, customer_seg, random_seg]
            combined = ''.join(key_parts)
            hash_obj = hashlib.sha256(combined.encode())
            calculated_checksum = hash_obj.hexdigest()[:4].upper()
            
            return provided_checksum == calculated_checksum
        except Exception as e:
            logger.warning(f"Errore nella verifica checksum per {license_key}: {e}")
            return False

    def generate_license(self, license_key: str, license_type: str, duration_days: int = None) -> Dict[str, Any]:
        """Genera una nuova licenza (solo per uso interno/testing)"""
        if license_type not in self.LICENSE_TYPES:
            raise ValueError(f"Tipo di licenza non valido: {license_type}")
        
        # Usa durata predefinita se non specificata
        if duration_days is None:
            # Prima controlla se c'è una durata specifica nel config per questa chiave
            if (hasattr(self, 'config') and 'predefined_keys' in self.config and 
                license_key.upper() in [k.upper() for k in self.config['predefined_keys'].keys()]):
                for key, info in self.config['predefined_keys'].items():
                    if key.upper() == license_key.upper():
                        duration_days = info.get('duration_days', self.LICENSE_TYPES[license_type]["duration_days"])
                        break
            else:
                # Prova ad analizzare la chiave generata automaticamente
                key_analysis = self._analyze_generated_key(license_key)
                if key_analysis.get('is_valid', False):
                    duration_days = key_analysis['duration_days']
                    logger.info(f"Chiave generata riconosciuta: {license_key} -> {key_analysis['type']} ({duration_days} giorni)")
                else:
                    duration_days = self.LICENSE_TYPES[license_type]["duration_days"]
        
        # Date
        issued_date = datetime.now().isoformat()
        if duration_days > 0:
            expiry_date = (datetime.now() + timedelta(days=duration_days)).isoformat()
        else:
            expiry_date = "unlimited"
        
        # Dati licenza con chiave crittografata
        license_data = {
            "license_key": self._encrypt_license_key(license_key),
            "machine_id": self.machine_id,
            "license_type": license_type,
            "issued_date": issued_date,
            "expiry_date": expiry_date,
            "features": self.LICENSE_TYPES[license_type]["features"],
            "version": "2.1.0"
        }
        
        # Genera firma
        license_data["signature"] = self._generate_license_signature(license_data)
        
        return license_data
    
    def save_license(self, license_data: Dict[str, Any]) -> bool:
        """Salva la licenza nel file"""
        try:
            with open(self.license_file, 'w', encoding='utf-8') as f:
                json.dump(license_data, f, indent=2, ensure_ascii=False)
            
            logger.info("Licenza salvata con successo")
            return True
        except Exception as e:
            logger.error(f"Errore nel salvataggio licenza: {e}")
            return False
    
    def load_license(self) -> Optional[Dict[str, Any]]:
        """Carica la licenza dal file"""
        try:
            if not self.license_file.exists():
                return None
            
            with open(self.license_file, 'r', encoding='utf-8') as f:
                license_data = json.load(f)
            
            return license_data
        except Exception as e:
            logger.error(f"Errore nel caricamento licenza: {e}")
            return None
    
    def validate_license(self, license_data: Dict[str, Any] = None) -> Tuple[bool, str]:
        """Valida una licenza"""
        try:
            # Carica licenza se non fornita
            if license_data is None:
                license_data = self.load_license()
            
            if not license_data:
                return False, "Nessuna licenza trovata"
            
            # Verifica firma
            if not self._verify_license_signature(license_data):
                return False, "Licenza non valida o manomessa"
            
            # Verifica ID macchina
            if license_data.get('machine_id') != self.machine_id:
                return False, "Licenza non valida per questa macchina"
            
            # Verifica scadenza
            expiry_date = license_data.get('expiry_date')
            if expiry_date != "unlimited":
                try:
                    expiry = datetime.fromisoformat(expiry_date)
                    if datetime.now() > expiry:
                        return False, f"Licenza scaduta il {expiry.strftime('%d/%m/%Y')}"
                except ValueError:
                    return False, "Data di scadenza non valida"
            
            # Verifica tipo licenza
            license_type = license_data.get('license_type')
            if license_type not in self.LICENSE_TYPES:
                return False, "Tipo di licenza non riconosciuto"
            
            return True, "Licenza valida"
            
        except Exception as e:
            logger.error(f"Errore nella validazione licenza: {e}")
            return False, f"Errore nella validazione: {str(e)}"
    
    def get_license_info(self) -> Optional[Dict[str, Any]]:
        """Ottiene informazioni sulla licenza corrente"""
        license_data = self.load_license()
        if not license_data:
            return None
        
        is_valid, message = self.validate_license(license_data)
        
        info = {
            "valid": is_valid,
            "message": message,
            "license_type": license_data.get('license_type', 'Unknown'),
            "expiry_date": license_data.get('expiry_date', 'Unknown'),
            "features": license_data.get('features', []),
            "machine_id": self.machine_id
        }
        
        # Calcola giorni rimanenti
        if is_valid and license_data.get('expiry_date') != "unlimited":
            try:
                expiry = datetime.fromisoformat(license_data['expiry_date'])
                days_remaining = (expiry - datetime.now()).days
                info["days_remaining"] = max(0, days_remaining)
            except:
                info["days_remaining"] = 0
        else:
            info["days_remaining"] = -1  # Illimitata
        
        return info
    
    def request_license_key(self, parent=None) -> Optional[str]:
        """Richiede la chiave di licenza all'utente"""
        try:
            # Crea dialog personalizzato
            if parent:
                dialog = tk.Toplevel(parent)
                dialog.transient(parent)
                dialog.grab_set()
            else:
                dialog = tk.Tk()
            
            dialog.title("Attivazione Licenza - Verifica Tool V2")
            dialog.geometry("500x400")
            dialog.resizable(False, False)
            dialog.attributes('-topmost', True)  # Sempre in primo piano
            
            # Centra il dialog
            dialog.update_idletasks()
            x = (dialog.winfo_screenwidth() // 2) - (500 // 2)
            y = (dialog.winfo_screenheight() // 2) - (400 // 2)
            dialog.geometry(f"500x400+{x}+{y}")
            
            result = {"license_key": None}
            
            # Frame principale
            main_frame = tk.Frame(dialog, padx=20, pady=20)
            main_frame.pack(fill=tk.BOTH, expand=True)
            
            # Titolo
            title_label = tk.Label(
                main_frame,
                text="🔐 Attivazione Licenza",
                font=("Arial", 16, "bold"),
                fg="#2c3e50"
            )
            title_label.pack(pady=(0, 20))
            
            # Messaggio
            message_text = (
                "Per utilizzare Verifica Tool V2 è necessaria una licenza valida.\n\n"
                f"ID Macchina: {self.machine_id}\n\n"
                "Inserisci la tua chiave di licenza qui sotto:"
            )
            message_label = tk.Label(
                main_frame,
                text=message_text,
                font=("Arial", 10),
                justify=tk.LEFT,
                wraplength=450
            )
            message_label.pack(pady=(0, 20))
            
            # Campo chiave licenza
            key_label = tk.Label(main_frame, text="Chiave di Licenza:", font=("Arial", 10, "bold"))
            key_label.pack(anchor=tk.W)
            
            key_entry = tk.Entry(main_frame, font=("Courier", 10), width=50)
            key_entry.pack(fill=tk.X, pady=(5, 20))
            key_entry.focus()
            
            # Frame pulsanti
            button_frame = tk.Frame(main_frame)
            button_frame.pack(fill=tk.X, pady=(10, 0))
            
            def on_activate():
                license_key = key_entry.get().strip()
                if license_key:
                    result["license_key"] = license_key
                    dialog.destroy()
                else:
                    messagebox.showerror("Errore", "Inserisci una chiave di licenza valida", parent=dialog)
            
            def on_cancel():
                dialog.destroy()
            
            # Pulsanti
            cancel_btn = tk.Button(
                button_frame,
                text="Annulla",
                command=on_cancel,
                width=12
            )
            cancel_btn.pack(side=tk.RIGHT, padx=(5, 0))
            
            activate_btn = tk.Button(
                button_frame,
                text="Attiva",
                command=on_activate,
                width=12,
                bg="#3498db",
                fg="white",
                font=("Arial", 10, "bold")
            )
            activate_btn.pack(side=tk.RIGHT)
            
            # Bind Enter key
            key_entry.bind('<Return>', lambda e: on_activate())
            
            # Aspetta la chiusura del dialog
            dialog.wait_window()
            
            return result["license_key"]
            
        except Exception as e:
            logger.error(f"Errore nel dialog licenza: {e}")
            return None
    
    def activate_license(self, license_key: str) -> Tuple[bool, str]:
        """Attiva una licenza con la chiave fornita"""
        try:
            # Verifica formato chiave (esempio: VTOOL-XXXXX-XXXXX-XXXXX)
            if not self._validate_license_key_format(license_key):
                return False, "Formato chiave di licenza non valido"
            
            # Determina tipo di licenza dalla chiave
            license_type = self._determine_license_type(license_key)
            if not license_type:
                return False, "Chiave di licenza non riconosciuta"
            
            # Genera licenza
            license_data = self.generate_license(license_key, license_type)
            
            # Salva licenza
            if self.save_license(license_data):
                logger.info(f"Licenza attivata: {license_type}")
                return True, f"Licenza {license_type} attivata con successo"
            else:
                return False, "Errore nel salvataggio della licenza"
            
        except Exception as e:
            logger.error(f"Errore nell'attivazione licenza: {e}")
            return False, f"Errore nell'attivazione: {str(e)}"
    
    def get_decrypted_license_key(self) -> Optional[str]:
        """Ottiene la chiave di licenza decrittografata (solo per debug)"""
        license_data = self.load_license()
        if license_data and 'license_key' in license_data:
            return self._decrypt_license_key(license_data['license_key'])
        return None
    
    def _validate_license_key_format(self, license_key: str) -> bool:
        """Valida il formato della chiave di licenza"""
        license_key_upper = license_key.upper()
        
        # Prima controlla se è una chiave predefinita nel config
        if hasattr(self, 'config') and 'predefined_keys' in self.config:
            for key in self.config['predefined_keys'].keys():
                if key.upper() == license_key_upper:
                    return True
        
        import re
        
        # Formato nuovo: VTOOL-TIPO-AAAAMMGG-CODICE
        new_pattern = r'^VTOOL-[A-Z]{3}-\d{8}-[A-Z0-9]{4,8}$'
        if re.match(new_pattern, license_key_upper):
            return True
        
        # Formato generato dal nostro script: TIPO-MMAA-XXXX-XXXXX-XXXX
        generated_pattern = r'^[A-Z]{2}\d{2}-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$'
        if re.match(generated_pattern, license_key_upper):
            return True
        
        # Formato standard legacy: VTOOL-XXXXX-XXXXX-XXXXX (dove X sono caratteri alfanumerici)
        legacy_pattern = r'^VTOOL-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$'
        return bool(re.match(legacy_pattern, license_key_upper))
    
    def _determine_license_type(self, license_key: str) -> Optional[str]:
        """Determina il tipo di licenza dalla chiave usando algoritmo intelligente"""
        license_key_upper = license_key.upper()
        
        # Prima controlla le chiavi predefinite nel config
        if hasattr(self, 'config') and 'predefined_keys' in self.config:
            for key, info in self.config['predefined_keys'].items():
                if key.upper() == license_key_upper:
                    return info['type'].upper()
        
        # Usa l'algoritmo intelligente per analizzare chiavi generate
        key_analysis = self._analyze_generated_key(license_key)
        if key_analysis.get('is_valid', False):
            logger.info(f"Chiave analizzata automaticamente: {license_key} -> {key_analysis['type']}")
            return key_analysis['type']
        
        # Esempi di chiavi predefinite per testing (formato VTOOL)
        test_keys = {
            "VTOOL-TRIAL-00001-TEST1": "TRIAL",
            "VTOOL-STAND-00001-TEST1": "STANDARD", 
            "VTOOL-PROFE-00001-TEST1": "PROFESSIONAL",
            "VTOOL-ENTER-00001-TEST1": "ENTERPRISE"
        }
        
        # Controlla chiavi di test
        if license_key_upper in test_keys:
            return test_keys[license_key_upper]
        
        # Pattern per le chiavi formato VTOOL: VTOOL-TIPO-AAAAMMGG-CODICE
        import re
        vtool_pattern = r'^VTOOL-([A-Z]+)-(\d{8})-([A-Z0-9]+)$'
        vtool_match = re.match(vtool_pattern, license_key_upper)
        
        if vtool_match:
            license_type_code = vtool_match.group(1)
            
            # Mappa i codici tipo alle licenze
            type_mapping = {
                'TRL': 'TRIAL',
                'STD': 'STANDARD',
                'PRO': 'PROFESSIONAL', 
                'ENT': 'ENTERPRISE'
            }
            
            if license_type_code in type_mapping:
                return type_mapping[license_type_code]
        
        # Logica per determinare il tipo dalla chiave (fallback)
        if "TRIAL" in license_key_upper or "TRL" in license_key_upper:
            return "TRIAL"
        elif "STAND" in license_key_upper or "STD" in license_key_upper:
            return "STANDARD"
        elif "PROFE" in license_key_upper or "PRO" in license_key_upper:
            return "PROFESSIONAL"
        elif "ENTER" in license_key_upper or "ENT" in license_key_upper:
            return "ENTERPRISE"
        
        return None
    
    def _get_detailed_error_message(self, message: str) -> str:
        """Restituisce un messaggio di errore dettagliato e user-friendly"""
        error_messages = {
            "Licenza non trovata": "🚫 Nessuna licenza installata\n   • Prima installazione del software\n   • File di licenza mancante o eliminato",
            "Licenza non valida o manomessa": "⚠️ Licenza corrotta o manomessa\n   • File di licenza danneggiato\n   • Tentativo di modifica non autorizzata\n   • Reinstallazione necessaria",
            "Licenza non valida per questa macchina": "🖥️ Licenza non compatibile con questo computer\n   • Licenza generata per un'altra macchina\n   • Hardware modificato significativamente\n   • Contatta l'amministratore per una nuova licenza",
            "Tipo di licenza non riconosciuto": "❓ Tipo di licenza sconosciuto\n   • Formato licenza non supportato\n   • Versione software incompatibile\n   • Aggiornamento necessario"
        }
        
        # Controlla se il messaggio contiene informazioni sulla scadenza
        if "scaduta il" in message.lower():
            return f"⏰ Licenza scaduta\n   • {message}\n   • Rinnovo necessario per continuare"
        
        # Cerca corrispondenze esatte
        for key, detailed_msg in error_messages.items():
            if key.lower() in message.lower():
                return detailed_msg
        
        # Messaggio generico se non trova corrispondenze
        return f"❌ {message}\n   • Verifica la validità della licenza\n   • Contatta il supporto tecnico se il problema persiste"
    
    def _get_detailed_activation_error(self, message: str) -> str:
        """Restituisce un messaggio di errore dettagliato per l'attivazione"""
        activation_errors = {
            "formato chiave di licenza non valido": "🔑 Formato chiave non corretto\n   • La chiave deve seguire il formato: VTOOL-XXXXX-XXXXX-XXXXX\n   • Verifica di aver copiato la chiave completa\n   • Controlla che non ci siano spazi extra",
            "chiave di licenza non riconosciuta": "❓ Chiave sconosciuta\n   • La chiave inserita non è nel database\n   • Potrebbe essere scaduta o revocata\n   • Verifica con l'amministratore",
            "errore nel salvataggio della licenza": "💾 Errore di scrittura\n   • Permessi insufficienti sulla cartella license/\n   • Disco pieno o protetto da scrittura\n   • Antivirus che blocca la scrittura",
            "errore nell'attivazione": "⚠️ Errore generico di attivazione\n   • Problema temporaneo del sistema\n   • Riprova tra qualche minuto\n   • Riavvia l'applicazione se necessario"
        }
        
        # Cerca corrispondenze
        for key, detailed_msg in activation_errors.items():
            if key.lower() in message.lower():
                return detailed_msg
        
        # Messaggio generico
        return f"❌ {message}\n   • Errore non previsto durante l'attivazione\n   • Contatta il supporto tecnico"
    
    def check_license(self, parent=None) -> bool:
        """Metodo principale per il controllo licenza (alias per check_license_on_startup)"""
        return self.check_license_on_startup(parent)
    
    def check_license_on_startup(self, parent=None) -> bool:
        """Controlla la licenza all'avvio dell'applicazione"""
        try:
            # Carica e valida licenza esistente
            is_valid, message = self.validate_license()
            
            if is_valid:
                logger.info("Licenza valida trovata")
                return True
            
            logger.warning(f"Licenza non valida: {message}")
            print(f"DEBUG: Licenza non valida - {message}")  # Debug per console
            
            # Mostra messaggio di errore dettagliato e richiedi nuova licenza
            if parent:
                error_details = self._get_detailed_error_message(message)
                messagebox.showwarning(
                    "🔐 Licenza Richiesta - Verifica Tool V2",
                    f"❌ Problema con la licenza:\n{error_details}\n\n"
                    "💡 È necessario attivare una licenza valida per continuare.\n\n"
                    f"🔧 ID Macchina: {self.machine_id}\n"
                    "📞 Contatta l'amministratore per ottenere una licenza valida.",
                    parent=parent
                )
            
            # Loop per permettere all'utente di riprovare l'inserimento della chiave
            print("DEBUG: Avvio loop richiesta licenza")  # Debug
            while True:
                # Richiedi chiave di licenza
                print("DEBUG: Chiamata request_license_key")  # Debug
                license_key = self.request_license_key(parent)
                print(f"DEBUG: Ricevuta chiave: {license_key is not None}")  # Debug
                
                if not license_key:
                    # Utente ha annullato
                    return False
                
                # Attiva licenza
                success, activation_message = self.activate_license(license_key)
                
                if success:
                    if parent:
                        messagebox.showinfo(
                            "✅ Licenza Attivata",
                            f"🎉 {activation_message}\n\n"
                            "L'applicazione può ora essere utilizzata.",
                            parent=parent
                        )
                    return True
                else:
                    # Attivazione fallita - mostra errore e chiedi se riprovare
                    if parent:
                        detailed_error = self._get_detailed_activation_error(activation_message)
                        
                        # Chiedi se vuole riprovare
                        retry = messagebox.askyesno(
                            "❌ Errore Attivazione Licenza",
                            f"Impossibile attivare la licenza:\n\n{detailed_error}\n\n"
                            "🔧 Soluzioni possibili:\n"
                            "• Verifica che la chiave sia corretta\n"
                            "• Controlla la connessione di rete\n"
                            "• Contatta l'amministratore del sistema\n\n"
                            "❓ Vuoi inserire una nuova chiave di licenza?",
                            parent=parent
                        )
                        
                        if not retry:
                            return False
                        # Se retry è True, il loop continua
                    else:
                        # Senza parent, esce al primo errore
                        return False
            
        except Exception as e:
            logger.error(f"Errore nel controllo licenza: {e}")
            if parent:
                messagebox.showerror(
                    "Errore",
                    f"Errore nel sistema di licenze: {str(e)}",
                    parent=parent
                )
            return False

# Utility per generare chiavi di test
def generate_test_license_keys():
    """Genera chiavi di licenza di test"""
    keys = {
        "TRIAL": "VTOOL-TRIAL-00001-TEST1",
        "STANDARD": "VTOOL-STAND-00001-TEST1", 
        "PROFESSIONAL": "VTOOL-PROFE-00001-TEST1",
        "ENTERPRISE": "VTOOL-ENTER-00001-TEST1"
    }
    
    print("🔑 Chiavi di Licenza di Test:")
    print("=" * 50)
    for license_type, key in keys.items():
        print(f"{license_type:12}: {key}")
    print("=" * 50)
    
    return keys

# Test del sistema di licenze
if __name__ == "__main__":
    # Test di base
    import tempfile
    
    with tempfile.TemporaryDirectory() as temp_dir:
        license_manager = LicenseManager(temp_dir)
        
        print(f"ID Macchina: {license_manager.machine_id}")
        
        # Genera chiavi di test
        test_keys = generate_test_license_keys()
        
        # Test attivazione licenza PROFESSIONAL
        success, message = license_manager.activate_license(test_keys["PROFESSIONAL"])
        print(f"\nAttivazione: {success} - {message}")
        
        # Test validazione
        is_valid, validation_message = license_manager.validate_license()
        print(f"Validazione: {is_valid} - {validation_message}")
        
        # Informazioni licenza
        info = license_manager.get_license_info()
        if info:
            print(f"\nInfo Licenza:")
            print(f"  Tipo: {info['license_type']}")
            print(f"  Scadenza: {info['expiry_date']}")
            print(f"  Giorni rimanenti: {info['days_remaining']}")
            print(f"  Funzionalità: {', '.join(info['features'])}")