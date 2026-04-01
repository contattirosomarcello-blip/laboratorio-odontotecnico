import requests
import os
from dotenv import load_dotenv

# Carica le configurazioni dal file .env
load_dotenv()

# Default a localhost se non specificato diversamente nel file .env
BASE_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:5000")
TELEGRAM_SECRET = os.environ.get("TELEGRAM_SECRET", "")

def test_contact_form():
    print("\n--- Test 1: Invio Modulo Contatti ---")
    payload = {
        "nome": "Test Utente",
        "email": "test@esempio.com",
        "telefono": "123456789",
        "messaggio": "Questa è una prova di invio contatti."
    }
    try:
        response = requests.post(f"{BASE_URL}/send_email", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Risposta: {response.json()}")
    except Exception as e:
        print(f"Errore: {e}")

def test_appointment_form():
    print("\n--- Test 2: Invio Prenotazione Appuntamento ---")
    payload = {
        "nome": "Mario Rossi",
        "email": "mario.rossi@esempio.it",
        "telefono": "3339988776",
        "messaggio": "Vorrei una pulizia dei denti.",
        "data": "25/12/2024 10:30"
    }
    try:
        response = requests.post(f"{BASE_URL}/send_email", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Risposta: {response.json()}")
    except Exception as e:
        print(f"Errore: {e}")

def test_check_availability():
    print("\n--- Test 3: Controllo Disponibilità ---")
    params = {"date": "25/12/2024"}
    try:
        response = requests.get(f"{BASE_URL}/check_availability", params=params)
        print(f"Status Code: {response.status_code}")
        print(f"Risposta: {response.json()}")
    except Exception as e:
        print(f"Errore: {e}")

def test_telegram_webhook():
    print("\n--- Test 4: Simulazione Messaggio Telegram (/start) ---")
    headers = {
        "X-Telegram-Bot-Api-Secret-Token": TELEGRAM_SECRET,
        "Content-Type": "application/json"
    }
    payload = {
        "message": {
            "chat": {"id": int(os.environ.get("TELEGRAM_CHAT_ID", 0))},
            "text": "/start"
        }
    }
    try:
        response = requests.post(f"{BASE_URL}/webhook", json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Risposta: {response.json()}")
    except Exception as e:
        print(f"Errore: {e}")

def test_track_visit():
    print("\n--- Test 5: Tracciamento Visita ---")
    try:
        response = requests.post(f"{BASE_URL}/track_visit")
        print(f"Status Code: {response.status_code}")
        print(f"Risposta: {response.json()}")
    except Exception as e:
        print(f"Errore: {e}")

def check_server_status():
    try:
        requests.get(BASE_URL, timeout=2)
        return True
    except requests.exceptions.ConnectionError:
        return False

if __name__ == "__main__":
    if not check_server_status():
        print(f"❌ ERRORE CRITICO: Il server backend non è raggiungibile su {BASE_URL}")
        print("👉 Assicurati di aver lanciato 'python app.py' in un altro terminale.")
        exit(1)

    # Chiedi all'utente cosa testare
    print("\nCosa vuoi testare?")
    print("1. Modulo Contatti")
    print("2. Prenotazione Appuntamento")
    print("3. Disponibilità Orari")
    print("4. Messaggio Telegram /start")
    print("5. Tracciamento Visita")
    print("6. Tutti i test")
    
    scelta = input("\nInserisci il numero della scelta: ")
    
    if scelta == "1":
        test_contact_form()
    elif scelta == "2":
        test_appointment_form()
    elif scelta == "3":
        test_check_availability()
    elif scelta == "4":
        test_telegram_webhook()
    elif scelta == "5":
        test_track_visit()
    elif scelta == "6":
        test_contact_form()
        test_appointment_form()
        test_check_availability()
        test_telegram_webhook()
        test_track_visit()