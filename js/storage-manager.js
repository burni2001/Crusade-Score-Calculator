/**
 * Storage Manager Module
 * Provides robust cross-platform data persistence using IndexedDB
 * with localStorage fallback for compatibility
 * 
 * IndexedDB is more reliable than localStorage in:
 * - Discord mobile (iOS/Android) due to Safari ITP restrictions
 * - Cross-origin iframe contexts
 * - Mobile browsers with aggressive cache clearing
 */

const StorageManager = (function() {
    'use strict';

    // IndexedDB configuration
    const DB_NAME = 'CrusadeScoreCalculator';
    const DB_VERSION = 1;
    const STORE_NAME = 'appData';
    
    // Database instance
    let db = null;
    let dbReady = null;
    
    // Storage keys (same as original localStorage keys)
    const STORAGE_KEYS = {
        MISSION_DATA: 'missionDebriefData',
        AGGREGATED_STATE: 'cogitator_aggregated_state',
        SAVED_MISSIONS: 'cogitator_saved_missions',
        ACTIVE_EVENT: 'cogitator_active_event',
        CUSTOM_RULES: 'cogitator_custom_rules',
        LAST_PAGE: 'cogitator_last_page',
        DATE_FORMAT: 'cogitator_date_format'
    };

    // =========================================================================
    // INDEXEDDB IMPLEMENTATION
    // =========================================================================

    /**
     * Initialize IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    function initDB() {
        if (dbReady) return dbReady;
        
        dbReady = new Promise((resolve, reject) => {
            // Check if IndexedDB is available
            if (!window.indexedDB) {
                console.warn('IndexedDB not available, using localStorage fallback');
                resolve(null);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                resolve(null); // Fall back to localStorage
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Create object store if it doesn't exist
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });

        return dbReady;
    }

    /**
     * Get a value from IndexedDB
     * @param {string} key - The storage key
     * @returns {Promise<any>}
     */
    async function getFromDB(key) {
        const database = await initDB();
        if (!database) return null;

        return new Promise((resolve, reject) => {
            try {
                const transaction = database.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };

                request.onerror = () => {
                    console.error('IndexedDB get error:', request.error);
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Store a value in IndexedDB
     * @param {string} key - The storage key
     * @param {any} value - The value to store
     * @returns {Promise<boolean>}
     */
    async function setToDB(key, value) {
        const database = await initDB();
        if (!database) return false;

        return new Promise((resolve) => {
            try {
                const transaction = database.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ key: key, value: value });

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('IndexedDB set error:', request.error);
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * Remove a value from IndexedDB
     * @param {string} key - The storage key
     * @returns {Promise<boolean>}
     */
    async function removeFromDB(key) {
        const database = await initDB();
        if (!database) return false;

        return new Promise((resolve) => {
            try {
                const transaction = database.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(key);

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = () => {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    }

    // =========================================================================
    // LOCALSTORAGE FALLBACK
    // =========================================================================

    /**
     * Get a value from localStorage (fallback)
     * @param {string} key - The storage key
     * @returns {string|null}
     */
    function getFromLocalStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage get error:', e);
            return null;
        }
    }

    /**
     * Store a value in localStorage (fallback)
     * @param {string} key - The storage key
     * @param {string} value - The value to store
     * @returns {boolean}
     */
    function setToLocalStorage(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.warn('localStorage set error:', e);
            return false;
        }
    }

    /**
     * Remove a value from localStorage (fallback)
     * @param {string} key - The storage key
     * @returns {boolean}
     */
    function removeFromLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    // =========================================================================
    // UNIFIED STORAGE API (Primary Interface)
    // =========================================================================

    /**
     * Get a value from storage (tries IndexedDB first, falls back to localStorage)
     * @param {string} key - The storage key
     * @returns {Promise<any>}
     */
    async function get(key) {
        // Try IndexedDB first
        const dbValue = await getFromDB(key);
        if (dbValue !== null) {
            return dbValue;
        }
        
        // Fall back to localStorage
        const lsValue = getFromLocalStorage(key);
        if (lsValue !== null) {
            // Sync to IndexedDB for future use
            setToDB(key, lsValue);
            return lsValue;
        }
        
        return null;
    }

    /**
     * Set a value in storage (tries IndexedDB first, falls back to localStorage)
     * @param {string} key - The storage key
     * @param {any} value - The value to store
     * @returns {Promise<boolean>}
     */
    async function set(key, value) {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        // Try IndexedDB first
        const dbSuccess = await setToDB(key, stringValue);
        
        // Always also save to localStorage as backup
        const lsSuccess = setToLocalStorage(key, stringValue);
        
        return dbSuccess || lsSuccess;
    }

    /**
     * Remove a value from storage
     * @param {string} key - The storage key
     * @returns {Promise<boolean>}
     */
    async function remove(key) {
        await removeFromDB(key);
        removeFromLocalStorage(key);
        return true;
    }

    // =========================================================================
    // COMPATIBILITY LAYER (Backward Compatibility Functions)
    // =========================================================================

    /**
     * Save all app data - handles all storage keys
     * @param {Object} data - Object with keys: missionData, aggregatedState, savedMissions, activeEvent, lastPage
     * @returns {Promise<boolean>}
     */
    async function saveAll(data) {
        const results = [];
        
        if (data.missionData) {
            results.push(set(STORAGE_KEYS.MISSION_DATA, data.missionData));
        }
        if (data.aggregatedState) {
            results.push(set(STORAGE_KEYS.AGGREGATED_STATE, data.aggregatedState));
        }
        if (data.savedMissions) {
            results.push(set(STORAGE_KEYS.SAVED_MISSIONS, data.savedMissions));
        }
        if (data.activeEvent) {
            results.push(set(STORAGE_KEYS.ACTIVE_EVENT, data.activeEvent));
        }
        if (data.lastPage !== undefined) {
            results.push(set(STORAGE_KEYS.LAST_PAGE, String(data.lastPage)));
        }
        if (data.dateFormat) {
            results.push(set(STORAGE_KEYS.DATE_FORMAT, data.dateFormat));
        }
        
        const outcomes = await Promise.all(results);
        return outcomes.every(r => r);
    }

    /**
     * Load all app data
     * @returns {Promise<Object>}
     */
    async function loadAll() {
        const [missionData, aggregatedState, savedMissions, activeEvent, lastPage, dateFormat] = await Promise.all([
            get(STORAGE_KEYS.MISSION_DATA),
            get(STORAGE_KEYS.AGGREGATED_STATE),
            get(STORAGE_KEYS.SAVED_MISSIONS),
            get(STORAGE_KEYS.ACTIVE_EVENT),
            get(STORAGE_KEYS.LAST_PAGE),
            get(STORAGE_KEYS.DATE_FORMAT)
        ]);

        return {
            missionData,
            aggregatedState,
            savedMissions,
            activeEvent,
            lastPage: lastPage ? parseInt(lastPage, 10) : null,
            dateFormat
        };
    }

    /**
     * Clear all stored data
     * @returns {Promise<boolean>}
     */
    async function clearAll() {
        const keys = Object.values(STORAGE_KEYS);
        await Promise.all(keys.map(key => remove(key)));
        return true;
    }

    /**
     * Check if running in a restricted environment (mobile Discord iframe)
     * @returns {boolean}
     */
    function isRestrictedEnvironment() {
        try {
            // Check if we're in an iframe (Discord Activity)
            const inIframe = window.self !== window.top;
            
            // Check for Discord environment
            const params = new URLSearchParams(window.location.search);
            const isDiscordActivity = params.has('frame_id') && params.has('instance_id');
            
            // Check for mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            return inIframe && isDiscordActivity && isMobile;
        } catch (e) {
            return false;
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    // Initialize database on module load
    initDB();

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        // Core storage methods
        get,
        set,
        remove,
        
        // Compatibility layer
        saveAll,
        loadAll,
        clearAll,
        
        // Utility
        isRestrictedEnvironment,
        STORAGE_KEYS,
        
        // Initialize (ready promise)
        ready: initDB
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager };
}

// Browser global
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
    console.log('💾 Storage Manager module loaded (IndexedDB + localStorage)');
}
