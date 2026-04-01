document.addEventListener('DOMContentLoaded', () => {

  // Configurazione percorso tema (passato da functions.php)
  const themePath = (window.themeConfig && window.themeConfig.themeUrl) ? window.themeConfig.themeUrl + '/' : '';

  // Inizializzazione EmailJS (Sostituisci con la tua Public Key)
  // La trovi in Account > API Keys su https://dashboard.emailjs.com/
  if (window.emailjs) emailjs.init("JbtNJPR5Mob1J9gSu");

  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Configurazione Backend URL
  const backendURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                     ? 'http://127.0.0.1:5000' 
                     : 'https://prova-marcello.onrender.com'; 

  // Tracciamento visita all'avvio
  fetch(`${backendURL}/track_visit`, { method: "POST" })
    .catch(err => console.error("Errore tracciamento:", err));

  const hamburger = document.querySelector('.hamburger-menu');
  const nav = document.querySelector('header nav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('is-open');
      nav.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', isOpen);
    });

    document.querySelectorAll('nav a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('is-open');
        nav.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  let currentGalleryItems = [];
  let currentIndex = 0;

  const openModal = () => modal.classList.add('is-open');
  const closeModal = () => modal.classList.remove('is-open');

  function showModalImage(index) {
    const newIndex = (index + currentGalleryItems.length) % currentGalleryItems.length;

    const item = currentGalleryItems[newIndex];
    // Aggiornato per usare il path del tema per l'immagine di default
    modalImg.src = item.tagName === 'VIDEO' ? (item.poster || themePath + 'foto/deflex.jpeg') : item.src;
    currentIndex = newIndex;
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('modal-close')) {
        closeModal();
      }
    });
    modal.querySelector('.prev').addEventListener('click', () => showModalImage(currentIndex - 1));
    modal.querySelector('.next').addEventListener('click', () => showModalImage(currentIndex + 1));
  }

  function setupGallery(galleryId) {
    const galleryWrapper = document.getElementById(galleryId);
    if (!galleryWrapper) return;

    const gallery = galleryWrapper.querySelector('.gallery');
    const prevBtn = galleryWrapper.querySelector('.carousel-btn.prev');
    const nextBtn = galleryWrapper.querySelector('.carousel-btn.next');
    const items = Array.from(gallery.querySelectorAll('img, video'));

    items.forEach((item, index) => {
      if (item.tagName === 'IMG') {
        item.addEventListener('click', () => {
          currentGalleryItems = items;
          showModalImage(index);
          openModal();
        });
      }
    });

    if (prevBtn && nextBtn) {
      const scrollAmount = gallery.clientWidth;
      
      nextBtn.addEventListener('click', () => {
        if (gallery.scrollLeft + gallery.clientWidth >= gallery.scrollWidth - 10) {
          gallery.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          gallery.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      });

      prevBtn.addEventListener('click', () => {
        if (gallery.scrollLeft === 0) {
          gallery.scrollTo({ left: gallery.scrollWidth, behavior: 'smooth' });
        } else {
          gallery.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
      });
    }

    let isDown = false;
    let startX;
    let scrollLeft;

    gallery.addEventListener('mousedown', (e) => {
      isDown = true;
      gallery.style.cursor = 'grabbing';
      startX = e.pageX - gallery.offsetLeft;
      scrollLeft = gallery.scrollLeft;
    });
    gallery.addEventListener('mouseleave', () => { isDown = false; gallery.style.cursor = 'grab'; });
    gallery.addEventListener('mouseup', () => { isDown = false; gallery.style.cursor = 'grab'; });
    gallery.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - gallery.offsetLeft;
      const walk = (x - startX) * 2;
      gallery.scrollLeft = scrollLeft - walk;
    });
  }

  const clientsGalleryContainer = document.querySelector('#clients-gallery .gallery');
  if (clientsGalleryContainer) {
    const clientImages = [
      'foto/foto-cliente-1.jpeg', 'foto/foto-cliente-2.jpeg', 'foto/foto-cliente-3.jpeg',
      'foto/foto-cliente-4.jpeg', 'foto/foto-cliente-5.jpeg', 'foto/foto-cliente-6.jpeg'
    ];
    // Aggiornato per usare il path del tema
    clientsGalleryContainer.innerHTML = clientImages.map(src => 
      `<img src="${themePath}${src}" alt="Risultato finale del lavoro su un paziente" loading="lazy">`
    ).join('');
  }

  setupGallery('main-gallery');
  setupGallery('clients-gallery');


  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.delay) || 0;
        setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });

  const contactForm = document.getElementById('contact-form');
  if(contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitButton = contactForm.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = 'Invio in corso...';
      submitButton.disabled = true;

      // Funzione per gestire l'errore finale
      const handleError = (err) => {
        console.error('Errore invio:', err);
        alert('Si è verificato un errore. Per favore contattaci telefonicamente o su WhatsApp.');
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      };

      // Funzione per gestire il successo
      const handleSuccess = () => {
        alert('Messaggio inviato con successo! Ti risponderemo al più presto.');
        contactForm.reset();
        submitButton.textContent = originalText;
        submitButton.disabled = false;
        if (window.closeContactPopup) window.closeContactPopup(); // Chiude il popup del form
      };

      const formData = new FormData(contactForm);

      const payload = {
        nome: formData.get('name'),
        email: formData.get('email'),
        telefono: formData.get('telefono'),
        messaggio: formData.get('message')
      };

      fetch(`${backendURL}/send_email`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(response => response.json())
      .then(data => {
          if (data.status === 'success') {
            handleSuccess();
            console.log("✅ Sistema sincronizzato correttamente.");
          } else {
            throw new Error(data.message || 'Errore dal server');
          }
      })
      .catch(handleError);
    });
  }

  const contactSection = document.getElementById('contatti');
  const quoteButton = document.querySelector('.fixed-quote-btn');

  // Gestione Popup Form
  window.closeContactPopup = () => {}; // Crea una funzione globale vuota
  const contactInfo = document.querySelector('.contatti-info');
  if (contactForm) {
    contactForm.style.display = 'none';
  }

  if (contactForm && contactInfo) {
    // Aggiungi campo telefono dinamicamente
    if (!contactForm.querySelector('[name="telefono"]')) {
      const emailInput = contactForm.querySelector('input[name="email"]');
      if (emailInput) {
        const emailGroup = emailInput.closest('.form-group');
        if (emailGroup) {
          const phoneGroup = document.createElement('div');
          phoneGroup.className = 'form-group';
          phoneGroup.innerHTML = `
            <label for="telefono">Telefono</label>
            <input type="tel" id="telefono" name="telefono" placeholder="Il tuo numero di telefono">
          `;
          emailGroup.parentNode.insertBefore(phoneGroup, emailGroup.nextSibling);
        }
      }
    }

    // 1. Crea il contenitore Modale
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal';
    modalOverlay.style.zIndex = '10000';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'popup-form-content';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'popup-close-btn';

    // 2. Sposta il form nel modale
    contactForm.parentNode.removeChild(contactForm);
    contactForm.classList.remove('animate-on-scroll');
    contactForm.style.display = 'block';
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(contactForm);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // 3. Funzioni e Eventi
    const openPopup = () => modalOverlay.classList.add('is-open');
    const closePopup = () => modalOverlay.classList.remove('is-open');

    window.closeContactPopup = closePopup; // Rendi la funzione di chiusura accessibile globalmente
    closeBtn.addEventListener('click', closePopup);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closePopup();
    });

    // 4. Aggiungi bottone vicino ai contatti
    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'Richiedi Preventivo';
    infoBtn.className = 'btn';
    infoBtn.addEventListener('click', openPopup);
    contactInfo.appendChild(infoBtn);

    // 5. Collega anche il bottone fisso
    if (quoteButton) {
      quoteButton.addEventListener('click', (e) => {
        e.preventDefault();
        openPopup();
        contactForm.style.display = 'block';
        contactForm.classList.add('is-visible');
        contactSection.scrollIntoView({ behavior: 'smooth' });
        quoteButton.classList.add('is-hidden');
      });
    }
  }

  // --- Gestione visibilità bottoni fissi (Preventivo e WhatsApp) ---
  const footer = document.querySelector('footer');
  const whatsappButton = document.querySelector('.whatsapp-button');
  const scrollThreshold = 200; // Mostra i bottoni dopo 200px di scroll

  // Stato di visibilità delle sezioni che nascondono i bottoni
  let quoteSectionIsVisible = false;
  let whatsappSectionIsVisible = false;

  // Funzione centralizzata per aggiornare la visibilità dei bottoni
  function updateFixedButtonsVisibility() {
    const isScrolled = window.scrollY > scrollThreshold;

    if (quoteButton) {
      const shouldHide = !isScrolled || quoteSectionIsVisible;
      quoteButton.classList.toggle('is-hidden', shouldHide);
    }
    if (whatsappButton) {
      const shouldHide = !isScrolled || whatsappSectionIsVisible;
      whatsappButton.classList.toggle('is-hidden', shouldHide);
    }
  }

  // 1. Esegui il controllo iniziale e imposta il listener per lo scroll
  updateFixedButtonsVisibility();
  window.addEventListener('scroll', updateFixedButtonsVisibility, { passive: true });

  // 2. Imposta un unico IntersectionObserver per monitorare le sezioni rilevanti
  if (contactSection || footer) {
    const intersectionStates = new Map();
    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        intersectionStates.set(entry.target, entry.isIntersecting);
      });
      quoteSectionIsVisible = intersectionStates.get(contactSection) || false;
      whatsappSectionIsVisible = (intersectionStates.get(contactSection) || false) || (intersectionStates.get(footer) || false);
      updateFixedButtonsVisibility();
    }, { threshold: 0.1 });

    if (contactSection) visibilityObserver.observe(contactSection);
    if (footer) visibilityObserver.observe(footer);
  }
});

