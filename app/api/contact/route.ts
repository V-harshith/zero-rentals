import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

export async function POST(request: NextRequest) {
    try {
        // Initialize Resend client inside handler to avoid build-time errors
        const resendApiKey = process.env.RESEND_API_KEY
        if (!resendApiKey) {
            console.error('RESEND_API_KEY not configured')
            return NextResponse.json(
                { error: "Email service not configured" },
                { status: 500 }
            )
        }
        const resend = new Resend(resendApiKey)

        const body = await request.json()
        const { name, email, phone, subject, message } = body

        // Validation
        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            )
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Invalid email address" },
                { status: 400 }
            )
        }

        // Send email using Resend
        const data = await resend.emails.send({
            from: "ZeroRentals Contact <onboarding@resend.dev>", // Use your verified domain
            to: ["your-email@example.com"], // Replace with your email
            replyTo: email,
            subject: `Contact Form: ${subject}`,
            html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      `,
        })

        return NextResponse.json(
            { success: true, messageId: (data as { id?: string })?.id || 'unknown' },
            { status: 200 }
        )
    } catch (error) {
        console.error("Contact form error:", error)
        return NextResponse.json(
            { error: "Failed to send message" },
            { status: 500 }
        )
    }
}
