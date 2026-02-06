// js/event-handlers.js
// This module will contain all event listener setup logic.

import { navigateToPage, toggleEventMenu, toggleCustomRules, calculate, saveData, checkCustomModifiers, handleMissionSelect, updateAdditionalStatsHeaders, saveMissionInternal, clearData, aggregateInternalData, openCopyModal, recordAllDataScreens, resetImport, toggleCreditsModal, closeCreditsOnBackdrop, applyOCRResults, exportOCRDebug, closeOCRModal, copySummaryText, downloadTransmissionLog, openSlotOverlay, deleteSlot, selectEvent, closeSlotModal } from './script.js';

// Function to attach all event listeners
export function setupEventListeners() {
    // Event delegation for page navigation
    document.body.addEventListener('click', (event) => {
        const targetButton = event.target.closest('[data-action="navigate-page"]');
        if (targetButton) {
            const pageNumber = parseInt(targetButton.dataset.targetPage);
            if (!isNaN(pageNumber)) {
                navigateToPage(pageNumber);
            }
        }
    });

    // Event Selector
    document.querySelector('button[onclick="toggleEventMenu()"]')
        ?.addEventListener('click', toggleEventMenu);
    document.querySelector('span[onclick="toggleEventMenu()"]')
        ?.addEventListener('click', toggleEventMenu);

    // Custom Rules
    document.querySelector('div[onclick="toggleCustomRules()"]')
        ?.addEventListener('click', toggleCustomRules);

    // Modifier Inputs (using event delegation for efficiency)
    document.getElementById('custom-rules-content')?.addEventListener('change', (event) => {
        if (event.target.tagName === 'INPUT' && event.target.id.startsWith('mod-')) {
            calculate();
            saveData();
            checkCustomModifiers();
        }
    });

    // Mission Parameters
    document.getElementById('mission-name')?.addEventListener('change', () => {
        handleMissionSelect();
        saveData();
    });
    document.getElementById('mission-name-custom')?.addEventListener('change', saveData);
    document.getElementById('mission-difficulty')?.addEventListener('change', () => {
        calculate();
        saveData();
    });
    document.getElementById('global-objective')?.addEventListener('change', () => {
        calculate();
        saveData();
    });
    document.getElementById('global-geneseed')?.addEventListener('change', () => {
        calculate();
        saveData();
    });
    document.getElementById('global-armoury')?.addEventListener('change', () => {
        calculate();
        saveData();
    });
    document.getElementById('global-waves')?.addEventListener('change', () => {
        calculate();
        saveData();
    });

    // Player Name Inputs
    ['p1-name', 'p2-name', 'p3-name'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            saveData();
            updateAdditionalStatsHeaders();
        });
        document.getElementById(id)?.addEventListener('input', updateAdditionalStatsHeaders);
    });

    // Player Class Selects
    ['p1-class', 'p2-class', 'p3-class'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', saveData);
    });

    // Player Stat Inputs (using event delegation for efficiency)
    const scoreTableBody = document.querySelector('.score-table tbody');
    scoreTableBody?.addEventListener('change', (event) => {
        if (event.target.tagName === 'INPUT' && (event.target.id.startsWith('p1-') || event.target.id.startsWith('p2-') || event.target.id.startsWith('p3-'))) {
            calculate();
            saveData();
        }
    });

    // Action Buttons
    document.querySelector('button[onclick="saveMissionInternal()"]')
        ?.addEventListener('click', saveMissionInternal);
    document.querySelector('button[onclick="clearData()"]')
        ?.addEventListener('click', clearData);
    document.querySelector('button[onclick="aggregateInternalData()"]')
        ?.addEventListener('click', aggregateInternalData);
    document.querySelector('button[onclick="openCopyModal()"]')
        ?.addEventListener('click', openCopyModal);
    document.querySelector('button[onclick="recordAllDataScreens()"]')
        ?.addEventListener('click', recordAllDataScreens);
    document.querySelector('button[onclick="resetImport()"]')
        ?.addEventListener('click', resetImport);

    // Modals
    document.querySelector('button[onclick="toggleCreditsModal()"]')
        ?.addEventListener('click', toggleCreditsModal);
    document.getElementById('credits-modal')?.addEventListener('click', closeCreditsOnBackdrop);
    document.querySelector('#credits-modal .btn-danger[onclick="toggleCreditsModal()"]')
        ?.addEventListener('click', toggleCreditsModal);
    document.querySelector('button[onclick="applyOCRResults()"]')
        ?.addEventListener('click', applyOCRResults);
    document.querySelector('button[onclick="exportOCRDebug()"]')
        ?.addEventListener('click', exportOCRDebug);
    document.querySelector('button[onclick="closeOCRModal()"]')
        ?.addEventListener('click', closeOCRModal);
    document.querySelector('button[onclick="copySummaryText()"]')
        ?.addEventListener('click', copySummaryText);
    document.querySelector('button[onclick="downloadTransmissionLog()"]')
        ?.addEventListener('click', downloadTransmissionLog);
    document.querySelector('button[onclick="document.getElementById('copy-modal').classList.remove('active')"]')
        ?.addEventListener('click', () => document.getElementById('copy-modal').classList.remove('active'));

    // Dynamic Data Bank Slots (delegation)
    document.getElementById('data-bank-ui')?.addEventListener('click', (event) => {
        const slotEl = event.target.closest('.data-slot.occupied');
        if (slotEl && !event.target.classList.contains('delete-slot-btn')) {
            const index = parseInt(slotEl.dataset.slotIndex);
            if (!isNaN(index)) {
                openSlotOverlay(index);
            }
        }
    });
    document.getElementById('data-bank-ui')?.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-slot-btn')) {
            const slotEl = event.target.closest('.data-slot.occupied');
            const index = parseInt(event.target.dataset.slotIndex);
            if (!isNaN(index)) {
                deleteSlot(index);
            }
        }
    });
    document.getElementById('data-bank-ui-page3')?.addEventListener('click', (event) => {
        const slotEl = event.target.closest('.data-slot.occupied');
        if (slotEl && !event.target.classList.contains('delete-slot-btn')) {
            const index = parseInt(slotEl.dataset.slotIndex);
            if (!isNaN(index)) {
                openSlotOverlay(index);
            }
        }
    });
    document.getElementById('data-bank-ui-page3')?.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-slot-btn')) {
            const slotEl = event.target.closest('.data-slot.occupied');
            const index = parseInt(event.target.dataset.slotIndex);
            if (!isNaN(index)) {
                deleteSlot(index);
            }
        }
    });

    // Dynamic Event Items (delegation)
    document.getElementById('event-list-container')?.addEventListener('click', (event) => {
        const eventItem = event.target.closest('.event-item');
        if (eventItem) {
            const eventId = eventItem.dataset.eventId;
            if (eventId) {
                selectEvent(eventId);
            }
        }
    });
    
    // Listeners for dynamically created modal buttons (delegation on document.body)
    document.body.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('[data-action="download-slot-csv"]')) {
            const index = parseInt(target.dataset.slotIndex);
            if (!isNaN(index)) {
                downloadSlotCSV(index);
            }
        } else if (target.matches('[data-action="close-slot-modal"]')) {
            closeSlotModal();
        }
    });

    // Initial setup for dynamic elements that might already exist
    // Event delegation for cycle headers
    document.getElementById('event-menu')?.addEventListener('click', (event) => {
        const header = event.target.closest('.cycle-header.collapsible');
        if (header) {
            const eventsContainer = header.nextElementSibling;
            const indicator = header.querySelector('.collapse-indicator');
            if (eventsContainer && indicator) {
                eventsContainer.classList.toggle('expanded');
                indicator.classList.toggle('expanded');
                indicator.innerHTML = indicator.classList.contains('expanded') ? '&#9660;' : '&#9664;';
            }
        }
    });

    console.log('✅ All event listeners set up.');
}

// Ensure DOM is fully loaded before setting up listeners
// This will be called from script.js after DOMContentLoaded
// Or if script.js becomes an actual module, then from a main app.js
