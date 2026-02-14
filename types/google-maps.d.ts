declare global {
    interface Window {
        google: typeof google
    }
}

declare namespace google {
    namespace maps {
        class LatLng {
            constructor(lat: number, lng: number)
            lat(): number
            lng(): number
        }

        namespace places {
            class AutocompleteService {
                getPlacePredictions(
                    request: AutocompletionRequest,
                    callback: (
                        predictions: AutocompletePrediction[] | null,
                        status: PlacesServiceStatus
                    ) => void
                ): void
            }

            class AutocompleteSessionToken {
                constructor()
            }

            interface AutocompletionRequest {
                input: string
                componentRestrictions?: ComponentRestrictions
                types?: string[]
                sessionToken?: AutocompleteSessionToken
            }

            interface ComponentRestrictions {
                country: string | string[]
            }

            interface AutocompletePrediction {
                place_id: string
                description: string
                structured_formatting: {
                    main_text: string
                    secondary_text?: string
                }
            }

            enum PlacesServiceStatus {
                OK = 'OK',
                ZERO_RESULTS = 'ZERO_RESULTS',
                INVALID_REQUEST = 'INVALID_REQUEST',
                OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
                REQUEST_DENIED = 'REQUEST_DENIED',
                UNKNOWN_ERROR = 'UNKNOWN_ERROR'
            }
        }
    }
}

export { }
