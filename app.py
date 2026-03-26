from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import json
import urllib.parse
import re
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "contatti.rosomarcello@gmail.com").strip()
BREVO_ADMIN_RECIPIENT = os.environ.get("BREVO_ADMIN_RECIPIENT", "contatti.rosomarcello@gmail.com").strip()

GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwoeUyQyflLQEajTgYLfK47mzyBZuaemDWWKVpfhwPZTvS9iZ0ekt0KDtusjLkHYNm1/exec"

if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
    print("ERRORE CRITICO: Token o Chat ID non trovati!")
    print("   Assicurati di aver creato il file .env nella stessa cartella di app.py")

def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email) is not None

@app.route("/", methods=["GET"])
def index():
    return "Bot Telegram attivo 🤖 (v2.1 - Test Finale)", 200

@app.route("/set_webhook", methods=["GET"])
def set_webhook():
    print("Richiesta configurazione Webhook ricevuta...")
    base_url = request.host_url
    if "onrender.com" in base_url:
        base_url = base_url.replace("http://", "https://")
    
    webhook_url = f"{base_url}webhook"
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook?url={webhook_url}"
    
    try:
        resp = requests.get(telegram_url)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/webhook", methods=["POST", "OPTIONS"])
def webhook():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.json
    if not data:
        return {"status": "ignored", "message": "No JSON data"}, 200

    if "callback_query" in data:
        print(f"CALLBACK_QUERY RICEVUTA! Dati completi: {data}")
        callback = data["callback_query"]
        
        if not TELEGRAM_TOKEN:
            print("ERRORE CRITICO: TELEGRAM_TOKEN non è impostato!")
            return {"status": "error", "message": "Token missing"}, 200
        
        try:
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery", json={
                "callback_query_id": callback["id"],
                "text": "Elaborazione..."
            }, timeout=5)
            print(f"answerCallbackQuery risposta: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"Errore nella answerCallbackQuery: {e}")

        chat_id = callback["message"]["chat"]["id"]
        message_id = callback["message"]["message_id"]
        data_str = callback["data"]
        print(f"Callback ricevuta: {data_str} | chat_id: {chat_id} | message_id: {message_id}")

        try:
            action, date_app, time_app = data_str.split("|")
        except ValueError:
            print(f"Errore formato callback data: {data_str}")
            try:
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={"chat_id": chat_id, "text": "Errore: Dati del pulsante non validi."})
            except: pass
            return {"status": "error", "message": "Invalid callback data"}, 200
        
        new_status = "Confermato" if action == "confirm" else "Rifiutato"
        emoji = "✅" if action == "confirm" else "❌"

        sheet_success = False
        client_info = {}
        try:
            resp = requests.post(GOOGLE_SCRIPT_URL, data={
                "action": "update_status",
                "date": date_app,
                "time": time_app,
                "status": new_status
            })
            if resp.status_code == 200:
                sheet_success = True
                try:
                    client_info = resp.json()
                except:
                    pass
        except Exception as e:
            print(f"Errore nell'aggiornamento del foglio: {e}")

        try:
            edit_message = {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": f"{emoji} Appuntamento {new_status.lower()}!",
                "reply_markup": {"inline_keyboard": []}
            }
            resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/editMessageText", json=edit_message, timeout=5)
            print(f"editMessageText risposta: {resp.status_code}")
        except Exception as e:
            print(f"Errore nell'edit del messaggio: {e}")

        if sheet_success:
            try:
                nome = client_info.get("nome", "Cliente")
                email = client_info.get("email", "")
                telefono = client_info.get("telefono", "")
                messaggio = client_info.get("messaggio", "")
                
                if action == "confirm":
                    text = f"🎉 Buone Notizie!\n\nIl tuo appuntamento del {date_app} alle {time_app} è stato confermato!\n\n📅 Data: {date_app}\n🕐 Ora: {time_app}\n👤 Nome: {nome}\n📧 Email: {email}\n📞 Telefono: {telefono}\n\nSe hai domande, contattaci pure!\n\nCentro Odontoiatrico Dr. Marcello"
                else:
                    text = f"❌ Appuntamento Rifiutato\n\nIl tuo appuntamento del {date_app} alle {time_app} è stato rifiutato.\n\n📅 Data: {date_app}\n🕐 Ora: {time_app}\n👤 Nome: {nome}\n\nContattaci per riprenotare!\n\nCentro Odontoiatrico Dr. Marcello"
                
                requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": text
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio di conferma: {e}")

        return {"status": "processed"}, 200

    if "message" in data:
        message = data["message"]
        chat_id = message["chat"]["id"]
        text = message.get("text", "").strip()
        
        if text.startswith("/start"):
            try:
                keyboard = {"inline_keyboard": [
                    [{"text": "📅 Prenota Appuntamento", "url": "https://hehetzu.github.io/marcello-bot"}],
                    [{"text": "📞 Chiama", "url": "tel:+393123456789"}],
                    [{"text": "💬 WhatsApp", "url": "https://wa.me/393123456789"}]
                ]}
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "👋 Benvenuto nel Bot del Centro Odontoiatrico Dr. Marcello!\n\nScegli un'opzione:",
                    "reply_markup": keyboard
                }, timeout=5)
                print(f"Messaggio di benvenuto inviato: {resp.status_code}")
            except Exception as e:
                print(f"Errore nell'invio del messaggio di benvenuto: {e}")
        
        elif text.startswith("/help"):
            try:
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "🤖 Comandi disponibili:\n/start - Menu principale\n/help - Questa guida\n\nOppure usa il sito web per prenotare!"
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio help: {e}")
        
        else:
            try:
                resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": "📝 Per prenotare un appuntamento, usa il pulsante qui sopra o visita il nostro sito web!\n\nCentro Odontoiatrico Dr. Marcello"
                }, timeout=5)
            except Exception as e:
                print(f"Errore nell'invio del messaggio generico: {e}")

    return {"status": "ok"}, 200

