export default function TermsPage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="bg-primary text-primary-foreground py-16">
                <div className="container mx-auto px-4">
                    <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
                    <p className="text-primary-foreground/80">Last updated: January 10, 2026</p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <div className="prose prose-lg max-w-none">
                    <h2>1. Acceptance of Terms</h2>
                    <p>
                        By accessing and using ZeroRentals, you accept and agree to be bound by the terms and provision of this agreement.
                    </p>

                    <h2>2. Use License</h2>
                    <p>
                        Permission is granted to temporarily access the materials (information or software) on ZeroRentals for personal,
                        non-commercial transitory viewing only.
                    </p>

                    <h2>3. User Accounts</h2>
                    <p>
                        When you create an account with us, you must provide information that is accurate, complete, and current at all times.
                        Failure to do so constitutes a breach of the Terms.
                    </p>

                    <h2>4. Property Listings</h2>
                    <p>
                        Property owners are responsible for the accuracy of their listings. ZeroRentals reserves the right to remove any
                        listing that violates our policies or contains false information.
                    </p>

                    <h2>5. Payments and Subscriptions</h2>
                    <p>
                        All subscription fees are non-refundable except as required by law. Property owners must maintain an active
                        subscription to keep their listings visible on the platform.
                    </p>

                    <h2>6. Prohibited Activities</h2>
                    <p>You agree not to:</p>
                    <ul>
                        <li>Use the platform for any illegal purpose</li>
                        <li>Post false or misleading information</li>
                        <li>Harass or harm other users</li>
                        <li>Attempt to gain unauthorized access to the platform</li>
                    </ul>

                    <h2>7. Limitation of Liability</h2>
                    <p>
                        ZeroRentals shall not be liable for any indirect, incidental, special, consequential or punitive damages resulting
                        from your use of or inability to use the service.
                    </p>

                    <h2>8. Changes to Terms</h2>
                    <p>
                        We reserve the right to modify or replace these Terms at any time. We will provide notice of any changes by posting
                        the new Terms on this page.
                    </p>

                    <h2>9. Contact Us</h2>
                    <p>
                        If you have any questions about these Terms, please contact us at{" "}
                        <a href="mailto:legal@zerorentals.com" className="text-primary hover:underline">
                            legal@zerorentals.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
