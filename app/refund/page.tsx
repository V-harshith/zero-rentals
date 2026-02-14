export default function RefundPage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="bg-primary text-primary-foreground py-16">
                <div className="container mx-auto px-4">
                    <h1 className="text-4xl font-bold mb-4">Refund Policy</h1>
                    <p className="text-primary-foreground/80">Last updated: January 10, 2026</p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <div className="prose prose-lg max-w-none">
                    <h2>1. Subscription Refunds</h2>
                    <p>
                        All subscription fees paid to ZeroRentals are generally non-refundable. However, we may provide refunds in the
                        following circumstances:
                    </p>
                    <ul>
                        <li>Technical issues preventing you from using the service</li>
                        <li>Duplicate charges or billing errors</li>
                        <li>Service cancellation within 24 hours of purchase</li>
                    </ul>

                    <h2>2. Refund Request Process</h2>
                    <p>To request a refund:</p>
                    <ol>
                        <li>Contact our support team at support@zerorentals.com</li>
                        <li>Provide your account details and reason for refund</li>
                        <li>Include any relevant documentation or screenshots</li>
                        <li>Allow 5-7 business days for review</li>
                    </ol>

                    <h2>3. Refund Timeline</h2>
                    <p>
                        If your refund is approved, it will be processed within 7-10 business days. The refund will be credited to your
                        original payment method.
                    </p>

                    <h2>4. Partial Refunds</h2>
                    <p>
                        In some cases, we may offer partial refunds based on the unused portion of your subscription. This is evaluated on
                        a case-by-case basis.
                    </p>

                    <h2>5. Non-Refundable Items</h2>
                    <p>The following are not eligible for refunds:</p>
                    <ul>
                        <li>Subscriptions used for more than 7 days</li>
                        <li>Promotional or discounted subscriptions</li>
                        <li>Services already rendered</li>
                    </ul>

                    <h2>6. Chargebacks</h2>
                    <p>
                        If you initiate a chargeback with your payment provider, your account may be suspended pending investigation. We
                        encourage you to contact us first to resolve any billing disputes.
                    </p>

                    <h2>7. Contact Us</h2>
                    <p>
                        For refund requests or questions about this policy, please contact us at{" "}
                        <a href="mailto:support@zerorentals.com" className="text-primary hover:underline">
                            support@zerorentals.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