@app.route("/send_email", methods=["POST"])
def send_email():
    if not BREVO_API_KEY:
        return jsonify({"status": "error", "message": "Brevo API Key missing"}), 500

    data = request.json
    nome = data.get("nome", "Utente")
    email_cliente = data.get("email", "")
    telefono = data.get("telefono", "")
    
    if email_cliente and not is_valid_email(email_cliente):
        return jsonify({"status": "error", "message": "Email cliente non valida"}), 400
    
    if not email_cliente and not telefono:
        return jsonify({"status": "error", "message": "Inserire almeno email o telefono"}), 400

    messaggio = data.get("messaggio", "")
    data_app = data.get("data", "")

    date_row_client = f"<p><strong>Data/Ora preferita:</strong> {data_app}</p>" if data_app else ""
    
    date_row_admin_html = ""
    confirm_btn_html = ""

    if data_app:
        date_row_admin_html = f"""
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Data/Ora:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">{data_app}</td>
        </tr>
        """
        
        parts = data_app.strip().split()
        if len(parts) >= 2:
            date_only = parts[0]
            time_only = parts[1]
            base_url = request.host_url
            if "onrender.com" in base_url:
                base_url = base_url.replace("http://", "https://")
            
            params = {"date": date_only, "time": time_only, "email": email_cliente, "name": nome}
            confirm_url = f"{base_url}confirm_from_email?{urllib.parse.urlencode(params)}"
            confirm_btn_html = f'<a href="{confirm_url}" style="background-color: #28a745; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 10px; display: inline-block; font-weight: bold;">✅ Conferma</a>'
    
    request_type_label = "Appuntamento" if data_app else "Preventivo/Info"
    
    header_color = "#28a745" if data_app else "#2c3e50"

    subject_admin = f"Nuova richiesta ({request_type_label}): {nome}"
    
    html_admin = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{subject_admin}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: {header_color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">📧 Nuova Richiesta</h1>
            <p style="margin: 5px 0 0 0;">{request_type_label}</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Nome:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #2c3e50; font-weight: bold;">{nome}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Email:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{email_cliente or 'Non fornita'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Telefono:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{telefono or 'Non fornito'}</td>
                </tr>
                {date_row_admin_html}
                <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7f8c8d;"><strong>Messaggio:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #eee;">{messaggio or 'Nessun messaggio'}</td>
                </tr>
            </table>
            
            {confirm_btn_html}
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #7f8c8d; font-size: 12px;">
            <p>Centro Odontoiatrico Dr. Marcello</p>
        </div>
    </body>
    </html>
    """
    
    try:
        brevo_url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json"
        }
        
        payload = {
            "sender": {"name": "Centro Odontoiatrico Dr. Marcello", "email": BREVO_SENDER_EMAIL},
            "to": [{"email": BREVO_ADMIN_RECIPIENT}],
            "subject": subject_admin,
            "htmlContent": html_admin
        }
        
        resp = requests.post(brevo_url, json=payload, headers=headers, timeout=10)
        
        if resp.status_code == 201:
            print(f"Email admin inviata con successo a {BREVO_ADMIN_RECIPIENT}")
            
            # Invia email di conferma al cliente se ha fornito l'email
            if email_cliente:
                subject_client = f"Conferma richiesta {request_type_label} - Centro Odontoiatrico Dr. Marcello"
                
                html_client = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>{subject_client}</title>
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0;">✅ Richiesta Ricevuta</h1>
                        <p style="margin: 5px 0 0 0;">Grazie per averci contattato!</p>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
                        <p>Ciao <strong>{nome}</strong>,</p>
                        <p>Abbiamo ricevuto la tua richiesta di {request_type_label.lower()} e ti contatteremo al più presto possibile.</p>
                        
                        <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #2c3e50;">Riepilogo della tua richiesta:</h3>
                            <p><strong>Nome:</strong> {nome}</p>
                            <p><strong>Email:</strong> {email_cliente}</p>
                            <p><strong>Telefono:</strong> {telefono or 'Non fornito'}</p>
                            {date_row_client}
                            <p><strong>Messaggio:</strong> {messaggio or 'Nessun messaggio'}</p>
                        </div>
                        
                        <p>Se hai urgenza, puoi contattarci direttamente:</p>
                        <p>📞 Telefono: +39 312 345 6789<br>
                        💬 WhatsApp: <a href="https://wa.me/393123456789">+39 312 345 6789</a></p>
                        
                        <p style="color: #7f8c8d; font-size: 14px;">Centro Odontoiatrico Dr. Marcello</p>
                    </div>
                </body>
                </html>
                """
                
                payload_client = {
                    "sender": {"name": "Centro Odontoiatrico Dr. Marcello", "email": BREVO_SENDER_EMAIL},
                    "to": [{"email": email_cliente}],
                    "subject": subject_client,
                    "htmlContent": html_client
                }
                
                resp_client = requests.post(brevo_url, json=payload_client, headers=headers, timeout=10)
                if resp_client.status_code == 201:
                    print(f"Email cliente inviata con successo a {email_cliente}")
                else:
                    print(f"Errore invio email cliente: {resp_client.status_code} - {resp_client.text}")
            
            # Salva nel Google Sheet
            try:
                sheet_data = {
                    "action": "add_request",
                    "nome": nome,
                    "email": email_cliente,
                    "telefono": telefono,
                    "messaggio": messaggio,
                    "data_app": data_app,
                    "tipo": request_type_label
                }
                resp_sheet = requests.post(GOOGLE_SCRIPT_URL, data=sheet_data, timeout=10)
                if resp_sheet.status_code == 200:
                    print("Dati salvati nel Google Sheet")
                else:
                    print(f"Errore salvataggio Google Sheet: {resp_sheet.status_code}")
            except Exception as e:
                print(f"Errore Google Sheet: {e}")
            
            return jsonify({"status": "success", "message": "Email inviata con successo"})
        else:
            print(f"Errore Brevo: {resp.status_code} - {resp.text}")
            return jsonify({"status": "error", "message": "Errore nell'invio dell'email"}), 500
    except Exception as e:
        print(f"Errore generale invio email: {e}")
        return jsonify({"status": "error", "message": "Errore interno del server"}), 500

@app.route("/confirm_from_email", methods=["GET"])
def confirm_from_email():
    date = request.args.get("date")
    time = request.args.get("time")
    email = request.args.get("email")
    name = request.args.get("name")
    
    if not all([date, time, email, name]):
        return "Parametri mancanti", 400
    
    try:
        resp = requests.post(GOOGLE_SCRIPT_URL, data={
            "action": "update_status",
            "date": date,
            "time": time,
            "status": "Confermato"
        }, timeout=10)
        
        if resp.status_code == 200:
            return f"""
            <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #28a745;">✅ Appuntamento Confermato!</h1>
                <p>Grazie {name}, il tuo appuntamento del {date} alle {time} è stato confermato.</p>
                <p>Ti aspettiamo presso il Centro Odontoiatrico Dr. Marcello!</p>
            </body>
            </html>
            """, 200
        else:
            return "Errore nella conferma", 500
    except Exception as e:
        print(f"Errore conferma email: {e}")
        return "Errore interno", 500

if __name__ == "__main__":
    app.run(debug=True)
