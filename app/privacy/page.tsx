export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="bg-primary text-primary-foreground py-16">
                <div className="container mx-auto px-4">
                    <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
                    <p className="text-primary-foreground/80">Last updated: January 10, 2026</p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <div className="prose prose-lg max-w-none">
                    <h2>1. Information We Collect</h2>
                    <p>We collect information that you provide directly to us, including:</p>
                    <ul>
                        <li>Name, email address, and phone number</li>
                        <li>Property details and photos (for property owners)</li>
                        <li>Payment information</li>
                        <li>Communications with us and other users</li>
                    </ul>

                    <h2>2. How We Use Your Information</h2>
                    <p>We use the information we collect to:</p>
                    <ul>
                        <li>Provide, maintain, and improve our services</li>
                        <li>Process transactions and send related information</li>
                        <li>Send you technical notices and support messages</li>
                        <li>Respond to your comments and questions</li>
                        <li>Monitor and analyze trends and usage</li>
                    </ul>

                    <h2>3. Information Sharing</h2>
                    <p>
                        We do not sell your personal information. We may share your information with:
                    </p>
                    <ul>
                        <li>Other users (e.g., property owners and tenants can see each other's contact information)</li>
                        <li>Service providers who assist in our operations</li>
                        <li>Law enforcement when required by law</li>
                    </ul>

                    <h2>4. Data Security</h2>
                    <p>
                        We implement appropriate security measures to protect your personal information. However, no method of transmission
                        over the Internet is 100% secure.
                    </p>

                    <h2>5. Your Rights</h2>
                    <p>You have the right to:</p>
                    <ul>
                        <li>Access and update your personal information</li>
                        <li>Delete your account and associated data</li>
                        <li>Opt-out of marketing communications</li>
                        <li>Request a copy of your data</li>
                    </ul>

                    <h2>6. Cookies</h2>
                    <p>
                        We use cookies and similar tracking technologies to track activity on our service and hold certain information.
                    </p>

                    <h2>7. Children's Privacy</h2>
                    <p>
                        Our service is not intended for children under 18. We do not knowingly collect personal information from children.
                    </p>

                    <h2>8. Changes to This Policy</h2>
                    <p>
                        We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy
                        Policy on this page.
                    </p>

                    <h2>9. Contact Us</h2>
                    <p>
                        If you have questions about this Privacy Policy, please contact us at{" "}
                        <a href="mailto:privacy@zerorentals.com" className="text-primary hover:underline">
                            privacy@zerorentals.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
