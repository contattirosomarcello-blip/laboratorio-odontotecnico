/**
 * Laboratorio Odontotecnico Roso Marcello
 * Ingegneria Frontend Professionale
 */

// 1. Sveglia il server Render immediatamente (Free Tier wakeup)
const bridgeURL = 'https://laboratorio-odontotecnico.onrender.com/api/prenotazioni';
const rootURL = 'https://laboratorio-odontotecnico.onrender.com/';

// Ping leggero alla root per svegliare l'istanza
fetch(rootURL).catch(() => {});

// Tracking della visita (sveglia anche l'intera catena di backend)
fetch(bridgeURL, {
    method: 'POST',
    body: new URLSearchParams({ action: 'trackPageVisit', details: `Visualizzazione: ${document.title || 'Sito Web'}` })
}).catch(() => {});

document.addEventListener('DOMContentLoaded', () => {

    // 0. Automazione Preloader
    const preloader = document.getElementById('preloader');
    if (preloader) {
        window.addEventListener('load', () => {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.visibility = 'hidden';
            }, 500);
        });
    }

    // 0.1 Gestione Selezione Utente (Studio/Privato)
    const selectionModal = document.getElementById('user-selection-modal');
    const userTypeBtns = document.querySelectorAll('.user-type-btn');
    
    // Controlla se esiste già una preferenza
    if (selectionModal) {
        if (localStorage.getItem('user_type')) {
            selectionModal.style.display = 'none';
            selectionModal.classList.remove('active');
        }

        userTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                localStorage.setItem('user_type', type);
                selectionModal.style.display = 'none';
                selectionModal.classList.remove('active');
            });
        });
    }

    // 1. Menu Hamburger per Mobile
    const menuBtn = document.querySelector('.hamburger-menu');
    const mainNav = document.querySelector('#main-nav');
    
    if (menuBtn && mainNav) {
        menuBtn.addEventListener('click', () => {
            const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
            menuBtn.setAttribute('aria-expanded', !expanded);
            mainNav.classList.toggle('active');
        });

        // Chiusura menu mobile al click su un link
        document.querySelectorAll('#main-nav a').forEach(link => {
            link.addEventListener('click', () => {
                if (mainNav.classList.contains('active')) {
                    mainNav.classList.remove('active');
                    menuBtn.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    // Effetto scroll sull'header
    const header = document.querySelector('header');
    if (header) {
        window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            header.style.padding = '0.2rem 0';
            header.style.boxShadow = '0 10px 30px rgba(0,0,0,0.08)';
        } else {
            header.style.padding = '0.4rem 0';
            header.style.boxShadow = 'none';
        }
        });
    }

    // 2. Animazioni allo Scorrimento (Fade-in)
    const observerOptions = { threshold: 0.15 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, observerOptions);
    document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

    // 3. Gestione Caroselli (Lavori e Clienti)
    const setupCarousel = (id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper) return;
        
        const container = wrapper.querySelector('.gallery');
        const prevBtn = wrapper.querySelector('.prev');
        const nextBtn = wrapper.querySelector('.next');
        
        // Calcolo dinamico dello scroll basato sulla larghezza della prima immagine
        const getScrollAmount = () => {
            const firstImg = container.querySelector('img, video');
            return firstImg ? firstImg.offsetWidth + 20 : 400;
        };

        nextBtn.addEventListener('click', () => container.scrollBy({ left: getScrollAmount(), behavior: 'smooth' }));
        prevBtn.addEventListener('click', () => container.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' }));
    };
    setupCarousel('main-gallery');
    setupCarousel('clients-gallery');

    // 4. Ingrandimento Foto (Modal / Lightbox)
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const closeBtn = document.querySelector('.modal-close');
    const galleryImages = document.querySelectorAll('.gallery img');
    
    let currentImgIndex = 0;
    let activeImages = [];

    if (modal && modalImg) {
        const openModal = (index, imagesArray) => {
            currentImgIndex = index;
            activeImages = imagesArray;
            modalImg.src = activeImages[currentImgIndex].src;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Blocca scroll
        };

    galleryImages.forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
            const parentGallery = img.closest('.gallery');
            const siblingImages = Array.from(parentGallery.querySelectorAll('img'));
            const localIndex = siblingImages.indexOf(img);
            openModal(localIndex, siblingImages);
        });
    });

    // Chiudi modale
        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Navigazione interna alla modale
        const modalPrev = modal.querySelector('.prev');
        const modalNext = modal.querySelector('.next');

        const navigateModal = (direction) => {
            currentImgIndex = (currentImgIndex + direction + activeImages.length) % activeImages.length;
            modalImg.style.opacity = '0';
            setTimeout(() => {
                modalImg.src = activeImages[currentImgIndex].src;
                modalImg.style.opacity = '1';
            }, 200);
        };

        if (modalNext) modalNext.addEventListener('click', () => navigateModal(1));
        if (modalPrev) modalPrev.addEventListener('click', () => navigateModal(-1));

    // Supporto tastiera per la modale
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('active')) return;
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowRight') navigateModal(1);
            if (e.key === 'ArrowLeft') navigateModal(-1);
        });
    }

    // 5. Aggiornamento Automatico Anno Footer
    const yearSpan = document.getElementById('year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    // 9. Logica Visibilità Pulsante Flottante
    const floatingBtn = document.getElementById('floating-book-btn');
    const triggerSection = document.getElementById('servizi');
    const endSection = document.getElementById('dove-siamo');

    if (floatingBtn && triggerSection && endSection) {
        window.addEventListener('scroll', () => {
            const scrollPos = window.scrollY + window.innerHeight * 0.5;
            const startPos = triggerSection.offsetTop;
            const endPos = endSection.offsetTop + endSection.offsetHeight;

            if (scrollPos > startPos && window.scrollY < endPos) {
                floatingBtn.classList.add('show');
            } else {
                floatingBtn.classList.remove('show');
            }
        });
    }
});
