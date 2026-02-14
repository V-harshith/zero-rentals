import { useState, useEffect } from 'react';

// Extend Window interface for google maps
declare global {
    interface Window {
        initGoogleMapsPromise?: Promise<typeof google.maps>;
    }
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const LIBRARIES: ("places" | "marker")[] = ['places', 'marker'];

/**
 * Singleton loader for Google Maps API
 * Prevents multiple script injections and handles loading states
 */
export function loadGoogleMapsAPI(): Promise<typeof google.maps> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Google Maps cannot be loaded on the server'));
    }

    // If already loaded, return existing instance
    if (window.google?.maps) {
        return Promise.resolve(window.google.maps);
    }

    // If currently loading, return the existing promise
    if (window.initGoogleMapsPromise) {
        return window.initGoogleMapsPromise;
    }

    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'AIzaSy_your_google_maps_api_key_here') {
        return Promise.reject(new Error('Google Maps API key not configured'));
    }

    // Create new loading promise
    window.initGoogleMapsPromise = new Promise((resolve, reject) => {
        // Check one more time in case of race condition
        if (window.google?.maps) {
            resolve(window.google.maps);
            return;
        }

        try {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=${LIBRARIES.join(',')}&loading=async&callback=Function.prototype`;
            script.async = true;
            script.defer = true;
            script.id = 'google-maps-script';

            script.onload = () => {
                // Poll for google.maps availability
                const checkInterval = setInterval(() => {
                    if (window.google?.maps) {
                        clearInterval(checkInterval);
                        resolve(window.google.maps);
                    }
                }, 100);

                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (!window.google?.maps) {
                        reject(new Error('Google Maps API loaded but google.maps object not found'));
                    }
                }, 10000);
            };

            script.onerror = (error) => {
                reject(new Error(`Failed to load Google Maps script: ${error}`));
            };

            document.head.appendChild(script);
        } catch (err) {
            reject(err);
        }
    });

    return window.initGoogleMapsPromise;
}

/**
 * Hook to use Google Maps in React components
 */
export function useGoogleMaps() {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;

        loadGoogleMapsAPI()
            .then(() => {
                if (isMounted) setIsLoaded(true);
            })
            .catch((err) => {
                if (isMounted) setLoadError(err);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return { isLoaded, loadError };
}
