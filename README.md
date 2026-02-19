# ZeroRentals - Property Rental Platform

A modern, full-stack property rental platform built with Next.js, TypeScript, and Supabase. Designed for PG accommodations, co-living spaces, and rental properties in India.

## 🚀 Features

### For Tenants
- Advanced property search with filters (location, price, amenities)
- Save favorite properties
- View property details with photos and amenities
- Contact property owners directly
- Saved search preferences

### For Property Owners
- Post and manage multiple properties
- Subscription-based listing plans (Silver, Gold, Platinum, Elite)
- Property analytics and insights
- Real-time view tracking
- Manage property status and availability

### For Administrators
- Approve/reject property listings
- Manage users and subscriptions
- Platform analytics and revenue tracking
- User verification system

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Payments:** Razorpay
- **Maps:** Google Maps API
- **UI Components:** Radix UI, shadcn/ui
- **Animations:** Framer Motion

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/V-harshith/zero-rentals.git
cd zero-rentals

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

## 🔐 Environment Variables

Required environment variables (see `.env.example`):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key

# Email (Optional)
RESEND_API_KEY=your_resend_key
```

## 🗄️ Database Setup

1. Create a Supabase project
2. Run the schema migration:
   ```sql
   -- Run supabase/schema.sql in Supabase SQL Editor
   ```
3. Run additional migrations:
   ```sql
   -- Run supabase/migrations/*.sql files in order
   ```

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Setup
1. Add all environment variables in Vercel dashboard
2. Configure webhook endpoints for Razorpay
3. Ensure database migrations are run

## 📝 Subscription Plans

| Plan | Duration | Properties | Price |
|------|----------|-----------|-------|
| Silver | 1 Month | 1 | ₹1,000 |
| Gold | 3 Months | 1 | ₹2,700 |
| Platinum | 6 Months | 1 | ₹5,000 |
| Elite | 1 Year | 1 | ₹9,000 |

## 🔒 Security Features

- Row Level Security (RLS) on all database tables
- Webhook signature validation
- Input validation and sanitization
- Authentication required for sensitive operations
- Rate limiting (configurable)
- Secure image upload with size/format validation

## 📊 API Endpoints

### Properties
- `GET /api/properties` - Search properties
- `POST /api/properties` - Create property
- `GET /api/properties/[id]` - Get property details
- `PUT /api/properties/[id]` - Update property
- `DELETE /api/properties/[id]` - Delete property
- `POST /api/properties/[id]/view` - Track property view

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/verify-email` - Email verification

### Payments
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `POST /api/webhooks/razorpay` - Payment webhook

See full API documentation for complete endpoint list.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software. All rights reserved.

## 🐛 Bug Reports

Found a bug? Please open an issue with:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Screenshots (if applicable)

## 📧 Contact

For questions or support, please contact the development team.

---

**Built with ❤️ for the Indian rental market**
