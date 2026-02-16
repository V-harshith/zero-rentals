"use client"

import { useState, useEffect, useRef, useCallback, useId } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MapPin, X, Loader2, Navigation } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { loadGoogleMapsAPI } from "@/lib/google-maps-loader"
import { cn } from "@/lib/utils"

interface PlaceSuggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

interface PlaceDetails {
  pincode: string | null
  city: string | null
  state: string | null
  country: string | null
  formattedAddress: string
  latitude: number
  longitude: number
}

interface GooglePlacesInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onPlaceSelect?: (details: PlaceDetails) => void
  placeholder?: string
  required?: boolean
  types?: string[]
  countryRestriction?: string
  isActive?: boolean
  onActivate?: () => void
  disabled?: boolean
  className?: string
}

// Global state to track which input is currently active
let activeInputId: string | null = null
const listeners = new Set<(id: string | null) => void>()

function setActiveInput(id: string | null) {
  activeInputId = id
  listeners.forEach(listener => listener(id))
}

export function GooglePlacesInput({
  id,
  label,
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing to search...",
  required = false,
  types = ['(cities)'],
  countryRestriction = 'in',
  isActive,
  onActivate,
  disabled = false,
  className
}: GooglePlacesInputProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [hasSelected, setHasSelected] = useState(false)
  const [isFetchingDetails, setIsFetchingDetails] = useState(false)

  const componentId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUserInteractingRef = useRef(false)

  // Initialize Google Maps
  useEffect(() => {
    let isMounted = true

    const initGoogle = async () => {
      try {
        const maps = await loadGoogleMapsAPI()
        if (isMounted && maps.places) {
          autocompleteServiceRef.current = new maps.places.AutocompleteService()
          // Create a dummy div for PlacesService (required by Google Maps API)
          const dummyDiv = document.createElement('div')
          placesServiceRef.current = new maps.places.PlacesService(dummyDiv)
          sessionTokenRef.current = new maps.places.AutocompleteSessionToken()
          setIsGoogleLoaded(true)
        }
      } catch (error) {
        console.error('Failed to load Google Maps:', error)
      }
    }

    initGoogle()
    return () => { isMounted = false }
  }, [])

  // Listen to global active input changes
  useEffect(() => {
    const handleActiveChange = (activeId: string | null) => {
      if (activeId !== componentId && showSuggestions) {
        // Another input became active, close our suggestions
        setShowSuggestions(false)
        setHighlightedIndex(-1)
      }
    }

    listeners.add(handleActiveChange)
    return () => { listeners.delete(handleActiveChange) }
  }, [componentId, showSuggestions])

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (input: string) => {
    if (!autocompleteServiceRef.current || !input.trim() || input.length < 2) {
      setSuggestions([])
      return
    }

    setIsLoading(true)
    try {
      const response = await new Promise<google.maps.places.AutocompletePrediction[]>((resolve, reject) => {
        autocompleteServiceRef.current!.getPlacePredictions(
          {
            input,
            types,
            componentRestrictions: { country: countryRestriction },
            sessionToken: sessionTokenRef.current || undefined
          },
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              resolve(results)
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              resolve([])
            } else {
              reject(status)
            }
          }
        )
      })

      const mappedSuggestions: PlaceSuggestion[] = response.map(prediction => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting.main_text,
        secondaryText: prediction.structured_formatting.secondary_text || ''
      }))

      // Only update if user is still interacting
      if (isUserInteractingRef.current) {
        setSuggestions(mappedSuggestions)
        setShowSuggestions(mappedSuggestions.length > 0)
        setHighlightedIndex(-1)
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [types, countryRestriction])

  // Debounced fetch
  useEffect(() => {
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    // Reset hasSelected when value changes (user is typing)
    if (value && !hasSelected) {
      fetchTimeoutRef.current = setTimeout(() => {
        if (isUserInteractingRef.current) {
          fetchSuggestions(value)
        }
      }, 200) // Faster debounce for responsiveness
    } else if (!value) {
      setSuggestions([])
      setShowSuggestions(false)
    }

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
    }
  }, [value, fetchSuggestions, hasSelected])

  // Fetch place details including pincode
  const fetchPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    if (!placesServiceRef.current) return null

    setIsFetchingDetails(true)
    try {
      const result = await new Promise<google.maps.places.PlaceResult | null>((resolve, reject) => {
        placesServiceRef.current!.getDetails(
          {
            placeId,
            fields: ['address_components', 'formatted_address', 'geometry'],
            sessionToken: sessionTokenRef.current || undefined
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place)
            } else {
              reject(status)
            }
          }
        )
      })

      if (!result) return null

      // Extract address components
      let pincode: string | null = null
      let city: string | null = null
      let state: string | null = null
      let country: string | null = null

      result.address_components?.forEach(component => {
        const types = component.types
        if (types.includes('postal_code')) {
          pincode = component.long_name
        }
        if (types.includes('locality') || types.includes('administrative_area_level_2')) {
          city = component.long_name
        }
        if (types.includes('administrative_area_level_1')) {
          state = component.long_name
        }
        if (types.includes('country')) {
          country = component.long_name
        }
      })

      return {
        pincode,
        city,
        state,
        country,
        formattedAddress: result.formatted_address || '',
        latitude: result.geometry?.location?.lat() || 0,
        longitude: result.geometry?.location?.lng() || 0
      }
    } catch (error) {
      console.error('Error fetching place details:', error)
      return null
    } finally {
      setIsFetchingDetails(false)
    }
  }, [])

  // Handle selection
  const handleSelect = useCallback(async (suggestion: PlaceSuggestion, index: number) => {
    isUserInteractingRef.current = false
    setHasSelected(true)
    setHighlightedIndex(index)

    // Immediately close suggestions and update input
    setShowSuggestions(false)
    onChange(suggestion.mainText)

    // Fetch place details for pincode and other data
    if (onPlaceSelect) {
      const details = await fetchPlaceDetails(suggestion.placeId)
      if (details) {
        onPlaceSelect(details)
      }
    }

    // Generate new session token after selection
    if (window.google?.maps?.places) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }

    // Keep focus on input for smooth UX
    inputRef.current?.focus()
  }, [onChange, onPlaceSelect, fetchPlaceDetails])

  // Handle input focus
  const handleFocus = useCallback(() => {
    isUserInteractingRef.current = true
    setActiveInput(componentId)
    onActivate?.()

    // Only show suggestions if we have them and user hasn't just selected
    if (suggestions.length > 0 && value && value.length >= 2 && !hasSelected) {
      setShowSuggestions(true)
    }
  }, [componentId, onActivate, suggestions.length, value, hasSelected])

  // Handle input blur - only close if not clicking on suggestions
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if the related target is within our container
    const relatedTarget = e.relatedTarget as Node
    if (containerRef.current?.contains(relatedTarget)) {
      return // Don't close, user clicked on suggestion
    }

    isUserInteractingRef.current = false
    setShowSuggestions(false)
    setHighlightedIndex(-1)

    if (activeInputId === componentId) {
      setActiveInput(null)
    }
  }, [componentId])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      // Allow escape to clear even if no suggestions
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        inputRef.current?.blur()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0) {
          handleSelect(suggestions[highlightedIndex], highlightedIndex)
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setHighlightedIndex(-1)
        inputRef.current?.blur()
        break
      case 'Tab':
        // Close suggestions on tab out
        setShowSuggestions(false)
        setHighlightedIndex(-1)
        break
    }
  }, [showSuggestions, suggestions, highlightedIndex, handleSelect])

  // Clear input
  const handleClear = useCallback(() => {
    setHasSelected(false)
    setSuggestions([])
    setShowSuggestions(false)
    setHighlightedIndex(-1)
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setHasSelected(false)
    onChange(newValue)

    // Show suggestions immediately if we have them
    if (newValue.length >= 2 && suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }, [onChange, suggestions.length])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
      if (activeInputId === componentId) {
        setActiveInput(null)
      }
    }
  }, [componentId])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionsRef.current) {
      const highlightedElement = suggestionsRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [highlightedIndex])

  return (
    <div ref={containerRef} className={cn("space-y-2 relative", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          {isFetchingDetails ? (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          ) : (
            <MapPin className={cn(
              "h-4 w-4 transition-colors",
              isActive || showSuggestions ? "text-blue-500" : "text-gray-400"
            )} />
          )}
        </div>

        <Input
          id={id}
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isFetchingDetails}
          className={cn(
            "pl-10 pr-10 transition-all",
            showSuggestions && "ring-2 ring-blue-500 border-blue-500",
            hasSelected && "border-green-500 focus:border-green-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={showSuggestions ? `${id}-suggestions` : undefined}
          aria-expanded={showSuggestions}
          aria-activedescendant={highlightedIndex >= 0 ? `${id}-suggestion-${highlightedIndex}` : undefined}
          role="combobox"
        />

        {/* Clear button */}
        {value && !isLoading && !isFetchingDetails && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
            tabIndex={-1}
            aria-label="Clear input"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Loading indicator */}
        {(isLoading || isFetchingDetails) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              ref={suggestionsRef}
              id={`${id}-suggestions`}
              role="listbox"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] max-h-72 overflow-y-auto"
              style={{
                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)'
              }}
            >
              {/* Header */}
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                <Navigation className="h-3 w-3" />
                <span>Select a location</span>
                <span className="ml-auto">
                  {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}
                </span>
              </div>

              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.placeId}
                  id={`${id}-suggestion-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onClick={() => handleSelect(suggestion, index)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "w-full px-4 py-3 text-left border-b last:border-0 transition-all duration-150",
                    index === highlightedIndex
                      ? "bg-blue-50 border-blue-100"
                      : "hover:bg-gray-50 border-gray-100"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0 transition-colors",
                      index === highlightedIndex ? "text-blue-500" : "text-gray-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-medium truncate transition-colors",
                        index === highlightedIndex ? "text-blue-900" : "text-gray-900"
                      )}>
                        {suggestion.mainText}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {suggestion.secondaryText}
                      </div>
                    </div>
                    {index === highlightedIndex && (
                      <span className="text-xs text-blue-500 font-medium">
                        Press Enter
                      </span>
                    )}
                  </div>
                </button>
              ))}

              {/* Footer with Google attribution */}
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                <span>Powered by Google</span>
                <span className="text-gray-300">
                  Use ↑↓ to navigate, Enter to select
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No results state */}
        <AnimatePresence>
          {showSuggestions && suggestions.length === 0 && value.length >= 2 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] p-4 text-center"
            >
              <MapPin className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No locations found</p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading state */}
      {!isGoogleLoaded && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading location search...</span>
        </div>
      )}

      {/* Helper text */}
      {isGoogleLoaded && !value && (
        <p className="text-xs text-gray-400">
          Start typing to search for locations
        </p>
      )}
    </div>
  )
}

export type { PlaceDetails }
