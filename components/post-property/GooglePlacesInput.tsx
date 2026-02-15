"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MapPin, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { loadGoogleMapsAPI } from "@/lib/google-maps-loader"

interface PlaceSuggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

interface GooglePlacesInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  types?: string[]
  countryRestriction?: string
  onFocus?: () => void
}

export function GooglePlacesInput({
  id,
  label,
  value,
  onChange,
  placeholder = "Start typing to search...",
  required = false,
  types = ['(cities)'],
  countryRestriction = 'in',
  onFocus: onFocusProp
}: GooglePlacesInputProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  // Initialize Google Maps
  useEffect(() => {
    let isMounted = true

    const initGoogle = async () => {
      try {
        const maps = await loadGoogleMapsAPI()
        if (isMounted && maps.places) {
          autocompleteServiceRef.current = new maps.places.AutocompleteService()
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

  // Fetch suggestions
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

      setSuggestions(mappedSuggestions)
      setShowSuggestions(true)
    } catch (error) {
      console.error('Error fetching suggestions:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [types, countryRestriction])

  // Debounced fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value && value.length >= 2) {
        fetchSuggestions(value)
      } else {
        setSuggestions([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [value, fetchSuggestions])

  // Handle selection - close suggestions immediately
  const handleSelect = useCallback((suggestion: PlaceSuggestion) => {
    onChange(suggestion.mainText)
    setShowSuggestions(false)
    setSuggestions([])
    // Clear any pending blur timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    // Generate new session token after selection
    if (window.google?.maps?.places) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }
  }, [onChange])

  // Handle input focus - show suggestions if we have them, and notify parent
  const handleFocus = useCallback(() => {
    // Notify parent that this input is focused (for closing other dropdowns)
    onFocusProp?.()
    // Show suggestions if user has typed something and we have results
    if (value && value.length >= 2 && suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }, [onFocusProp, value, suggestions.length])

  // Handle input blur - hide suggestions after a short delay to allow click selection
  const handleBlur = useCallback(() => {
    // Small delay to allow click events on suggestions to fire first
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false)
    }, 150)
  }, [])

  // Clear input
  const handleClear = useCallback(() => {
    onChange('')
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }, [onChange])

  // Close suggestions programmatically (used by parent)
  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false)
  }, [])

  // Expose closeSuggestions via a ref or window event
  useEffect(() => {
    const handleCloseAllSuggestions = (event: CustomEvent) => {
      // Close if the event is not from this component
      if (event.detail?.componentId !== id) {
        closeSuggestions()
      }
    }

    window.addEventListener('closeGooglePlacesSuggestions' as any, handleCloseAllSuggestions)
    return () => {
      window.removeEventListener('closeGooglePlacesSuggestions' as any, handleCloseAllSuggestions)
    }
  }, [id, closeSuggestions])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pl-10 pr-10"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              ref={suggestionsRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.placeId}
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent default to keep focus on input until click completes
                    e.preventDefault()
                    handleSelect(suggestion)
                  }}
                  className="w-full px-4 py-3 text-left border-b last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {suggestion.mainText}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {suggestion.secondaryText}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!isGoogleLoaded && (
        <p className="text-xs text-amber-600">
          Google Maps is loading... If suggestions don&apos;t appear, please refresh the page.
        </p>
      )}
    </div>
  )
}
