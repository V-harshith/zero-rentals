"use client"

import { FileSpreadsheet, Images, Eye, CheckCircle } from "lucide-react"

type ImportStep = "excel" | "images" | "review" | "results"

interface StepIndicatorProps {
    currentStep: ImportStep
    completedSteps: Set<ImportStep>
}

const steps: { id: ImportStep; label: string; icon: typeof FileSpreadsheet }[] = [
    { id: "excel", label: "Excel", icon: FileSpreadsheet },
    { id: "images", label: "Images", icon: Images },
    { id: "review", label: "Review", icon: Eye },
    { id: "results", label: "Results", icon: CheckCircle },
]

export function StepIndicator({ currentStep, completedSteps }: StepIndicatorProps) {
    const currentIndex = steps.findIndex((s) => s.id === currentStep)

    return (
        <div className="relative">
            {/* Progress Bar Background */}
            <div className="absolute top-5 left-0 right-0 h-1 bg-muted -translate-y-1/2" />

            {/* Active Progress Bar */}
            <div
                className="absolute top-5 left-0 h-1 bg-primary -translate-y-1/2 transition-all duration-300"
                style={{
                    width: `${(currentIndex / (steps.length - 1)) * 100}%`,
                }}
            />

            {/* Steps */}
            <div className="relative flex justify-between">
                {steps.map((step, index) => {
                    const isCompleted = completedSteps.has(step.id)
                    const isCurrent = currentStep === step.id
                    const isPending = index > currentIndex

                    return (
                        <div key={step.id} className="flex flex-col items-center">
                            {/* Icon Circle */}
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
                            >
                                <step.icon className="h-5 w-5" />
                            </div>

                            {/* Label */}
                            <span
                                className={`
                                    mt-2 text-sm font-medium
                                    ${isCurrent || isCompleted ? "text-primary" : "text-muted-foreground"}
                                `}
                            >
                                {step.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
