document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('date-picker');
    const availabilityLoader = document.getElementById('availability-loader');
    const timeGrid = document.getElementById('time-grid');
    const appointmentForm = document.getElementById('appointment-form');
    const requestTypeRadios = document.querySelectorAll('input[name="request_type"]');
    const reasonInput = document.getElementById('reason');
    const reasonGrid = document.getElementById('reason-grid');
    const dateGroup = document.getElementById('date-group');
    const userType = localStorage.getItem('user_type') || 'studio';

    // Personalizzazione Etichette in base al tipo utente
    const nameLabel = document.querySelector('label[for="name"]');
    const emailLabel = document.querySelector('label[for="email"]');
    if (userType === 'privato' && nameLabel) {
        nameLabel.textContent = "Nome e Cognome";
        if (emailLabel) emailLabel.textContent = "La tua Email";
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.placeholder = "Inserisci il tuo nome completo";
    }

    // 1. Inizializzazione Calendario (Flatpickr)
    if (datePicker && typeof flatpickr !== 'undefined') {
        flatpickr(datePicker, {
            locale: "it",
            dateFormat: "d/m/Y",
            minDate: "today",
            disable: [date => (date.getDay() === 0 || date.getDay() === 6)],
            onChange: (selectedDates, dateStr) => {
                if (selectedDates.length > 0) {
                    datePicker.value = dateStr; // Ensure value is clean when date changes
                    timeGrid.classList.remove('visible');
                    timeGrid.innerHTML = '';
                    availabilityLoader.style.display = 'block';
                    setTimeout(() => {
                        availabilityLoader.style.display = 'none';
                        generateTimeSlots(dateStr);
                        timeGrid.classList.add('visible');
                    }, 800);
                }
            }
        });

        function generateTimeSlots(dateStr) {
            timeGrid.innerHTML = '';
            for (let hour = 8; hour <= 17; hour++) {
                const minutes = (hour === 17) ? ['00'] : ['00', '30'];
                minutes.forEach(min => {
                    const time = `${hour.toString().padStart(2, '0')}:${min}`;
                    const slot = document.createElement('div');
                    slot.className = 'time-slot';
                    slot.textContent = time;
                    slot.addEventListener('click', () => {
                        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                        slot.classList.add('selected');
                        // Formato finale inviato al backend
                        datePicker.value = `${dateStr} alle ore ${time}`;
                    });
                    timeGrid.appendChild(slot);
                });
            }
        }
    }

    // Funzione di sanificazione base per prevenire Injection
    const sanitizeString = (str) => {
        if (!str) return "";
        return str.replace(/[<>]/g, "").trim(); // Rimuove tag HTML potenzialmente pericolosi
    };

    // 2. Logica Flusso Form
    const updateFormFlow = (type) => {
        const options = {
            preventivo: [
                { id: 'colloquio', label: 'Preventivo Tecnico', icon: 'fa-file-invoice-dollar' },
                { id: 'consulto', label: 'Richiesta Info', icon: 'fa-info-circle' }
            ],
            studio: [
                { id: 'consegna', label: 'Consegna Lavoro', icon: 'fa-box-open' },
                { id: 'ritiro', label: 'Ritiro Impronte', icon: 'fa-truck-loading' },
                { id: 'urgenza', label: 'Riparazione Urgente', icon: 'fa-kit-medical' }
            ],
            privato: [
                { id: 'riparazione', label: 'Riparazione Protesi', icon: 'fa-tools' },
                { id: 'pulizia', label: 'Pulizia/Igiene', icon: 'fa-hand-sparkles' },
                { id: 'consulto', label: 'Richiesta Info', icon: 'fa-question-circle' }
            ]
        };

        const currentOptions = type === 'preventivo' ? options.preventivo : options[userType];
        
        // Svuota e rigenera la griglia
        if (reasonGrid && reasonInput) {
            reasonGrid.innerHTML = '';
            reasonInput.value = ''; // Reset valore nascosto

            currentOptions.forEach(opt => {
                const card = document.createElement('div');
                card.className = 'reason-card';
                
                // Creazione sicura degli elementi (Prevenzione XSS)
                const icon = document.createElement('i');
                icon.className = `fas ${opt.icon}`;
                
                const label = document.createElement('span');
                label.textContent = opt.label;
                
                card.appendChild(icon);
                card.appendChild(label);
                
                card.addEventListener('click', function() {
                    document.querySelectorAll('.reason-card').forEach(c => c.classList.remove('selected'));
                    this.classList.add('selected');
                    reasonInput.value = opt.id;
                });
                
                reasonGrid.appendChild(card);
            });
        }

        if (type === 'preventivo') {
            dateGroup.classList.add('hidden-group');
            if (datePicker) datePicker.required = false;
        } else {
            dateGroup.classList.remove('hidden-group');
            if (datePicker) datePicker.required = true;
        }
    };

    requestTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.radio-option').forEach(opt => opt.classList.remove('selected'));
            e.target.closest('.radio-option').classList.add('selected');
            updateFormFlow(e.target.value);
        });
    });

    // Inizializzazione stato iniziale per caricare le opzioni corrette (Studio/Privato)
    updateFormFlow('appuntamento');

    // 3. Invio Form
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Verifica Honeypot (Anti-Spam)
            const honey = document.getElementById('honeypot');
            if (honey && honey.value !== "") {
                console.warn("Spam detectato.");
                return;
            }

            if (!reasonInput.value) {
                alert("Per favore, seleziona il tipo di intervento/motivo cliccando su una delle icone.");
                return;
            }

            // Sanificazione input prima dell'invio
            const formData = new FormData(appointmentForm);
            const cleanData = new URLSearchParams();
            
            for (let [key, value] of formData.entries()) {
                // Se è una stringa, la sanifichiamo
                const sanitizedValue = typeof value === 'string' ? sanitizeString(value) : value;
                cleanData.append(key, sanitizedValue);
            }

            const submitBtn = appointmentForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            submitBtn.textContent = "Invio in corso...";
            submitBtn.disabled = true;

            // URL del tuo backend su Render
            const scriptURL = 'https://laboratorio-odontotecnico.onrender.com/api/prenotazioni';
            
            fetch(scriptURL, { method: 'POST', body: cleanData })
            .then(res => {
                if (!res.ok) throw new Error('Errore di rete o del server: ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    alert('Richiesta inviata con successo!');
                    appointmentForm.reset();
                    if (timeGrid) timeGrid.classList.remove('visible');
                    // Reset delle card selezionate
                    document.querySelectorAll('.reason-card').forEach(c => c.classList.remove('selected'));
                } else {
                    throw new Error(data.message || 'Errore del server');
                }
            })
            .catch(error => {
                console.error('Dettaglio Errore:', error);
                let userMsg = error.message;
                if (userMsg === "Failed to fetch") {
                    userMsg = "Errore di connessione (CORS). Assicurati che lo script sia pubblicato correttamente come 'Chiunque'.";
                }
                alert('Errore durante l\'invio: ' + userMsg + '\n\nControlla la console per i dettagli.');
            })
            .finally(() => {
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            });
        });
        
        // Aggiungi categoria utente nascosta
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'user_category';
        hiddenInput.value = userType;
        appointmentForm.appendChild(hiddenInput);
    }
});