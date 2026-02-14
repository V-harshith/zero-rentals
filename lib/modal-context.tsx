"use client"

import { createContext, useContext, useState, ReactNode } from 'react'

type ModalType = 'login' | 'location' | null

interface ModalContextType {
    activeModal: ModalType
    showLoginModal: () => void
    showLocationModal: () => void
    closeModal: () => void
    canShowModal: (type: ModalType) => boolean
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export function ModalProvider({ children }: { children: ReactNode }) {
    const [activeModal, setActiveModal] = useState<ModalType>(null)
    const [modalQueue, setModalQueue] = useState<ModalType[]>([])

    const showLoginModal = () => {
        // Login modal has highest priority - show immediately
        setActiveModal('login')
    }

    const showLocationModal = () => {
        // Location modal has lowest priority - only show if nothing else active
        if (!activeModal) {
            setActiveModal('location')
        }
    }

    const closeModal = () => {
        setActiveModal(null)
        // Show next queued modal if any
        if (modalQueue.length > 0) {
            setActiveModal(modalQueue[0])
            setModalQueue(modalQueue.slice(1))
        }
    }

    const canShowModal = (type: ModalType) => {
        return activeModal === null || activeModal === type
    }

    return (
        <ModalContext.Provider value={{
            activeModal,
            showLoginModal,
            showLocationModal,
            closeModal,
            canShowModal
        }}>
            {children}
        </ModalContext.Provider>
    )
}

export function useModal() {
    const context = useContext(ModalContext)
    if (!context) throw new Error('useModal must be used within ModalProvider')
    return context
}
