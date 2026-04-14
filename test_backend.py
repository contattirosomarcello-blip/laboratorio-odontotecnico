import os
import requests
import time

try:
    from admin_token import ADMIN_TOKEN
except ImportError:
    ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', '').strip()

if not ADMIN_TOKEN:
    raise RuntimeError('Admin token non configurato. Crea admin_token.py o imposta la variabile d\'ambiente ADMIN_TOKEN.')

print(f"DEBUG: Utilizzando token con lunghezza {len(ADMIN_TOKEN)} caratteri")

# URL del backend su Render
URL = "https://laboratorio-odontotecnico.onrender.com/api/prenotazioni"

def send_post(data, label):
    print(f"\n>>> [POST] Invio {label}...")
    try:
        response = requests.post(URL, data=data)
        response.raise_for_status()
        print(f"Status Code: {response.status_code}")
        try:
            result = response.json()
            print(f"Risposta: {result}")
            
            if result.get('status') == 'error' or result.get('result') == 'error':
                print(f"!! ERRORE LATO SERVER: {result.get('message', 'Nessun dettaglio fornito')}")

            # Verifica la presenza dei campi necessari
            if (result.get('status') == 'success' or result.get('result') == 'success') and 'id' not in result:
                print("ERRORE: ID mancante. Il backend sta eseguendo una versione VECCHIA del codice. Crea una 'Nuova Versione' del deployment.")
                
            return result
        except ValueError:
            print(f"Errore: Il server non ha restituito JSON. Risposta: {response.text}")
            return None
    except Exception as e:
        print(f"ERRORE CRITICO: {e}")
        return None

def send_admin_action(action, request_id):
    print(f"\n>>> [POST] Esecuzione azione '{action}' per ID: {request_id}...")
    params = {'action': action, 'id': request_id, 'admin_token': ADMIN_TOKEN}
    try:
        response = requests.post(URL, data=params)
        response.raise_for_status()
        print(f"Status Code: {response.status_code}")
        result = response.json()
        print(f"Risposta: {result}")
        
        if result.get('status') == 'error' or result.get('result') == 'error':
            print(f"!! AZIONE FALLITA: {result.get('message', 'Errore generico')}")
            
        return result
    except Exception as e:
        print(f"ERRORE CRITICO: {e}")
        return None

if __name__ == "__main__": 
    # 1. Test Preventivo
    preventivo = {
        "request_type": "preventivo",
        "name": "Mario Rossi (Test Preventivo)",
        "phone": "3331234567",
        "email": "mario@test.it",
        "reason": "consulto",
        "notes": "Richiesta preventivo via Python",
        "user_category": "privato"
    }
    send_post(preventivo, "PREVENTIVO")
    time.sleep(3)  # Pausa aumentata per stabilità

    # 2. Test Appuntamento Accettato
    app_accettato = {
        "request_type": "appuntamento",
        "name": "Studio Bianchi (Test Accettato)",
        "phone": "011998877",
        "email": "bianchi@test.it",
        "reason": "ritiro",
        "date": "15/05/2026 ore 09:00",
        "notes": "Test accettazione",
        "user_category": "studio"
    }
    res_acc = send_post(app_accettato, "APPUNTAMENTO")
    # Controllo flessibile per 'status' o 'result' e presenza ID
    if res_acc and (res_acc.get('status') == 'success' or res_acc.get('result') == 'success'):
        if res_acc.get('id'):
            time.sleep(2)
            send_admin_action("acceptRequest", res_acc.get('id'))
        else:
            print("ATTENZIONE: ID mancante nella risposta. Impossibile testare l'accettazione.")

    # 3. Test Appuntamento Rifiutato
    time.sleep(3)
    app_rifiutato = app_accettato.copy()
    app_rifiutato["name"] = "Studio Neri (Test Rifiutato)"
    app_rifiutato["notes"] = "Test rifiuto"
    res_rej = send_post(app_rifiutato, "APPUNTAMENTO")
    if res_rej and (res_rej.get('status') == 'success' or res_rej.get('result') == 'success'):
        if res_rej.get('id'):
            time.sleep(2)
            send_admin_action("rejectRequest", res_rej.get('id'))
        else:
            print("ATTENZIONE: ID mancante nella risposta. Impossibile testare il rifiuto.")