// Inizializzazione Flatpickr per il calendario
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('app-date');
  const timeModal = document.getElementById('time-modal');
  const sideTimePanel = document.getElementById('side-time-panel');
  const detailsModal = document.getElementById('details-modal');
  const slotsContainer = document.getElementById('slots-container');
  
  // Elementi per la visualizzazione nei popup
  const selectedDateDisplay = document.getElementById('selected-date-display');
  const finalDateDisplay = document.getElementById('final-date-display');
  const finalTimeDisplay = document.getElementById('final-time-display');
  const hiddenDate = document.getElementById('hidden-date');
  // Variabile per memorizzare lo stato degli slot per la data corrente
  let currentAvailability = { occupied: [], pending: [] };
  const hiddenTime = document.getElementById('hidden-time');

  // Funzione globale per chiudere le modali (usata dai bottoni X)
  window.closeModal = (id) => {
    document.getElementById(id).classList.remove('is-open');
  };

  if (dateInput) {
    flatpickr(dateInput, {
      dateFormat: "d/m/Y",
      minDate: "today",
      locale: "it",
      inline: true,
      monthSelectorType: "static",
      disable: [
        function(date) { return date.getDay() === 0; } // Disabilita domeniche
      ],
      onChange: function(selectedDates, dateStr, instance) {
        if (selectedDates.length > 0) {
          selectedDateDisplay.textContent = dateStr;
          hiddenDate.value = dateStr;
          fetchAndGenerateTimeSlots(dateStr); // Chiama la nuova funzione asincrona
        }
      }
    });
  }

  async function fetchAvailability(dateStr) {
    try {
      const encodedDate = encodeURIComponent(dateStr);
      const response = await fetch(`${backendURL}/check_availability?date=${encodedDate}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Availability data:', data); // Debugging
      return {
        occupied: Array.isArray(data.occupied) ? data.occupied : [],
        pending: Array.isArray(data.pending) ? data.pending : []
      };
    } catch (error) {
      console.error("Errore nel recupero della disponibilità dal Google Sheet:", error);
      alert("Impossibile recuperare la disponibilità degli orari. Per favore, riprova più tardi o contattaci.");
      // In caso di errore, si assume che tutti gli slot siano disponibili per evitare di bloccare l'utente
      return { occupied: [], pending: [] }; 
    }
  }

  async function fetchAndGenerateTimeSlots(dateStr) {
    // Pulisci i messaggi precedenti e mostra un loader se vuoi
    slotsContainer.innerHTML = 'Caricamento disponibilità...'; 
    timeModal.classList.add('is-open'); // Apri subito la modale con il loader

    currentAvailability = await fetchAvailability(dateStr);

    generateTimeSlots(dateStr, currentAvailability.occupied, currentAvailability.pending);
    if (sideTimePanel) sideTimePanel.style.display = 'block';
  }

  function generateTimeSlots(dateStr, occupiedSlots, pendingSlots) {
    slotsContainer.innerHTML = '';
    const startHour = 8;
    const endHour = 19;
    const interval = 30; // minuti

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // Non mostrare l'orario se è occupato
        if (occupiedSlots.includes(timeString)) {
          continue; 
        }

        const slotButton = document.createElement('button');
        slotButton.type = 'button';
        slotButton.className = 'time-slot';
        slotButton.textContent = timeString;
        slotButton.dataset.time = timeString;

        if (pendingSlots.includes(timeString)) {
          slotButton.classList.add('pending'); // Aggiungi classe per stile giallo
          slotButton.addEventListener('click', () => {
            alert(`L'orario ${timeString} del ${dateStr} è in attesa di conferma. Puoi provare a prenotarlo, ma potremmo dover proporti un'alternativa.`);
            // Procedi comunque con la prenotazione, l'utente è stato avvisato
            hiddenTime.value = timeString;
            finalDateDisplay.textContent = dateStr;
            finalTimeDisplay.textContent = timeString;
            timeModal.classList.remove('is-open');
            detailsModal.classList.add('is-open');
          });
        } else {
          slotButton.addEventListener('click', () => {
            hiddenTime.value = timeString;
            finalDateDisplay.textContent = dateStr;
            finalTimeDisplay.textContent = timeString;
            timeModal.classList.remove('is-open');
            detailsModal.classList.add('is-open');
          });
        }

        slotsContainer.appendChild(slotButton);
      }
    }
  }

  // Gestione form appuntamento
  const appointmentForm = document.getElementById('appointment-form');
  if (appointmentForm) {
    appointmentForm.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitButton = appointmentForm.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;

      submitButton.textContent = 'Invio in corso...';
      submitButton.disabled = true;

      // Funzione per gestire l'errore finale
      const handleError = (err) => {
        console.error('Errore invio:', err);
        alert('Si è verificato un errore. Per favore contattaci telefonicamente o su WhatsApp.');
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      };

      // Funzione per gestire il successo
      const handleSuccess = () => {
        alert('Prenotazione inviata con successo! Ti contatteremo per confermare.');
        appointmentForm.reset();
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      };

      const formData = new FormData(appointmentForm);

      const payload = {
        nome: formData.get('name'),
        email: formData.get('email'),
        telefono: formData.get('phone'),
        messaggio: formData.get('message'),
        data: `${formData.get('date')} ${formData.get('time')}`
      };

      fetch(`${backendURL}/send_email`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(response => response.json())
      .then(data => {
          if (data.status === 'success') {
            handleSuccess();
          } else {
            throw new Error(data.message || 'Errore server');
          }
      })
      .catch(handleError);
    });
  }
});