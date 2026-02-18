"use client"

import { FileSpreadsheet, Images, Eye, CheckCircle } from "lucide-react"

type ImportStep = "excel" | "images" | "review" | "results"

interface StepIndicatorProps {
    currentStep: ImportStep
    completedSteps: Set<ImportStep>
    onStepClick?: (step: ImportStep) => void
}

const steps: { id: ImportStep; label: string; icon: typeof FileSpreadsheet }[] = [
    { id: "excel", label: "Excel", icon: FileSpreadsheet },
    { id: "images", label: "Images", icon: Images },
    { id: "review", label: "Review", icon: Eye },
    { id: "results", label: "Results", icon: CheckCircle },
]

export function StepIndicator({ currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
    const currentIndex = steps.findIndex((s) => s.id === currentStep)
    const progressPercent = (currentIndex / (steps.length - 1)) * 100

    return (
        <nav
            className="relative"
            role="navigation"
            aria-label="Import progress"
        >
            {/* Progress Bar Background */}
            <div
                className="absolute top-5 left-0 right-0 h-1 bg-muted -translate-y-1/2"
                aria-hidden="true"
            />

            {/* Active Progress Bar */}
            <div
                className="absolute top-5 left-0 h-1 bg-primary -translate-y-1/2 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
                aria-hidden="true"
            />

            {/* Steps */}
            <ol
                className="relative flex justify-between list-none m-0 p-0"
                role="list"
                aria-label="Import steps"
            >
                {steps.map((step, index) => {
                    const isCompleted = completedSteps.has(step.id)
                    const isCurrent = currentStep === step.id
                    const isPending = index > currentIndex
                    const isClickable = isCompleted && onStepClick && !isCurrent

                    const stepLabel = `${step.label} ${isCompleted ? "(completed)" : isCurrent ? "(current)" : "(pending)"}`

                    return (
                        <li
                            key={step.id}
                            className="flex flex-col items-center"
                            role="listitem"
                            aria-current={isCurrent ? "step" : undefined}
                        >
                            {/* Icon Circle - button for completed steps, div for others */}
                            {isClickable ? (
                                <button
                                    type="button"
                                    onClick={() => onStepClick(step.id)}
                                    className="
                                        w-10 h-10 rounded-full flex items-center justify-center border-2
                                        transition-all duration-300 z-10 bg-background
                                        border-primary bg-primary text-primary-foreground
                                        cursor-pointer hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                                    "
                                    aria-label={`Go to ${stepLabel}`}
                                >
                                    <step.icon className="h-5 w-5" aria-hidden="true" />
                                </button>
                            ) : (
                                <div
                                    className={`
                                        w-10 h-10 rounded-full flex items-center justify-center border-2
                                        transition-all duration-300 z-10 bg-background
                                        ${isCurrent
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : isCompleted
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-muted bg-muted text-muted-foreground"
                                        }
                                    `}
                                    aria-label={stepLabel}
                                >
                                    <step.icon className="h-5 w-5" aria-hidden="true" />
                                </div>
                            )}

                            {/* Label */}
                            <span
                                className={`
                                    mt-2 text-xs sm:text-sm font-medium
                                    ${isCurrent || isCompleted ? "text-primary" : "text-muted-foreground"}
                                `}
                            >
                                {step.label}
                            </span>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
